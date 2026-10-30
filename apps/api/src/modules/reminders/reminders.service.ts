import { randomUUID } from 'node:crypto';
import type { Database, Transaction } from '@research/persistence';
import type { CreateReminderInput, UpdateReminderInput, ReminderTarget, ReminderDto, NotificationDto, NotificationPage } from '@research/contracts';
import type { SessionContext } from '../identity/identity.service.js';
import { AppError } from '../../common/app-error.js';
import { writeResource } from '../../common/idempotency.js';
import { reminderTarget, reminderTime, targetFromRow } from './reminder-target.js';
const iso = (v: unknown) => v == null ? null : new Date(Number(v)).toISOString();
export function queueReminder(tx: Transaction, row: Record<string, unknown>, now: number): void {
  const deliveryKey = `${row.id}:${row.scheduled_for}:${row.version}:in_app`;
  tx.run("INSERT OR IGNORE INTO outbox_events(id,user_id,reminder_id,scheduled_for,delivery_key,payload_json,status,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',?,?,?)", randomUUID(), String(row.user_id), String(row.id), Number(row.scheduled_for), deliveryKey, JSON.stringify({ version: row.version }), Number(row.scheduled_for), now, now);
}
export function cancelJobs(tx: Transaction, id: string, now: number): void { tx.run("UPDATE outbox_events SET status='canceled',lease_until=NULL,updated_at=? WHERE reminder_id=? AND status IN ('pending','running','failed')", now, id); }
function notificationDto(row: Record<string, unknown>): NotificationDto { return { id: String(row.id), title: String(row.title), body: String(row.body), href: String(row.resource_id), createdAt: iso(row.created_at)!, readAt: iso(row.read_at), snoozedUntil: iso(row.snoozed_until), reminderId: row.reminder_id == null ? null : String(row.reminder_id) }; }
export class RemindersService {
  constructor(private readonly db: Database, private readonly now: () => number = Date.now) {}
  private dto(tx: Pick<Transaction, 'get'>, row: Record<string, unknown>): ReminderDto {
    const job = tx.get('SELECT status,last_error_code FROM outbox_events WHERE reminder_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1', String(row.id));
    return { ...targetFromRow(row), id: String(row.id), mode: row.mode as ReminderDto['mode'], scheduledFor: iso(row.scheduled_for)!, timezone: String(row.timezone), offsetMinutes: Number(row.offset_minutes), dateTime: row.date_time == null ? null : String(row.date_time), status: row.status as ReminderDto['status'], version: Number(row.version), deliveryStatus: job ? String(job.status) : null, lastErrorCode: job?.last_error_code == null ? null : String(job.last_error_code) };
  }
  list(ctx: SessionContext, target: ReminderTarget) {
    reminderTarget(this.db, ctx.userId, target);
    const column = { task: 'task_id', event: 'event_id', milestone: 'milestone_id' }[target.targetType];
    return { items: this.db.all(`SELECT * FROM reminders WHERE user_id=? AND ${column}=? ORDER BY created_at DESC,id DESC LIMIT 100`, ctx.userId, target.targetId).map(row => this.dto(this.db, row)) };
  }
  private owned(tx: Pick<Transaction, 'get'>, ctx: SessionContext, id: string): Record<string, unknown> { const row = tx.get('SELECT * FROM reminders WHERE id=? AND user_id=?', id, ctx.userId); if (!row) throw new AppError(404, 'REMINDER_NOT_FOUND', '提醒不存在'); return row; }
  private validateTime(tx: Transaction, ctx: SessionContext, target: ReminderTarget, input: CreateReminderInput | UpdateReminderInput) {
    const state = reminderTarget(tx, ctx.userId, target);
    if (!state.active) throw new AppError(422, 'REMINDER_TARGET_INACTIVE', '已完成、取消或归档的目标不能设置提醒');
    let scheduledFor: number;
    try { scheduledFor = reminderTime(state, input); } catch (e) { if (e instanceof AppError) throw e; throw new AppError(422, 'INVALID_REMINDER_TIME', '提醒时间或时区无效；夏令时重复或缺失时刻请选择指定时刻'); }
    if (!Number.isFinite(scheduledFor) || scheduledFor <= this.now()) throw new AppError(422, 'REMINDER_IN_PAST', '提醒时刻必须晚于当前时间，请调整提前量或选择指定时刻');
    return { state, scheduledFor };
  }
  create(ctx: SessionContext, input: CreateReminderInput, key: string): ReminderDto {
    return writeResource(this.db, ctx.userId, 'reminders:create', key, input, tx => {
      const { state, scheduledFor } = this.validateTime(tx, ctx, input, input), id = randomUUID(), now = this.now();
      const count = tx.get("SELECT count(*) n FROM reminders WHERE user_id=? AND status='pending' AND (task_id=? OR event_id=? OR milestone_id=?)", ctx.userId, input.targetId, input.targetId, input.targetId);
      if (Number(count?.n) >= 20) throw new AppError(422, 'REMINDER_LIMIT', '同一目标最多保留 20 条待触发提醒');
      tx.run('INSERT INTO reminders(id,user_id,task_id,event_id,milestone_id,scheduled_for,timezone,created_at,updated_at,mode,offset_minutes,date_time,target_version,target_signature) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, ctx.userId, input.targetType === 'task' ? input.targetId : null, input.targetType === 'event' ? input.targetId : null, input.targetType === 'milestone' ? input.targetId : null, scheduledFor, input.timezone, now, now, input.mode, input.offsetMinutes ?? 0, input.dateTime ?? null, state.version, state.signature);
      const row = this.owned(tx, ctx, id); queueReminder(tx, row, now); return this.dto(tx, row);
    });
  }
  update(ctx: SessionContext, id: string, input: UpdateReminderInput, key: string): ReminderDto {
    return writeResource(this.db, ctx.userId, `reminders:${id}:update`, key, input, tx => {
      const row = this.owned(tx, ctx, id); this.version(row, input.expectedVersion);
      const { state, scheduledFor } = this.validateTime(tx, ctx, targetFromRow(row), input), now = this.now();
      cancelJobs(tx, id, now);
      tx.run("UPDATE reminders SET mode=?,scheduled_for=?,timezone=?,offset_minutes=?,date_time=?,target_version=?,target_signature=?,status='pending',version=version+1,updated_at=? WHERE id=? AND user_id=?", input.mode, scheduledFor, input.timezone, input.offsetMinutes ?? 0, input.dateTime ?? null, state.version, state.signature, now, id, ctx.userId);
      const result = this.owned(tx, ctx, id); queueReminder(tx, result, now); return this.dto(tx, result);
    });
  }
  private version(row: Record<string, unknown>, version: number): void { if (row.version !== version) throw new AppError(409, 'VERSION_CONFLICT', '提醒已变化，请刷新后重试'); }
  cancel(ctx: SessionContext, id: string, input: { expectedVersion: number }, key: string): ReminderDto {
    return writeResource(this.db, ctx.userId, `reminders:${id}:cancel`, key, input, tx => { const row = this.owned(tx, ctx, id); this.version(row, input.expectedVersion); cancelJobs(tx, id, this.now()); tx.run("UPDATE reminders SET status='canceled',version=version+1,updated_at=? WHERE id=? AND user_id=?", this.now(), id, ctx.userId); return this.dto(tx, this.owned(tx, ctx, id)); });
  }
  notifications(ctx: SessionContext, query: { cursor?: string | undefined; limit?: number | undefined }): NotificationPage {
    let cursor: Record<string, unknown> | undefined;
    if (query.cursor) { cursor = this.db.get('SELECT created_at,id FROM notifications WHERE user_id=? AND id=?', ctx.userId, query.cursor); if (!cursor) throw new AppError(400, 'INVALID_CURSOR', '通知分页位置无效'); }
    const limit = query.limit ?? 30;
    const rows = cursor ? this.db.all('SELECT * FROM notifications WHERE user_id=? AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT ?', ctx.userId, Number(cursor.created_at), Number(cursor.created_at), String(cursor.id), limit + 1) : this.db.all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ?', ctx.userId, limit + 1);
    return { items: rows.slice(0, limit).map(notificationDto), nextCursor: rows.length > limit ? String(rows[limit - 1]!.id) : null, unreadCount: Number(this.db.get('SELECT count(*) n FROM notifications WHERE user_id=? AND read_at IS NULL', ctx.userId)?.n ?? 0) };
  }
  private notification(tx: Transaction, ctx: SessionContext, id: string) { const row = tx.get('SELECT * FROM notifications WHERE id=? AND user_id=?', id, ctx.userId); if (!row) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', '通知不存在'); return row; }
  read(ctx: SessionContext, id: string, key: string): NotificationDto { return writeResource(this.db, ctx.userId, `notifications:${id}:read`, key, {}, tx => { this.notification(tx, ctx, id); tx.run('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?', this.now(), id, ctx.userId); return notificationDto(this.notification(tx, ctx, id)); }); }
  snooze(ctx: SessionContext, id: string, input: { minutes: number }, key: string): NotificationDto {
    return writeResource(this.db, ctx.userId, `notifications:${id}:snooze`, key, input, tx => {
      const row = this.notification(tx, ctx, id);
      if (!row.reminder_id) throw new AppError(422, 'REMINDER_NOT_FOUND', '原提醒已删除，无法稍后提醒');
      if (row.snoozed_until) return notificationDto(row);
      const reminder = this.owned(tx, ctx, String(row.reminder_id)), state = reminderTarget(tx, ctx.userId, targetFromRow(reminder));
      if (!state.active) throw new AppError(422, 'REMINDER_TARGET_INACTIVE', '目标已完成、取消或归档');
      // An older notification must not replace a newer pending reminder.
      if (reminder.status !== 'sent') throw new AppError(409, 'REMINDER_CHANGED', '该提醒已重新安排，请查看目标的提醒设置');
      const now = this.now(), at = now + input.minutes * 60000;
      cancelJobs(tx, String(reminder.id), now);
      tx.run("UPDATE reminders SET mode='absolute',scheduled_for=?,status='pending',version=version+1,updated_at=? WHERE id=? AND user_id=?", at, now, String(reminder.id), ctx.userId);
      queueReminder(tx, this.owned(tx, ctx, String(reminder.id)), now);
      tx.run('UPDATE notifications SET read_at=COALESCE(read_at,?),snoozed_until=? WHERE id=? AND user_id=?', now, at, id, ctx.userId);
      return notificationDto(this.notification(tx, ctx, id));
    });
  }
}
