import type { AiAction, AiExecutionDto, TaskDto, CalendarBlockDto } from '@research/contracts';
import type { Database, Transaction } from '@research/persistence';
import type { IdentityService, SessionContext } from '../identity/identity.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { AppError } from '../../common/app-error.js';
import { writeResource } from '../../common/idempotency.js';
type Guard = { kind: 'task' | 'block'; id: string; version: number };
type Audit = { action: AiAction; before: TaskDto | { resource: CalendarBlockDto | null; parentTask: TaskDto } | null; after: TaskDto | CalendarBlockDto; index: number };
type ReminderDependency = { taskId: string; rows: { id: string; policy: string; status: string }[] };
function reminderRows(tx: Transaction, ctx: SessionContext, taskId: string): ReminderDependency['rows'] {
  return tx.all('SELECT id,mode,timezone,scheduled_for,offset_minutes,date_time,status FROM reminders WHERE task_id=? AND user_id=? ORDER BY id LIMIT 501', taskId, ctx.userId).map(r => ({ id: String(r.id), status: String(r.status), policy: JSON.stringify([r.mode, r.timezone, r.offset_minutes, r.date_time, r.mode === 'absolute' ? r.scheduled_for : null]) }));
}
const tables = { task: 'tasks', block: 'task_schedule_blocks' };
export function prepareUndo(tx: Transaction, ctx: SessionContext, runId: string, now: number, actions: AiAction[]): AiExecutionDto['undo'] {
  if (!actions.every(a => ['task_create','task_update','task_delete','block_create','block_update'].includes(a.kind))) return undefined;
  const audits: Audit[] = tx.all('SELECT action_index,action_json,before_json,after_json FROM ai_action_audits WHERE run_id=? AND user_id=? ORDER BY action_index', runId, ctx.userId).map(r => ({ index: Number(r.action_index), action: JSON.parse(String(r.action_json)), before: JSON.parse(String(r.before_json)), after: JSON.parse(String(r.after_json)) }));
  const guards = new Map<string, Guard>();
  const add = (kind: Guard['kind'], id: string) => { const row = tx.get(`SELECT version FROM ${tables[kind]} WHERE id=? AND user_id=?`, id, ctx.userId); if (!row) throw new Error('Missing undo resource'); guards.set(`${kind}:${id}`, { kind, id, version: Number(row.version) }); };
  for (const audit of audits) {
    if (audit.action.kind.startsWith('task_')) { add('task', audit.after.id); for (const b of tx.all('SELECT id FROM task_schedule_blocks WHERE task_id=? AND user_id=?', audit.after.id, ctx.userId)) add('block', String(b.id)); }
    else { add('block', audit.after.id); add('task', (audit.after as CalendarBlockDto).taskId); }
  }
  const reminders = [...guards.values()].filter(g => g.kind === 'task').map(g => ({ taskId: g.id, rows: reminderRows(tx, ctx, g.id) }));
  if (reminders.some(r => r.rows.length > 500)) return undefined;
  tx.run('INSERT INTO ai_execution_undos(run_id,user_id,snapshot_json,expires_at) VALUES(?,?,?,?)', runId, ctx.userId, JSON.stringify({ guards: [...guards.values()], audits, reminders }), now + 86400000);
  return { expiresAt: new Date(now + 86400000).toISOString() };
}
export function undoExecution(db: Database, identity: IdentityService, ctx: SessionContext, runId: string, key: string, now: number): AiExecutionDto {
  return writeResource(db, ctx.userId, `ai:undo:${runId}`, key, { runId }, tx => {
    const row = tx.get('SELECT * FROM ai_execution_undos WHERE run_id=? AND user_id=?', runId, ctx.userId);
    if (!row) throw new AppError(404, 'AI_UNDO_UNAVAILABLE', '此方案不支持撤销');
    if (row.result_json) return JSON.parse(String(row.result_json)) as AiExecutionDto;
    if (Number(row.expires_at) <= now) throw new AppError(410, 'AI_UNDO_EXPIRED', '24小时撤销期限已过');
    const snapshot = JSON.parse(String(row.snapshot_json)) as { guards: Guard[]; audits: Audit[]; reminders?: ReminderDependency[] };
    for (const guard of snapshot.guards) { const current = tx.get(`SELECT version FROM ${tables[guard.kind]} WHERE id=? AND user_id=?`, guard.id, ctx.userId); if (!current || current.version !== guard.version) throw new AppError(409, 'VERSION_CONFLICT', '执行后的记录已有其他修改，不能用旧状态覆盖，请重新规划'); }
    if (!snapshot.reminders) throw new AppError(409, 'AI_UNDO_UNAVAILABLE', '此旧执行记录缺少关联校验，请通过详情手动调整');
    for (const dependency of snapshot.reminders) {
      const current = reminderRows(tx, ctx, dependency.taskId);
      if (current.length !== dependency.rows.length || current.some((r, i) => { const previous = dependency.rows[i]; return !previous || r.id !== previous.id || r.policy !== previous.policy || previous.status !== 'pending' && r.status === 'pending'; })) throw new AppError(409, 'VERSION_CONFLICT', '相关提醒已有新增或手工调整，请保留最新设置并重新规划');
    }
    const scoped: Database = { get: tx.get, all: tx.all, withTransaction: cb => cb(tx), ready: () => true, close: () => { throw new Error('Cannot close scoped transaction'); } }, tasks = new TasksService(scoped, identity, () => now), calendar = new CalendarService(scoped, tasks, identity);
    for (const audit of [...snapshot.audits].reverse()) {
      const a = audit.action, before = audit.before; let after: unknown;
      const k = `${runId}:undo:${audit.index}`;
      if (a.kind === 'task_create') after = tasks.remove(ctx, audit.after.id, { expectedVersion: tasks.get(ctx, audit.after.id).version }, k);
      else if (a.kind === 'task_update') {
        const previous = before as TaskDto, current = tasks.get(ctx, a.id);
        if (!previous.archivedAt && previous.status !== 'canceled' && (current.archivedAt || current.status === 'canceled')) for (const block of previous.scheduleBlocks) if (calendar.check(ctx, block).conflicts.length) throw new AppError(409, 'SCHEDULE_CONFLICT', '恢复任务会使原工作块与新安排冲突，请重新规划');
        after = tasks.undoFields(ctx, a.id, previous, current.version, k);
      }
      else if (a.kind === 'task_delete') {
        for (const block of (before as TaskDto).scheduleBlocks) if (calendar.check(ctx, block).conflicts.length) throw new AppError(409, 'SCHEDULE_CONFLICT', '原工作时段已被其他安排占用，无法直接撤销删除');
        const current = tx.get('SELECT version FROM tasks WHERE id=? AND user_id=?', a.id, ctx.userId)!; after = tasks.restore(ctx, a.id, { expectedVersion: Number(current.version) }, k);
      } else if (a.kind === 'block_create' || a.kind === 'block_update') {
        const current = calendar.getBlock(ctx, audit.after.id), parent = (before as { parentTask: TaskDto }).parentTask;
        if (a.kind === 'block_create') after = calendar.cancelBlock(ctx, current.id, { expectedVersion: current.version }, k);
        else { const original = (before as { resource: CalendarBlockDto }).resource; if (Date.parse(original.startAt) <= now) throw new AppError(409, 'AI_SCHEDULE_EXPIRED', '原时段已开始，请重新安排'); after = calendar.updateBlock(ctx, current.id, { startAt: original.startAt, endAt: original.endAt, timezone: original.timezone, expectedVersion: current.version }, k); }
        tasks.undoFields(ctx, parent.id, parent, tasks.get(ctx, parent.id).version, `${k}:parent`);
      }
      else throw new AppError(422, 'AI_UNDO_UNAVAILABLE', '此操作不支持撤销');
      tx.run('INSERT INTO ai_undo_audits(run_id,action_index,before_json,after_json) VALUES(?,?,?,?)', runId, audit.index, JSON.stringify(audit.after), JSON.stringify(after));
    }
    const saved = tx.get('SELECT result_json FROM ai_executions WHERE run_id=? AND user_id=?', runId, ctx.userId)!;
    const execution = JSON.parse(String(saved.result_json)) as AiExecutionDto; execution.undo = { expiresAt: new Date(Number(row.expires_at)).toISOString(), undoneAt: new Date(now).toISOString() };
    tx.run('UPDATE ai_execution_undos SET result_json=? WHERE run_id=? AND user_id=?', JSON.stringify(execution), runId, ctx.userId);
    tx.run('UPDATE ai_executions SET result_json=? WHERE run_id=? AND user_id=?', JSON.stringify(execution), runId, ctx.userId);
    return execution;
  });
}
