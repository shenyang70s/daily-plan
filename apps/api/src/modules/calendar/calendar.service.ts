import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { calendarDateAt, calendarTimezone, findConflicts } from '@research/domain';
import { eventRecord, eventRecords, blockRecord, blockRecords, preparationTasks, insertCalendarRecord, updateCalendarRecord, taskRecord, taskRecords, updateTask } from '@research/persistence';
import type { Database, Transaction, Row } from '@research/persistence';
import type { CalendarRange, CalendarQuery, CalendarItem, CalendarConflict, CalendarEventDto, CalendarBlockDto, CreateCalendarEventInput, UpdateCalendarEventInput, CreateScheduleBlockInput, UpdateScheduleBlockInput, CreateScheduledTaskInput, RescheduleTaskInput } from '@research/contracts';
import type { SessionContext, IdentityService } from '../identity/identity.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { writeResource } from '../../common/idempotency.js';
import { AppError } from '../../common/app-error.js';
type Reader = Pick<Transaction, 'get' | 'all'>;
type Candidate = CalendarRange & { id?: string; version?: number };
const iso = (value: unknown) => new Date(Number(value)).toISOString();
const rangeOf = (row: Row): CalendarRange => ({ startAt: iso(row.start_at), endAt: iso(row.end_at), timezone: String(row.timezone) });

export class CalendarService {
  private readonly confirmationSecret = randomBytes(32);
  constructor(private readonly db: Database, private readonly tasks: TasksService, private readonly identity: IdentityService) {}
  private range(input: CalendarRange): CalendarRange {
    try {
      const start = Date.parse(input.startAt), end = Date.parse(input.endAt);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 93 * 86400000) throw new Error('Invalid range');
      return { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), timezone: calendarTimezone(input.timezone) };
    } catch { throw new AppError(400, 'INVALID_TIME_RANGE', '请检查时间范围与时区，结束时间必须晚于开始时间'); }
  }
  private version(row: Row, expected: number) { if (row.version !== expected) throw new AppError(409, 'VERSION_CONFLICT', '记录已更新，请刷新最新版本'); }
  private event(reader: Reader, ctx: SessionContext, id: string): Row {
    const row = eventRecord(reader, ctx.userId, id); if (!row) throw new AppError(404, 'EVENT_NOT_FOUND', '找不到这个事件'); return row;
  }
  private block(reader: Reader, ctx: SessionContext, id: string): Row {
    const row = blockRecord(reader, ctx.userId, id); if (!row || row.status !== 'confirmed') throw new AppError(404, 'BLOCK_NOT_FOUND', '找不到这个工作块'); return row;
  }
  private activeTask(reader: Reader, ctx: SessionContext, id: string): Row {
    const row = taskRecord(reader, ctx.userId, id);
    if (!row || row.deleted_at != null) throw new AppError(404, 'TASK_NOT_FOUND', '找不到这项任务');
    if (row.archived_at != null || ['done', 'canceled'].includes(String(row.status))) throw new AppError(422, 'TASK_NOT_ACTIVE', '请先重新打开任务，再安排工作块');
    return row;
  }
  private eventDto(reader: Reader, ctx: SessionContext, row: Row): CalendarEventDto {
    return { id: String(row.id), title: String(row.title), ...rangeOf(row), location: String(row.location ?? ''), note: String(row.note), externalUrl: row.external_url == null ? null : String(row.external_url), version: Number(row.version), preparationTasks: preparationTasks(reader, ctx.userId, String(row.id)).map(task => ({ id: String(task.id), title: String(task.title) })) };
  }
  private blockDto(row: Row): CalendarBlockDto { return { id: String(row.id), taskId: String(row.task_id), title: String(row.title), taskVersion: Number(row.task_version), ...rangeOf(row), version: Number(row.version), status: row.status as CalendarBlockDto['status'] }; }
  getEvent(ctx: SessionContext, id: string) { return this.eventDto(this.db, ctx, this.event(this.db, ctx, id)); }
  getBlock(ctx: SessionContext, id: string) { return this.blockDto(this.block(this.db, ctx, id)); }
  private conflicts(reader: Reader, ctx: SessionContext, candidates: Candidate[], excluded: Set<string>): CalendarConflict[] {
    const busy = [
      ...eventRecords(reader, ctx.userId).map(row => ({ kind: 'event' as const, id: String(row.id), title: String(row.title), ...rangeOf(row), version: Number(row.version) })),
      ...blockRecords(reader, ctx.userId).map(row => ({ kind: 'block' as const, id: String(row.id), title: String(row.title), ...rangeOf(row), version: Number(row.version) })),
    ].filter(item => !excluded.has(`${item.kind}:${item.id}`));
    const found = new Map<string, CalendarConflict>();
    for (const [index, candidate] of candidates.entries()) {
      const otherCandidates = candidates.filter((_, other) => index !== other).map(item => ({ kind: 'block' as const, id: item.id!, title: '本次调整的工作块', startAt: item.startAt, endAt: item.endAt, version: item.version ?? 1 }));
      const ranges = [...busy, ...otherCandidates].map(item => ({ ...item, startAt: Date.parse(item.startAt), endAt: Date.parse(item.endAt) }));
      for (const match of findConflicts({ startAt: Date.parse(candidate.startAt), endAt: Date.parse(candidate.endAt) }, ranges)) found.set(`${match.kind}:${match.id}`, { ...match, startAt: iso(match.startAt), endAt: iso(match.endAt) });
    }
    return [...found.values()].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  }
  private confirm(reader: Reader, ctx: SessionContext, operation: string, candidates: Candidate[], excluded: Set<string>, token?: string): void {
    const conflicts = this.conflicts(reader, ctx, candidates, excluded);
    if (!conflicts.length) return;
    const confirmationToken = createHmac('sha256', this.confirmationSecret).update(JSON.stringify({ userId: ctx.userId, operation, candidates, conflicts })).digest('hex');
    if (token !== confirmationToken) throw new AppError(409, 'SCHEDULE_CONFLICT', '时间安排有冲突，请核对后明确确认', { conflicts, confirmationToken });
  }
  check(ctx: SessionContext, input: CalendarRange & { exclude?: { kind: 'event' | 'block'; id: string } | undefined }) {
    const excluded = new Set<string>();
    if (input.exclude) { if (input.exclude.kind === 'event') this.event(this.db, ctx, input.exclude.id); else this.block(this.db, ctx, input.exclude.id); excluded.add(`${input.exclude.kind}:${input.exclude.id}`); }
    return { conflicts: this.conflicts(this.db, ctx, [this.range(input)], excluded) };
  }
  list(ctx: SessionContext, query: CalendarQuery, kind?: 'event' | 'block') {
    let timezone: string;
    try { timezone = calendarTimezone(query.timezone ?? this.identity.getPreferences(ctx).timezone); } catch { throw new AppError(400, 'INVALID_TIMEZONE', '请检查日历显示时区'); }
    const from = Date.parse(query.from), to = Date.parse(query.to);
    const overlaps = (row: Row) => Number(row.start_at) < to && Number(row.end_at) > from;
    if (kind === 'event') return { items: eventRecords(this.db, ctx.userId).filter(overlaps).map(row => this.eventDto(this.db, ctx, row)) };
    if (kind === 'block') return { items: blockRecords(this.db, ctx.userId).filter(row => overlaps(row) && (!query.taskId || row.task_id === query.taskId)).map(row => this.blockDto(row)) };
    const items: CalendarItem[] = [
      ...eventRecords(this.db, ctx.userId).filter(overlaps).map(row => ({ kind: 'event' as const, resourceId: String(row.id), title: String(row.title), ...rangeOf(row), version: Number(row.version) })),
      ...blockRecords(this.db, ctx.userId).filter(overlaps).map(row => ({ kind: 'block' as const, resourceId: String(row.id), taskId: String(row.task_id), title: String(row.title), ...rangeOf(row), version: Number(row.version) })),
    ];
    const firstDate = calendarDateAt(query.from, timezone), lastDate = calendarDateAt(new Date(to - 1).toISOString(), timezone);
    for (const task of taskRecords(this.db, ctx.userId)) {
      if (task.archived_at != null || task.status === 'canceled') continue;
      if (task.due_date != null && String(task.due_date) >= firstDate && String(task.due_date) <= lastDate) items.push({ kind: 'milestone', resourceId: String(task.id), title: String(task.title), date: String(task.due_date), timezone, version: Number(task.version) });
      if (task.due_at != null && Number(task.due_at) >= from && Number(task.due_at) < to) items.push({ kind: 'milestone', resourceId: String(task.id), title: String(task.title), startAt: iso(task.due_at), timezone: String(task.timezone), version: Number(task.version) });
    }
    return { items };
  }
  createEvent(ctx: SessionContext, input: CreateCalendarEventInput, key: string) {
    return writeResource(this.db, ctx.userId, 'calendar:event:create', key, input, tx => {
      const range = this.range(input); this.confirm(tx, ctx, 'event:create', [range], new Set(), input.conflictToken);
      const id = randomUUID(), now = Date.now();
      insertCalendarRecord(tx, 'event', { id, user_id: ctx.userId, title: input.title, start_at: Date.parse(range.startAt), end_at: Date.parse(range.endAt), timezone: range.timezone, location: input.location, note: input.note, external_url: input.externalUrl, created_at: now, updated_at: now });
      if (input.preparationTask) { const task = this.tasks.createInTransaction(tx, ctx, { ...input.preparationTask, type: 'meeting_prep' }, true); tx.run('INSERT INTO event_preparation_tasks(user_id,event_id,task_id) VALUES(?,?,?)', ctx.userId, id, task.id); }
      return this.eventDto(tx, ctx, this.event(tx, ctx, id));
    });
  }
  updateEvent(ctx: SessionContext, id: string, input: UpdateCalendarEventInput, key: string) {
    return writeResource(this.db, ctx.userId, `calendar:event:${id}:update`, key, input, tx => {
      const row = this.event(tx, ctx, id); this.version(row, input.expectedVersion);
      const previous = rangeOf(row);
      const range = this.range({ startAt: input.startAt ?? previous.startAt, endAt: input.endAt ?? previous.endAt, timezone: input.timezone ?? previous.timezone });
      this.confirm(tx, ctx, `event:${id}:${row.version}`, [range], new Set([`event:${id}`]), input.conflictToken);
      updateCalendarRecord(tx, 'event', ctx.userId, id, { title: input.title ?? String(row.title), start_at: Date.parse(range.startAt), end_at: Date.parse(range.endAt), timezone: range.timezone, location: input.location ?? String(row.location ?? ''), note: input.note ?? String(row.note), external_url: input.externalUrl === undefined ? row.external_url == null ? null : String(row.external_url) : input.externalUrl, updated_at: Date.now() });
      return this.eventDto(tx, ctx, this.event(tx, ctx, id));
    });
  }
  deleteEvent(ctx: SessionContext, id: string, input: { expectedVersion: number }, key: string) {
    return writeResource(this.db, ctx.userId, `calendar:event:${id}:delete`, key, input, tx => {
      const row = this.event(tx, ctx, id); this.version(row, input.expectedVersion);
      tx.run('DELETE FROM calendar_events WHERE user_id=? AND id=?', ctx.userId, id); return { id, deleted: true };
    });
  }
  private insertBlock(tx: Transaction, ctx: SessionContext, taskId: string, range: CalendarRange): CalendarBlockDto {
    const id = randomUUID(), now = Date.now();
    insertCalendarRecord(tx, 'block', { id, user_id: ctx.userId, task_id: taskId, start_at: Date.parse(range.startAt), end_at: Date.parse(range.endAt), timezone: range.timezone, created_at: now, updated_at: now });
    return this.blockDto(this.block(tx, ctx, id));
  }
  private bumpTask(tx: Transaction, ctx: SessionContext, task: Row) { updateTask(tx, ctx.userId, String(task.id), Number(task.version), { updated_at: Date.now(), ...(task.status === 'inbox' ? { status: 'todo' } : {}) }); }
  createBlock(ctx: SessionContext, input: CreateScheduleBlockInput, key: string) {
    return writeResource(this.db, ctx.userId, 'calendar:block:create', key, input, tx => {
      const task = this.activeTask(tx, ctx, input.taskId); this.version(task, input.expectedTaskVersion);
      const range = this.range(input); this.confirm(tx, ctx, `block:create:${task.id}:${task.version}`, [range], new Set(), input.conflictToken);
      this.bumpTask(tx, ctx, task); return this.insertBlock(tx, ctx, input.taskId, range);
    });
  }
  createTask(ctx: SessionContext, input: CreateScheduledTaskInput, key: string) {
    return writeResource(this.db, ctx.userId, 'calendar:task:create', key, input, tx => {
      const range = this.range(input.schedule); this.confirm(tx, ctx, 'task:create', [range], new Set(), input.conflictToken);
      const task = this.tasks.createInTransaction(tx, ctx, input.task, true), block = this.insertBlock(tx, ctx, task.id, range);
      return { task: this.tasks.getInTransaction(tx, ctx, task.id), block };
    });
  }
  updateBlock(ctx: SessionContext, id: string, input: UpdateScheduleBlockInput, key: string) {
    return writeResource(this.db, ctx.userId, `calendar:block:${id}:update`, key, input, tx => {
      const row = this.block(tx, ctx, id); this.version(row, input.expectedVersion); const task = this.activeTask(tx, ctx, String(row.task_id));
      const range = this.range(input); this.confirm(tx, ctx, `block:${id}:${row.version}`, [range], new Set([`block:${id}`]), input.conflictToken);
      updateCalendarRecord(tx, 'block', ctx.userId, id, { start_at: Date.parse(range.startAt), end_at: Date.parse(range.endAt), timezone: range.timezone, updated_at: Date.now() });
      this.bumpTask(tx, ctx, task); return this.blockDto(this.block(tx, ctx, id));
    });
  }
  cancelBlock(ctx: SessionContext, id: string, input: { expectedVersion: number }, key: string) {
    return writeResource(this.db, ctx.userId, `calendar:block:${id}:cancel`, key, input, tx => {
      const row = this.block(tx, ctx, id); this.version(row, input.expectedVersion);
      updateCalendarRecord(tx, 'block', ctx.userId, id, { status: 'canceled', updated_at: Date.now() });
      const task = taskRecord(tx, ctx.userId, String(row.task_id))!; this.bumpTask(tx, ctx, task);
      return this.blockDto(blockRecord(tx, ctx.userId, id)!);
    });
  }
  reschedule(ctx: SessionContext, id: string, input: RescheduleTaskInput, key: string) {
    if (input.scope === 'deadline') return this.tasks.reschedule(ctx, id, input, key);
    return writeResource(this.db, ctx.userId, `calendar:task:${id}:reschedule`, key, input, tx => {
      const task = this.activeTask(tx, ctx, id); this.version(task, input.expectedVersion);
      if (!input.blocks?.length) throw new AppError(422, 'BLOCKS_REQUIRED', '请明确提供要调整的工作块');
      if (new Set(input.blocks.map(block => block.id)).size !== input.blocks.length) throw new AppError(400, 'DUPLICATE_BLOCK', '工作块不能重复');
      const candidates = input.blocks.map(inputBlock => { const row = this.block(tx, ctx, inputBlock.id); if (row.task_id !== id) throw new AppError(404, 'BLOCK_NOT_FOUND', '找不到这个工作块'); this.version(row, inputBlock.expectedVersion); return { ...this.range(inputBlock), id: inputBlock.id, version: Number(row.version) }; });
      this.confirm(tx, ctx, `reschedule:${id}:${task.version}`, candidates, new Set(candidates.map(block => `block:${block.id}`)), input.conflictToken);
      for (const block of candidates) updateCalendarRecord(tx, 'block', ctx.userId, block.id, { start_at: Date.parse(block.startAt), end_at: Date.parse(block.endAt), timezone: block.timezone, updated_at: Date.now() });
      if (input.scope === 'both' && input.due === undefined) throw new AppError(400, 'DUE_REQUIRED', '请明确提供新的截止时间');
      updateTask(tx, ctx.userId, id, Number(task.version), { updated_at: Date.now(), ...(input.scope === 'both' ? this.tasks.dueColumns(input.due!) : {}) });
      return this.tasks.getInTransaction(tx, ctx, id);
    });
  }
}
