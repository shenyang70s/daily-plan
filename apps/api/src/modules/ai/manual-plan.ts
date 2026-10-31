import { randomUUID } from 'node:crypto';
import type { Database } from '@research/persistence';
import type { ManualPlanInput, AiAction, CalendarItem } from '@research/contracts';
import { calendarDateAt, calendarWindow, shiftCalendarDate, planTaskSchedules } from '@research/domain';
import type { IdentityService, SessionContext } from '../identity/identity.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { researchSnapshot, taskSummary } from './context-builder.js';
import { AiPlanExecutor } from './plan-executor.js';
import { writeResource } from '../../common/idempotency.js';
import { AppError } from '../../common/app-error.js';
export function createManualPlan(db: Database, identity: IdentityService, ctx: SessionContext, input: ManualPlanInput, key: string, now: number): { runId: string } {
  return writeResource(db, ctx.userId, 'ai:manual-plan', key, input, tx => {
    const tasks = new TasksService(db, identity, () => now), calendar = new CalendarService(db, tasks, identity), snapshot = researchSnapshot(db, identity, ctx, now), warnings: string[] = [];
    let actions: AiAction[] = [], title: string;
    if (input.kind === 'move_block') {
      const block = calendar.getBlock(ctx, input.blockId);
      if (block.version !== input.expectedVersion) throw new AppError(409, 'VERSION_CONFLICT', '工作块已变化，请刷新日历');
      snapshot.tasks = [taskSummary(tasks.get(ctx, block.taskId))];
      const conflicts = calendar.check(ctx, { ...input.range, exclude: { kind: 'block', id: block.id } }).conflicts;
      if (conflicts.length) warnings.push(`目标时段已有冲突：${conflicts.map(c => c.title).join('、')}。请修改时段后重新预览；确认时还会再次校验。`);
      actions = [{ kind: 'block_update', id: block.id, changes: { ...input.range, expectedVersion: block.version } }]; title = '调整工作时段';
    } else {
      const selected = input.tasks.map(ref => { const task = tasks.get(ctx, ref.id); if (task.version !== ref.expectedVersion) throw new AppError(409, 'VERSION_CONFLICT', '选中的任务已变化，请重新选择'); return task; });
      snapshot.tasks = selected.map(taskSummary);
      if (input.kind === 'schedule') {
        const today = calendarDateAt(new Date(now).toISOString(), snapshot.preferences.timezone);
        if (input.fromDate < today || input.throughDate < input.fromDate || input.throughDate > shiftCalendarDate(input.fromDate, 6)) throw new AppError(422, 'AI_PLAN_RANGE', '请选择从今天起最多七天的有效安排范围');
        const eligible = selected.filter(t => { const active = !t.archivedAt && !['done','canceled'].includes(t.status) && !t.scheduleBlocks.some(b => Date.parse(b.endAt) > now); if (!active) warnings.push(`“${t.title}”已结束、归档或已有未来工作块，本次不重复安排。`); return active; });
        const items = calendar.list(ctx, { from: calendarWindow(input.fromDate, 'day', snapshot.preferences.timezone).from, to: calendarWindow(input.throughDate, 'day', snapshot.preferences.timezone).to, timezone: snapshot.preferences.timezone }).items.filter((i): i is CalendarItem => 'kind' in i);
        const result = planTaskSchedules({ ...snapshot.preferences, now, fromDate: input.fromDate, throughDate: input.throughDate, items, tasks: eligible });
        for (const item of result.scheduled) { const task = selected.find(t => t.id === item.taskId)!; actions.push({ kind: 'block_create', input: { ...item.range, taskId: task.id, expectedTaskVersion: task.version } }); if (!task.durationMinutes) warnings.push(`“${task.title}”暂按30分钟安排。`); }
        for (const item of result.unplanned) warnings.push(`“${selected.find(t => t.id === item.taskId)!.title}”：${item.reason}`);
        title = '按优先级安排所选任务';
      } else {
        if (input.operation === 'postpone' && input.due === undefined) throw new AppError(400, 'DUE_REQUIRED', '请明确指定新的截止期限');
        actions = selected.map(t => input.operation === 'delete' ? { kind: 'task_delete', id: t.id, expectedVersion: t.version } : { kind: 'task_update', id: t.id, changes: { expectedVersion: t.version, ...(input.operation === 'complete' ? { status: 'done' as const } : { due: input.due! }) } });
        title = input.operation === 'delete' ? '删除所选任务' : input.operation === 'complete' ? '完成所选任务' : '调整所选任务期限';
      }
    }
    const prepared = actions.length ? new AiPlanExecutor(db, identity, () => now).prepare(ctx, actions, snapshot) : null;
    const result = prepared ? { kind: 'plan', title, explanation: '按所选目标和真实数据生成；确认后统一执行，时间或版本变化会重新校验。', assumptions: [], ...prepared, warnings: [...prepared.warnings, ...warnings], contextSummary: `${snapshot.summary}；本次精确选择 ${snapshot.tasks.length} 项任务` } : { kind: 'clarification', question: warnings.join('\n') || '没有可执行的任务安排。' };
    const id = randomUUID();
    tx.run("INSERT INTO ai_runs(id,user_id,session_id,request_id,input_text,intent,origin,status,phase,result_json,context_json,created_at,updated_at) VALUES(?,?,?,?,?,'assist','manual','succeeded','completed',?,?,?,?)", id, ctx.userId, ctx.sessionId, randomUUID(), title, JSON.stringify(result), JSON.stringify(snapshot), now, now);
    return { runId: id };
  });
}
