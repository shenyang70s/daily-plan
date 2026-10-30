import type { Transaction } from '@research/persistence';
import type { ReminderTarget, TaskDue } from '@research/contracts';
import { normalizeDeadline } from '@research/domain';
import { AppError } from '../../common/app-error.js';
export interface TargetState { title: string; active: boolean; version: number; at: number | null; date: string | null; signature: string; href: string; due: TaskDue; sourceTimezone: string | null }
export function reminderTarget(tx: Pick<Transaction, 'get'>, userId: string, target: ReminderTarget): TargetState {
  const row = target.targetType === 'task' ? tx.get('SELECT * FROM tasks WHERE id=? AND user_id=?', target.targetId, userId)
    : target.targetType === 'event' ? tx.get('SELECT * FROM calendar_events WHERE id=? AND user_id=?', target.targetId, userId)
    : tx.get('SELECT m.*,s.name,s.archived_at,s.stage FROM submission_milestones m JOIN submissions s ON s.id=m.submission_id AND s.user_id=m.user_id WHERE m.id=? AND m.user_id=?', target.targetId, userId);
  if (!row) throw new AppError(404, 'REMINDER_TARGET_NOT_FOUND', '提醒目标不存在或无权访问');
  const active = target.targetType === 'task' ? !row.deleted_at && !row.archived_at && !['done', 'canceled'].includes(String(row.status)) : target.targetType === 'event' ? !row.canceled_at : !row.archived_at && row.stage !== 'withdrawn';
  const at = (target.targetType === 'event' ? row.start_at : row.due_at) as number | null;
  const date = (target.targetType === 'event' ? null : row.due_date) as string | null;
  const title = String(target.targetType === 'milestone' ? `${row.name} · ${row.kind}` : row.title);
  const href = target.targetType === 'task' ? `/tasks/${target.targetId}` : target.targetType === 'event' ? `/calendar/events/${target.targetId}` : `/submissions/${row.submission_id}`;
  const due: TaskDue = date ? { kind: 'date', date } : at != null ? { kind: 'instant', at: new Date(at).toISOString(), timezone: String(row.timezone) } : null;
  return { due, sourceTimezone: row.source_timezone == null ? null : String(row.source_timezone), title, active, at: at ?? null, date: date ?? null, version: Number(row.version), signature: JSON.stringify([at ?? null, date ?? null]), href };
}
export function reminderTime(target: TargetState, policy: { mode: string; at?: string | undefined; offsetMinutes?: number | undefined; dateTime?: string | null | undefined; timezone: string }): number {
  // Validate the display timezone even for absolute times.
  normalizeDeadline({ localDateTime: '2026-01-15T12:00', timezone: policy.timezone });
  if (policy.mode === 'absolute') return Date.parse(policy.at!);
  let at = target.at;
  if (target.date && policy.dateTime) at = Date.parse(normalizeDeadline({ localDateTime: `${target.date}T${policy.dateTime}`, timezone: policy.timezone }).at);
  if (at === null) throw new AppError(422, 'REMINDER_TIME_REQUIRED', target.date ? '日期型期限需要明确提醒时刻和时区' : '待定期限不能设置相对提醒，请先填写期限或选择指定时刻');
  return at - (policy.offsetMinutes ?? 0) * 60000;
}
export function targetFromRow(row: Record<string, unknown>): ReminderTarget { return row.task_id ? { targetType: 'task', targetId: String(row.task_id) } : row.event_id ? { targetType: 'event', targetId: String(row.event_id) } : { targetType: 'milestone', targetId: String(row.milestone_id) }; }
