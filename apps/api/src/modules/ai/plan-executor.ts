import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { prepareUndo } from './undo-execution.js';
import { AiActionSchema, CreateTaskSchema, CreateReminderSchema, CreateMilestoneSchema } from '@research/contracts';
import type { AiAction, AiDeleteChallenge, AiExecutionDto, AiImpact, AiPlan, CalendarRange, CalendarItem, TaskDto } from '@research/contracts';
import type { Database, Transaction } from '@research/persistence';
import { calendarDateAt, calendarWindow, shiftCalendarDate, suggestSchedule, calendarTimezone } from '@research/domain';
import type { SessionContext, IdentityService } from '../identity/identity.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { SubmissionsService } from '../submissions/submissions.service.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { AppError } from '../../common/app-error.js';
import { writeResource } from '../../common/idempotency.js';
import type { ResearchSnapshot } from './context-builder.js';
const labels: Record<AiAction['kind'], string> = { task_delete: '删除任务', task_create: '创建任务', task_update: '修改任务', block_create: '安排工作块', block_update: '调整工作块', event_create: '创建固定事件', event_update: '修改固定事件', project_create: '创建课题', project_update: '修改课题', submission_create: '创建投稿', submission_update: '修改投稿', reminder_create: '创建提醒', reminder_update: '调整提醒', reminder_cancel: '取消提醒' };
const states: Record<string, string> = { inbox: '收集箱', todo: '待办', in_progress: '进行中', done: '已完成', canceled: '已取消', low: '低', normal: '普通', high: '高', planning: '计划中', preparing: '准备中', submitted: '已投稿', under_review: '审稿中', pending: '待提醒', sent: '已提醒', deleted: '删除后可在24小时内恢复', experiment: '实验', paper_reading: '论文阅读', learning: '知识学习', research: '科研杂项', meeting_prep: '会议准备', personal: '个人事项', other: '其他', internal_review: '内部审阅', rebuttal: '答辩', decision: '结果待定', accepted: '录用', rejected: '拒稿', withdrawn: '撤稿' };
function describe(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const v = value as Record<string, unknown>, lines: string[] = [];
  for (const [key, name] of Object.entries({ title: '标题', name: '名称', status: '状态', priority: '优先级', stage: '投稿阶段', nextAction: '下一步', durationMinutes: '预计分钟', startAt: '开始', endAt: '结束', timezone: '时区', scheduledFor: '提醒时刻', offsetMinutes: '提前分钟', dateTime: '日期提醒钟点', at: '提醒时刻', location: '地点', type: '任务类型', note: '备注', externalUrl: '外部链接', submissionUrl: '投稿链接', draftUrl: '稿件链接', year: '年份', round: '轮次', projectId: '课题' })) if (key in v) lines.push(`${name}：${v[key] == null || v[key] === '' ? '清空/不设置' : states[String(v[key])] ?? String(v[key])}`);
  if ('due' in v) { const due = v.due as TaskDto['due']; lines.push(`截止：${due ? due.kind === 'date' ? due.date : `${due.at} · ${due.timezone}` : '不设置'}`); }
  if (v.schedule) lines.push(...describe(v.schedule));
  if (v.preparationTask) lines.push(`同时创建准备任务：${describe(v.preparationTask).join('；')}`);
  if (v.policy) { const p = v.policy as Record<string, unknown>; lines.push(p.kind === 'absolute' ? `提醒时刻：${p.at} · ${p.timezone}` : `在${p.kind === 'before_start' ? '开始' : '截止'}前 ${p.minutes} 分钟提醒`); }
  if (Array.isArray(v.milestones)) for (const m of v.milestones) lines.push(`投稿节点：${m.kind} ${describe({ due: m.due }).join('')}`);
  return lines;
}
export class AiPlanExecutor {
  constructor(private readonly db: Database, private readonly identity: IdentityService, private readonly now: () => number = Date.now) {}
  private services(db = this.db) { const tasks = new TasksService(db, this.identity, this.now); return { tasks, calendar: new CalendarService(db, tasks, this.identity), submissions: new SubmissionsService(db, this.identity, this.now), reminders: new RemindersService(db, this.now) }; }
  private before(ctx: SessionContext, a: AiAction): unknown {
    const { tasks, calendar, submissions } = this.services();
    if (a.kind === 'task_update' || a.kind === 'task_delete') return tasks.get(ctx, a.id);
    if (a.kind === 'block_update') return calendar.getBlock(ctx, a.id);
    if (a.kind === 'event_update') return calendar.getEvent(ctx, a.id);
    if (a.kind === 'project_update') return tasks.getProject(ctx, a.id);
    if (a.kind === 'submission_update') return submissions.get(ctx, a.id);
    if (a.kind === 'reminder_update' || a.kind === 'reminder_cancel') { const r = this.db.get('SELECT id,version,scheduled_for,timezone,status FROM reminders WHERE id=? AND user_id=?', a.id, ctx.userId); if (!r) throw new AppError(404, 'REMINDER_NOT_FOUND', '提醒不存在'); return { ...r, scheduledFor: new Date(Number(r.scheduled_for)).toISOString() }; }
    return null;
  }
  prepare(ctx: SessionContext, actions: AiAction[], snapshot: ResearchSnapshot): { actions: AiAction[]; impacts: AiImpact[]; warnings: string[]; dependencies: AiPlan['dependencies'] } {
    const { calendar } = this.services(), preferences = snapshot.preferences, reserved: { kind: string; startAt?: string; endAt?: string }[] = [], warnings: string[] = [], impacts: AiImpact[] = [];
    const known = new Map<string, number>();
    for (const t of snapshot.tasks) { known.set(`task:${t.id}`, t.version); for (const b of t.scheduleBlocks) known.set(`block:${b.id}`, b.version); }
    for (const p of snapshot.projects) known.set(`project:${p.id}`, p.version);
    for (const c of snapshot.calendar) known.set(`${c.kind === 'milestone' ? 'milestone' : c.kind}:${c.resourceId}`, c.version);
    for (const s of snapshot.submissions) { known.set(`submission:${s.id}`, s.version); for (const m of s.milestones) known.set(`milestone:${m.id}`, m.version); }
    for (const r of snapshot.reminders) known.set(`reminder:${r.id}`, r.version);
    if (snapshot.scope) { const resource = snapshot.scope.resource as { version: number; scheduleBlocks?: { id: string; version: number }[]; milestones?: { id: string; version: number }[] }; known.set(`${snapshot.scope.type}:${snapshot.scope.id}`, resource.version); for (const b of resource?.scheduleBlocks ?? []) known.set(`block:${b.id}`, b.version); for (const m of resource?.milestones ?? []) known.set(`milestone:${m.id}`, m.version); }
    const dependencies: AiPlan['dependencies'] = [], changed = new Set<string>();
    const reference = (type: string, id: string, index: number) => {
      if (id.startsWith('new:')) { const at = Number(id.slice(4)), previous = actions[at]; if (at >= index || at < 0 || previous?.kind !== `${type}_create`) throw new AppError(422, 'AI_INVALID_REFERENCE', '新记录引用必须指向本方案中前面的同类创建操作'); }
      else {
        if (!known.has(`${type}:${id}`)) throw new AppError(422, 'AI_CONTEXT_REFERENCE', '方案引用的记录不在当前上下文中，请打开目标详情后重新规划');
        const table = ({ task: 'tasks', block: 'task_schedule_blocks', event: 'calendar_events', project: 'projects', submission: 'submissions', milestone: 'submission_milestones', reminder: 'reminders' } as Record<string, string>)[type];
        const row = table ? this.db.get(`SELECT version FROM ${table} WHERE id=? AND user_id=?`, id, ctx.userId) : undefined;
        if (!row) throw new AppError(404, 'AI_RESOURCE_NOT_FOUND', '方案目标已不存在');
        if (row.version !== known.get(`${type}:${id}`)) throw new AppError(409, 'VERSION_CONFLICT', '推理期间目标记录已变化，请根据最新数据重新生成');
        if (!dependencies.some(d => d.type === type && d.id === id)) dependencies.push({ type, id, version: known.get(`${type}:${id}`)! });
      }
    };
    const describeForUser = (value: unknown) => {
      if (!value || typeof value !== 'object') return describe(value);
      const record = { ...(value as Record<string, unknown>) };
      if (typeof record.projectId === 'string') {
        const id = record.projectId, action = id.startsWith('new:') ? actions[Number(id.slice(4))] : undefined;
        record.projectId = action?.kind === 'project_create' ? action.project.name : snapshot.projects.find(p => p.id === id)?.name ?? this.services().tasks.getProject(ctx, id).name;
      }
      return describe(record);
    };
    const targetTitle = (type: string, id: string): string => {
      if (id.startsWith('new:')) { const at = Number(id.slice(4)), a = actions[at]; return `本方案第${at + 1}项 · ${a?.kind === 'task_create' ? a.task.title : a?.kind === 'event_create' ? a.event.title : '新记录'}`; }
      if (type === 'task') return this.services().tasks.get(ctx, id).title;
      if (type === 'event') return calendar.getEvent(ctx, id).title;
      const submission = snapshot.submissions.find(s => s.milestones.some(m => m.id === id)); return `${submission?.name ?? '当前投稿'}的截止节点`;
    };
    const normalized = actions.map((raw, index) => {
      const a = AiActionSchema.parse(raw);
      if ('id' in a) { const type = a.kind.split('_')[0]!; reference(type, a.id, index); if (changed.has(`${type}:${a.id}`)) throw new AppError(422, 'AI_DUPLICATE_TARGET', '同一方案请合并对同一记录的修改'); changed.add(`${type}:${a.id}`); }
      if (a.kind === 'block_create') reference('task', a.input.taskId, index);
      if (a.kind === 'task_create' && a.task.projectId) reference('project', a.task.projectId, index);
      if (a.kind === 'task_update' && a.changes.projectId) reference('project', a.changes.projectId, index);
      if (a.kind === 'reminder_create') reference(a.targetType, a.targetId, index);
      if (a.kind === 'block_update') reference('task', calendar.getBlock(ctx, a.id).taskId, index);
      const before = this.before(ctx, a) as { version?: number } | null;
      const expected = 'changes' in a ? a.changes.expectedVersion : a.kind === 'reminder_cancel' || a.kind === 'task_delete' ? a.expectedVersion : undefined;
      if (before && expected !== before.version) throw new AppError(409, 'VERSION_CONFLICT', '方案依据的记录版本已变化，请重新生成');
      if (a.kind === 'task_create' && a.autoSchedule && !a.schedule) {
        if (a.task.durationMinutes == null || a.task.durationMinutes === 0) { a.task.durationMinutes = 30; warnings.push(`“${a.task.title}”未给出有效预计时长，暂按30分钟安排。`); }
        const today = a.preferredDate ?? calendarDateAt(new Date(this.now()).toISOString(), preferences.timezone), from = calendarWindow(today, 'day', preferences.timezone).from, to = calendarWindow(shiftCalendarDate(today, a.preferredDate ? 0 : 6), 'day', preferences.timezone).to;
        const items = calendar.list(ctx, { from, to, timezone: preferences.timezone }).items.filter((item): item is CalendarItem => 'kind' in item);
        const suggested = suggestSchedule({ ...preferences, now: this.now(), durationMinutes: a.task.durationMinutes, ...(a.preferredDate ? { preferredDate: a.preferredDate } : {}), due: a.task.due, items: [...items, ...reserved] });
        if (suggested) a.schedule = suggested; else warnings.push(`“${a.task.title}”没有符合约束的空档，将仅创建未安排任务。`);
      }
      const range = a.kind === 'task_create' ? a.schedule : a.kind === 'event_create' ? a.event : a.kind === 'block_create' ? a.input : a.kind === 'block_update' ? a.changes : a.kind === 'event_update' ? { ...(before as CalendarRange | null), ...a.changes } : undefined;
      if (range && 'startAt' in range && range.startAt && range.endAt) { calendarTimezone(range.timezone!); if (Date.parse(range.startAt) <= this.now() || Date.parse(range.endAt) <= Date.parse(range.startAt)) throw new AppError(422, 'AI_INVALID_SCHEDULE', '请设置未来的有效工作时段'); reserved.push({ kind: 'block', startAt: range.startAt, endAt: range.endAt }); }
      const after = a.kind === 'task_delete' ? { status: 'deleted', note: `工作块将从日历隐藏，待触发提醒将取消；24小时内可在无后续修改时撤销。` } : a.kind === 'task_create' ? { ...a.task, schedule: a.schedule } : a.kind === 'event_create' ? a.event : a.kind === 'project_create' ? a.project : a.kind === 'submission_create' ? { ...a.submission, milestones: a.milestones } : a.kind === 'reminder_create' ? { title: targetTitle(a.targetType, a.targetId), policy: a.policy } : a.kind === 'block_create' ? { ...a.input, title: this.services().tasks.get(ctx, a.input.taskId).title } : a.kind === 'reminder_cancel' ? { status: 'canceled' } : a.changes;
      const existing = before as { title?: string; name?: string } | null;
      impacts.push({ label: `${labels[a.kind]}${existing?.title || existing?.name ? ` · ${existing.title ?? existing.name}` : ''}`, before: describeForUser(before), after: describeForUser(after) });
      return a;
    });
    return { actions: normalized, impacts, warnings, dependencies };
  }
  deletionConfirmation(ctx: SessionContext, runId: string, key: string): AiDeleteChallenge {
    return writeResource(this.db, ctx.userId, `ai:delete-review:${runId}`, key, { runId }, tx => {
      const row = tx.get('SELECT status,result_json,created_at FROM ai_runs WHERE id=? AND user_id=?', runId, ctx.userId);
      if (!row) throw new AppError(404, 'AI_RUN_NOT_FOUND', '找不到这次方案');
      const plan = row.result_json ? JSON.parse(String(row.result_json)) as AiPlan : null;
      const count = plan?.kind === 'plan' ? plan.actions.filter(a => a.kind === 'task_delete').length : 0;
      if (row.status !== 'succeeded' || !count || this.now() - Number(row.created_at) >= 1800000 || tx.get('SELECT id FROM ai_runs WHERE parent_run_id=? AND user_id=?', runId, ctx.userId)) throw new AppError(409, 'AI_DELETE_REVIEW_UNAVAILABLE', '请重新生成有效的删除预览');
      const token = randomBytes(32).toString('hex'), expires = this.now() + 300000;
      tx.run('INSERT INTO ai_delete_confirmations(run_id,user_id,token_hash,expires_at) VALUES(?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at', runId, ctx.userId, createHash('sha256').update(token).digest('hex'), expires);
      return { token, count, expiresAt: new Date(expires).toISOString() };
    });
  }
  execute(ctx: SessionContext, runId: string, key: string, deletionToken?: string, acknowledgement?: string): AiExecutionDto {
    return writeResource(this.db, ctx.userId, `ai:confirm:${runId}`, key, { runId, ...(deletionToken ? { deletionToken, acknowledgement } : {}) }, tx => {
      const row = tx.get('SELECT * FROM ai_runs WHERE id=? AND user_id=?', runId, ctx.userId);
      if (!row) throw new AppError(404, 'AI_RUN_NOT_FOUND', '找不到这次 AI 方案');
      const prior = tx.get('SELECT result_json FROM ai_executions WHERE run_id=? AND user_id=?', runId, ctx.userId); if (prior) return JSON.parse(String(prior.result_json)) as AiExecutionDto;
      if (tx.get('SELECT id FROM ai_runs WHERE parent_run_id=? AND user_id=?', runId, ctx.userId)) throw new AppError(409, 'AI_PLAN_SUPERSEDED', '方案已进入下一轮，请确认最新方案');
      const plan = row.result_json ? JSON.parse(String(row.result_json)) as AiPlan : null;
      if (row.status !== 'succeeded' || plan?.kind !== 'plan') throw new AppError(422, 'AI_PLAN_REQUIRED', '请先生成可确认的方案');
      if (this.now() - Number(row.created_at) > 30 * 60000) throw new AppError(409, 'AI_PLAN_EXPIRED', '方案已超过30分钟，请根据最新数据重新生成');
      const deleteCount = plan.actions.filter(a => a.kind === 'task_delete').length;
      if (deleteCount) {
        const proof = tx.get('SELECT token_hash,expires_at FROM ai_delete_confirmations WHERE run_id=? AND user_id=?', runId, ctx.userId);
        if (!deletionToken || acknowledgement !== `删除${deleteCount}项任务` || !proof || Number(proof.expires_at) <= this.now() || proof.token_hash !== createHash('sha256').update(deletionToken).digest('hex')) throw new AppError(409, 'AI_DELETE_CONFIRMATION_REQUIRED', '请完成第二次删除核对并输入准确任务数量');
      }
      for (const dependency of plan.dependencies) {
        const table = ({ task: 'tasks', block: 'task_schedule_blocks', event: 'calendar_events', project: 'projects', submission: 'submissions', milestone: 'submission_milestones', reminder: 'reminders' } as Record<string, string>)[dependency.type];
        const current = table ? tx.get(`SELECT version FROM ${table} WHERE id=? AND user_id=?`, dependency.id, ctx.userId) : undefined;
        if (!current || current.version !== dependency.version) throw new AppError(409, 'VERSION_CONFLICT', '方案引用的记录已变化，请根据最新数据重新生成');
      }
      // Service writes share this transaction. The database's general nested-transaction guard stays intact.
      const scoped: Database = { get: tx.get, all: tx.all, withTransaction: callback => callback(tx), ready: () => true, close: () => { throw new Error('Cannot close scoped transaction'); } };
      const services = this.services(scoped), results: { id: string; label: string; href: string }[] = [];
      for (const action of plan.actions) {
        const a = action, before = this.before(ctx, a) as CalendarRange | null;
        const range = a.kind === 'task_create' ? a.schedule : a.kind === 'event_create' ? a.event : a.kind === 'block_create' ? a.input : a.kind === 'block_update' ? a.changes : a.kind === 'event_update' ? { ...before, ...a.changes } : undefined;
        if (range?.startAt && Date.parse(range.startAt) <= this.now()) throw new AppError(409, 'AI_SCHEDULE_EXPIRED', '预览中的时段已开始，请重新生成未来安排');
      }
      const execution: AiExecutionDto = { runId, executedAt: new Date(this.now()).toISOString(), items: results };
      tx.run('INSERT INTO ai_executions(run_id,user_id,result_json,created_at) VALUES(?,?,?,?)', runId, ctx.userId, '{}', this.now());
      for (const [index, action] of plan.actions.entries()) {
        const a = AiActionSchema.parse(action), before = this.before(ctx, a), auditBefore = a.kind === 'block_create' || a.kind === 'block_update' ? { resource: before, parentTask: services.tasks.get(ctx, a.kind === 'block_create' ? a.input.taskId : (before as { taskId: string }).taskId) } : before, actionKey = `${runId}:${index}`, resolve = (id: string) => id.startsWith('new:') ? results[Number(id.slice(4))]!.id : id;
        let result: unknown, id: string, href: string;
        if (a.kind === 'task_create') { const task = CreateTaskSchema.parse({ ...a.task, projectId: a.task.projectId ? resolve(a.task.projectId) : null }); result = a.schedule ? services.calendar.createTask(ctx, { task, schedule: a.schedule }, actionKey).task : services.tasks.create(ctx, task, actionKey); id = (result as TaskDto).id; href = `/tasks/${id}`; }
        else if (a.kind === 'task_delete') { result = services.tasks.remove(ctx, a.id, { expectedVersion: a.expectedVersion }, actionKey); id = a.id; href = '/tasks'; }
        else if (a.kind === 'task_update') { result = services.tasks.update(ctx, a.id, a.changes, actionKey); id = a.id; href = `/tasks/${id}`; }
        else if (a.kind === 'block_create') { result = services.calendar.createBlock(ctx, a.input, actionKey); id = resultId(result); href = `/calendar/blocks/${id}`; }
        else if (a.kind === 'block_update') { result = services.calendar.updateBlock(ctx, a.id, a.changes, actionKey); id = a.id; href = `/calendar/blocks/${id}`; }
        else if (a.kind === 'event_create') { result = services.calendar.createEvent(ctx, a.event, actionKey); id = resultId(result); href = `/calendar/events/${id}`; }
        else if (a.kind === 'event_update') { result = services.calendar.updateEvent(ctx, a.id, a.changes, actionKey); id = a.id; href = `/calendar/events/${id}`; }
        else if (a.kind === 'project_create') { result = services.tasks.createProject(ctx, a.project, actionKey); id = resultId(result); href = '/tasks'; }
        else if (a.kind === 'project_update') { result = services.tasks.updateProject(ctx, a.id, a.changes, actionKey); id = a.id; href = '/tasks'; }
        else if (a.kind === 'submission_create') { const submission = services.submissions.create(ctx, a.submission, actionKey); id = submission.id; for (const [m, milestone] of a.milestones.entries()) services.submissions.createMilestone(ctx, id, CreateMilestoneSchema.parse({ ...milestone, expectedSubmissionVersion: services.submissions.get(ctx, id).version }), `${actionKey}:milestone:${m}`); result = services.submissions.get(ctx, id); href = `/submissions/${id}`; }
        else if (a.kind === 'submission_update') { result = services.submissions.update(ctx, a.id, a.changes, actionKey); id = a.id; href = `/submissions/${id}`; }
        else if (a.kind === 'reminder_create') {
          const targetId = resolve(a.targetId), policy = a.policy, timezone = this.identity.getPreferences(ctx).timezone;
          let time: Record<string, unknown>;
          if (policy.kind === 'absolute') time = { mode: 'absolute', at: policy.at, timezone: policy.timezone };
          else if (policy.kind === 'before_deadline') time = { mode: 'relative', offsetMinutes: policy.minutes, timezone, ...(policy.dateTime ? { dateTime: policy.dateTime } : {}) };
          else { let start: string; if (a.targetType === 'event') start = services.calendar.getEvent(ctx, targetId).startAt; else if (a.targetType === 'task') { const blocks = services.tasks.get(ctx, targetId).scheduleBlocks; if (blocks.length !== 1) throw new AppError(422, 'AI_REMINDER_START', '目标须有唯一工作块才能按开始时间提醒，请明确提醒时刻'); start = blocks[0]!.startAt; } else throw new AppError(422, 'AI_REMINDER_START', '截止节点请使用截止前提醒'); time = { mode: 'absolute', at: new Date(Date.parse(start) - policy.minutes * 60000).toISOString(), timezone }; }
          result = services.reminders.create(ctx, CreateReminderSchema.parse({ targetType: a.targetType, targetId, ...time }), actionKey); id = resultId(result); href = a.targetType === 'task' ? `/tasks/${targetId}` : a.targetType === 'event' ? `/calendar/events/${targetId}` : '/calendar';
        } else if (a.kind === 'reminder_update') { result = services.reminders.update(ctx, a.id, a.changes, actionKey); id = a.id; href = '/today'; }
        else { result = services.reminders.cancel(ctx, a.id, { expectedVersion: a.expectedVersion }, actionKey); id = a.id; href = '/today'; }
        results.push({ id, href, label: `${labels[a.kind]}：${resultTitle(result)}` });
        tx.run('INSERT INTO ai_action_audits(id,run_id,user_id,action_index,action_json,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)', randomUUID(), runId, ctx.userId, index, JSON.stringify(a), JSON.stringify(auditBefore), JSON.stringify(result), this.now());
      }
      const undo = prepareUndo(tx, ctx, runId, this.now(), plan.actions); if (undo) execution.undo = undo;
      tx.run('UPDATE ai_executions SET result_json=? WHERE run_id=? AND user_id=?', JSON.stringify(execution), runId, ctx.userId);
      return execution;
    });
  }
}
function resultId(value: unknown): string { return String((value as { id: string }).id); }
function resultTitle(value: unknown): string { const v = value as { title?: string; name?: string; scheduledFor?: string }; return v.title ?? v.name ?? v.scheduledFor ?? '已完成'; }
