import { randomUUID } from 'node:crypto';
import type { Database, Transaction } from '@research/persistence';
import { localDateTimeAt, calendarDateAt, shiftCalendarDate, normalizeDeadline, formatDeadline } from '@research/domain';
import { reminderTarget, reminderTime, targetFromRow } from '../modules/reminders/reminder-target.js';
import { queueReminder, cancelJobs } from '../modules/reminders/reminders.service.js';
export interface ReminderJob { id: string; reminderId: string; userId: string; version: number; deliveryKey: string; attempts: number }
export class ReminderDelivery {
  constructor(private readonly db: Database, private readonly now: () => number = Date.now) {}
  private reconcile(tx: Transaction, row: Record<string, unknown>): Record<string, unknown> | null {
    const id = String(row.id), now = this.now();
    let target;
    try { target = reminderTarget(tx, String(row.user_id), targetFromRow(row)); } catch { target = null; }
    if (!target?.active) {
      cancelJobs(tx, id, now); tx.run("UPDATE reminders SET status='canceled',version=version+1,updated_at=? WHERE id=?", now, id); return null;
    }
    if (row.mode === 'relative' && row.target_signature !== target.signature) {
      let at: number;
      try { at = reminderTime(target, { mode: 'relative', offsetMinutes: Number(row.offset_minutes), dateTime: row.date_time as string | null, timezone: String(row.timezone) }); }
      catch { cancelJobs(tx, id, now); tx.run("UPDATE reminders SET status='canceled',version=version+1,updated_at=? WHERE id=?", now, id); return null; }
      cancelJobs(tx, id, now);
      tx.run('UPDATE reminders SET scheduled_for=?,target_signature=?,target_version=?,version=version+1,updated_at=? WHERE id=?', at, target.signature, target.version, now, id);
      row = tx.get('SELECT * FROM reminders WHERE id=?', id)!;
      queueReminder(tx, row, now);
    } else if (row.target_version !== target.version) tx.run('UPDATE reminders SET target_version=? WHERE id=?', target.version, id);
    return row;
  }
  claimDue(): ReminderJob[] {
    const now = this.now();
    return this.db.withTransaction(tx => {
      for (const row of tx.all("SELECT * FROM reminders WHERE status='pending'")) this.reconcile(tx, row);
      const rows = tx.all("SELECT * FROM outbox_events WHERE (status='pending' AND next_attempt_at<=?) OR (status='running' AND lease_until<=?) ORDER BY next_attempt_at,id LIMIT 50", now, now);
      const jobs: ReminderJob[] = [];
      for (const row of rows) {
        const claimed = tx.run("UPDATE outbox_events SET status='running',lease_until=?,attempts=attempts+1,updated_at=? WHERE id=? AND ((status='pending' AND next_attempt_at<=?) OR (status='running' AND lease_until<=?))", now + 60000, now, String(row.id), now, now);
        if (Number(claimed.changes)) jobs.push({ id: String(row.id), reminderId: String(row.reminder_id), userId: String(row.user_id), deliveryKey: String(row.delivery_key), version: Number(JSON.parse(String(row.payload_json)).version), attempts: Number(row.attempts) + 1 });
      }
      return jobs;
    });
  }
  async deliver(job: ReminderJob): Promise<'sent' | 'skipped' | 'retry'> {
    try {
      return this.db.withTransaction(tx => {
        const now = this.now(), outbox = tx.get('SELECT * FROM outbox_events WHERE id=? AND user_id=?', job.id, job.userId);
        if (!outbox || outbox.status !== 'running' || Number(outbox.attempts) !== job.attempts) return 'skipped';
        let row = tx.get('SELECT * FROM reminders WHERE id=? AND user_id=?', job.reminderId, job.userId);
        if (row?.status === 'pending') row = this.reconcile(tx, row) ?? undefined;
        if (!row || row.status !== 'pending' || Number(row.version) !== job.version || Number(row.scheduled_for) > now) {
          tx.run("UPDATE outbox_events SET status='canceled',lease_until=NULL,updated_at=? WHERE id=?", now, job.id); return 'skipped';
        }
        const preferences = tx.get('SELECT timezone,preferences_json FROM user_preferences WHERE user_id=?', job.userId), prefs = JSON.parse(String(preferences?.preferences_json ?? '{}'));
        const timezone = String(preferences?.timezone ?? 'Asia/Shanghai');
        let deferUntil: number | null = prefs.notify === false ? now + 60000 : null;
        if (prefs.quiet !== false) {
          const local = localDateTimeAt(new Date(now).toISOString(), timezone), hour = Number(local.slice(11, 13));
          if (hour >= 22 || hour < 8) {
            const date = calendarDateAt(new Date(now).toISOString(), timezone), nextDate = hour >= 22 ? shiftCalendarDate(date, 1) : date;
            deferUntil = Math.max(deferUntil ?? 0, Date.parse(normalizeDeadline({ localDateTime: `${nextDate}T08:00`, timezone }).at));
          }
        }
        if (deferUntil !== null) { tx.run("UPDATE outbox_events SET status='pending',lease_until=NULL,next_attempt_at=?,attempts=MAX(0,attempts-1),updated_at=? WHERE id=?", deferUntil, now, job.id); return 'skipped'; }
        const target = reminderTarget(tx, job.userId, targetFromRow(row));
        const kinds: Record<string, string> = { abstract: '摘要', full_paper: '全文', rebuttal: '答辩', notification: '结果通知', camera_ready: '最终稿', other: '其他节点' };
        const title = target.title.replace(/ · ([a-z_]+)$/, (_, kind: string) => ` · ${kinds[kind] ?? kind}`);
        const at = target.due ? formatDeadline(target.due, timezone) + (target.due.kind === 'date' ? ' · 日期型期限' : '') : '尚未设置期限';
        const source = target.due?.kind === 'instant' && target.sourceTimezone ? `。来源时间：${formatDeadline(target.due, target.sourceTimezone)}` : '';
        tx.run('INSERT OR IGNORE INTO notifications(id,user_id,delivery_key,title,body,resource_type,resource_id,created_at,reminder_id) VALUES(?,?,?,?,?,?,?,?,?)', randomUUID(), job.userId, job.deliveryKey, title, `提醒时间已到。目标时间：${at}${source}`, targetFromRow(row).targetType, target.href, now, job.reminderId);
        tx.run("UPDATE reminders SET status='sent',updated_at=? WHERE id=? AND user_id=? AND version=?", now, job.reminderId, job.userId, job.version);
        tx.run("UPDATE outbox_events SET status='sent',lease_until=NULL,last_error_code=NULL,updated_at=? WHERE id=?", now, job.id);
        return 'sent';
      });
    } catch {
      this.db.withTransaction(tx => tx.run("UPDATE outbox_events SET status=?,lease_until=NULL,next_attempt_at=?,last_error_code='DELIVERY_FAILED',updated_at=? WHERE id=? AND status='running' AND attempts=?", job.attempts >= 5 ? 'failed' : 'pending', this.now() + Math.min(3600000, 10000 * 2 ** Math.min(job.attempts, 8)), this.now(), job.id, job.attempts));
      return 'retry';
    }
  }
  async tick(): Promise<void> { for (const job of this.claimDue()) await this.deliver(job); }
}
