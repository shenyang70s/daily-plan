import { randomUUID } from 'node:crypto';
import { assertTransition } from '@research/domain';
import { taskRecord, taskRecords, taskBlocks, insertTask, updateTask, projectRecord, projectRecords, insertProject, renameProject, deleteProject } from '@research/persistence';
import type { Database, Transaction, SqlValue, Row } from '@research/persistence';
import type { CreateTaskInput, UpdateTaskInput, TaskDto, TaskDue, TaskStatus, TaskListInput, RescheduleTaskInput, ProjectDto } from '@research/contracts';
import type { SessionContext, IdentityService } from '../identity/identity.service.js';
import { AppError } from '../../common/app-error.js';
import { writeResource } from '../../common/idempotency.js';
import { paginate } from './pagination.js';

const iso = (value: unknown): string => new Date(Number(value)).toISOString();
const nullableIso = (value: unknown): string | null => value == null ? null : iso(value);
const nullableString = (value: unknown): string | null => value == null ? null : String(value);
export function localDateAt(time: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time);
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)!.value).join('-');
}

export class TasksService {
  constructor(private readonly db: Database, private readonly identity: IdentityService, private readonly now: () => number = Date.now) {}
  private requireTask(reader: Pick<Transaction, 'get'>, userId: string, id: string, deleted = false): Row {
    const row = taskRecord(reader, userId, id);
    if (!row || (!deleted && row.deleted_at != null)) throw new AppError(404, 'TASK_NOT_FOUND', '找不到这项任务');
    return row;
  }
  private requireProject(reader: Pick<Transaction, 'get'>, userId: string, id: string): Row {
    const row = projectRecord(reader, userId, id);
    if (!row) throw new AppError(404, 'PROJECT_NOT_FOUND', '找不到这个课题');
    return row;
  }
  private version(row: Row, expected: number): void {
    if (row.version !== expected) throw new AppError(409, 'VERSION_CONFLICT', '记录已被更新，请刷新后再试');
  }
  private dueColumns(due: TaskDue): Record<string, SqlValue> {
    if (due?.kind === 'instant') {
      try { new Intl.DateTimeFormat('en', { timeZone: due.timezone }).format(); }
      catch { throw new AppError(400, 'INVALID_TIMEZONE', '请提供有效的 IANA 时区'); }
    }
    return { due_date: due?.kind === 'date' ? due.date : null, due_at: due?.kind === 'instant' ? Date.parse(due.at) : null, timezone: due?.kind === 'instant' ? due.timezone : null };
  }
  private dto(row: Row, reader: Pick<Transaction, 'all'> = this.db, blocks?: Row[]): TaskDto {
    const schedule = (blocks ?? taskBlocks(reader, String(row.user_id))).filter(block => block.task_id === row.id);
    return {
      id: String(row.id), title: String(row.title), type: row.type as TaskDto['type'], status: row.status as TaskStatus,
      priority: row.priority as TaskDto['priority'], due: row.due_date != null ? { kind: 'date', date: String(row.due_date) } : row.due_at != null ? { kind: 'instant', at: iso(row.due_at), timezone: String(row.timezone) } : null,
      durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes), projectId: nullableString(row.project_id), note: String(row.note), externalUrl: nullableString(row.external_url),
      createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), completedAt: nullableIso(row.completed_at), archivedAt: nullableIso(row.archived_at), deletedAt: nullableIso(row.deleted_at), version: Number(row.version),
      scheduleBlocks: schedule.map(block => ({ id: String(block.id), startAt: iso(block.start_at), endAt: iso(block.end_at), timezone: String(block.timezone), version: Number(block.version) })),
    };
  }
  get(ctx: SessionContext, id: string): TaskDto { return this.dto(this.requireTask(this.db, ctx.userId, id)); }
  list(ctx: SessionContext, input: TaskListInput) {
    const timezone = this.identity.getPreferences(ctx).timezone, now = this.now(), today = localDateAt(now, timezone);
    const blocks = taskBlocks(this.db, ctx.userId);
    const items = taskRecords(this.db, ctx.userId).map(row => this.dto(row, this.db, blocks)).filter(task => {
      if (!!task.archivedAt !== (input.archived === 'true')) return false;
      if (input.status && task.status !== input.status || input.type && task.type !== input.type || input.priority && task.priority !== input.priority || input.projectId && task.projectId !== input.projectId) return false;
      if (input.q && !`${task.title}\n${task.note}`.toLocaleLowerCase().includes(input.q.toLocaleLowerCase())) return false;
      const dueDate = task.due?.kind === 'date' ? task.due.date : task.due?.kind === 'instant' ? localDateAt(Date.parse(task.due.at), timezone) : null;
      const overdue = !!task.due && !['done', 'canceled'].includes(task.status) && (task.due.kind === 'date' ? task.due.date < today : Date.parse(task.due.at) < now);
      if (input.dueFrom && (!dueDate || dueDate < input.dueFrom) || input.dueTo && (!dueDate || dueDate > input.dueTo)) return false;
      if (input.due === 'none' && task.due || input.due === 'today' && dueDate !== today || input.due === 'overdue' && !overdue) return false;
      if (input.view === 'inbox' && task.status !== 'inbox') return false;
      if (input.view === 'today') {
        if (task.status === 'done') return !!task.completedAt && localDateAt(Date.parse(task.completedAt), timezone) === today;
        if (task.status === 'canceled') return false;
        const scheduled = task.scheduleBlocks.some(block => localDateAt(Date.parse(block.startAt), timezone) <= today && localDateAt(Date.parse(block.endAt) - 1, timezone) >= today);
        return !!dueDate && dueDate <= today || scheduled;
      }
      return true;
    });
    return paginate(items, input.limit, input.cursor);
  }
  create(ctx: SessionContext, input: CreateTaskInput, key: string): TaskDto {
    return writeResource(this.db, ctx.userId, 'tasks:create', key, input, tx => {
      if (input.projectId) this.requireProject(tx, ctx.userId, input.projectId);
      const now = this.now(), id = randomUUID();
      insertTask(tx, { id, user_id: ctx.userId, title: input.title, type: input.type, status: input.due ? 'todo' : 'inbox', priority: input.priority, ...this.dueColumns(input.due), duration_minutes: input.durationMinutes, project_id: input.projectId, note: input.note, external_url: input.externalUrl, created_at: now, updated_at: now });
      return this.dto(this.requireTask(tx, ctx.userId, id), tx, []);
    });
  }
  update(ctx: SessionContext, id: string, input: UpdateTaskInput, key: string): TaskDto {
    return this.change(ctx, id, 'update', input, key, (row, tx) => {
      if (input.projectId) this.requireProject(tx, ctx.userId, input.projectId);
      const values: Record<string, SqlValue> = {};
      const fields = { title: 'title', type: 'type', priority: 'priority', note: 'note', externalUrl: 'external_url', durationMinutes: 'duration_minutes', projectId: 'project_id' } as const;
      for (const [name, column] of Object.entries(fields)) {
        const value = input[name as keyof typeof fields];
        if (value !== undefined) values[column] = value;
      }
      if (input.due !== undefined) Object.assign(values, this.dueColumns(input.due));
      if (input.status !== undefined) Object.assign(values, this.statusValues(row, input.status));
      return values;
    });
  }
  private statusValues(row: Row, status: TaskStatus): Record<string, SqlValue> {
    try {
      if (row.status === 'inbox' && status === 'done') { assertTransition('inbox', 'todo'); assertTransition('todo', 'done'); }
      else assertTransition(row.status as TaskStatus, status);
    } catch { throw new AppError(422, 'INVALID_TRANSITION', '当前状态不能直接切换，请先重新打开任务'); }
    return { status, completed_at: status === 'done' ? row.completed_at == null ? this.now() : Number(row.completed_at) : null, ...(!['done', 'canceled'].includes(status) ? { archived_at: null } : {}) };
  }
  private change(ctx: SessionContext, id: string, action: string, input: { expectedVersion: number }, key: string, values: (row: Row, tx: Transaction) => Record<string, SqlValue>, includeDeleted = false): TaskDto {
    return writeResource(this.db, ctx.userId, `tasks:${id}:${action}`, key, input, tx => {
      const row = this.requireTask(tx, ctx.userId, id, includeDeleted); this.version(row, input.expectedVersion);
      const changes = values(row, tx);
      if (!updateTask(tx, ctx.userId, id, input.expectedVersion, { ...changes, updated_at: this.now() })) throw new AppError(409, 'VERSION_CONFLICT', '记录已被更新，请刷新后再试');
      return this.dto(this.requireTask(tx, ctx.userId, id, true), tx);
    });
  }
  complete(ctx: SessionContext, id: string, input: { expectedVersion: number }, key: string) { return this.change(ctx, id, 'complete', input, key, row => this.statusValues(row, 'done')); }
  reopen(ctx: SessionContext, id: string, input: { expectedVersion: number }, key: string) { return this.change(ctx, id, 'reopen', input, key, row => this.statusValues(row, 'todo')); }
  archive(ctx: SessionContext, id: string, input: { expectedVersion: number }, key: string) {
    return this.change(ctx, id, 'archive', input, key, row => {
      if (!['done', 'canceled'].includes(String(row.status))) throw new AppError(422, 'TASK_NOT_FINISHED', '请先完成或取消任务，再归档');
      return { archived_at: row.archived_at == null ? this.now() : Number(row.archived_at) };
    });
  }
  remove(ctx: SessionContext, id: string, input: { expectedVersion: number }, key: string) { return this.change(ctx, id, 'delete', input, key, () => ({ deleted_at: this.now() })); }
  restore(ctx: SessionContext, id: string, input: { expectedVersion: number }, key: string) {
    return this.change(ctx, id, 'restore', input, key, row => {
      if (row.deleted_at == null) throw new AppError(422, 'TASK_NOT_DELETED', '任务没有被删除');
      if (this.now() - Number(row.deleted_at) > 86400000) throw new AppError(410, 'RESTORE_EXPIRED', '任务的恢复期限已过');
      return { deleted_at: null };
    }, true);
  }
  reschedule(ctx: SessionContext, id: string, input: RescheduleTaskInput, key: string) {
    return this.change(ctx, id, 'reschedule', input, key, () => {
      if (input.scope !== 'deadline') throw new AppError(422, 'SCHEDULE_BLOCKS_UNAVAILABLE', '工作块调整将在日历功能开放后接入');
      return this.dueColumns(input.due);
    });
  }
  private projectDto(row: Row): ProjectDto { return { id: String(row.id), name: String(row.name), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), version: Number(row.version) }; }
  getProject(ctx: SessionContext, id: string) { return this.projectDto(this.requireProject(this.db, ctx.userId, id)); }
  listProjects(ctx: SessionContext, input: { limit: number; cursor?: string | undefined }) { return paginate(projectRecords(this.db, ctx.userId).map(row => this.projectDto(row)), input.limit, input.cursor); }
  createProject(ctx: SessionContext, input: { name: string }, key: string) {
    return writeResource(this.db, ctx.userId, 'projects:create', key, input, tx => {
      const id = randomUUID(); insertProject(tx, ctx.userId, id, input.name, this.now());
      return this.projectDto(this.requireProject(tx, ctx.userId, id));
    });
  }
  updateProject(ctx: SessionContext, id: string, input: { name: string; expectedVersion: number }, key: string) {
    return writeResource(this.db, ctx.userId, `projects:${id}:update`, key, input, tx => {
      const row = this.requireProject(tx, ctx.userId, id); this.version(row, input.expectedVersion);
      renameProject(tx, ctx.userId, id, input.name, input.expectedVersion, this.now());
      return this.projectDto(this.requireProject(tx, ctx.userId, id));
    });
  }
  deleteProject(ctx: SessionContext, id: string, input: { expectedVersion: number }, key: string) {
    return writeResource(this.db, ctx.userId, `projects:${id}:delete`, key, input, tx => {
      const row = this.requireProject(tx, ctx.userId, id); this.version(row, input.expectedVersion);
      deleteProject(tx, ctx.userId, id, this.now()); return { id, deleted: true };
    });
  }
}
