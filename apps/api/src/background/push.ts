import { createHash, randomUUID } from 'node:crypto';
import webpush from 'web-push';
import type { PushSubscription, RequestOptions } from 'web-push';
import type { Database, Transaction } from '@research/persistence';
import type { PushConfiguration } from '../modules/push/push-config.js';
import { validPushEndpoint, validPushKeys } from '../modules/push/push-config.js';
import { reminderTarget, targetFromRow } from '../modules/reminders/reminder-target.js';
import { deliveryPreferences } from './delivery-preferences.js';
export type PushSender = (subscription: PushSubscription, payload: string, options: RequestOptions) => Promise<unknown>;
export interface PushJob { id: string; attempts: number }
export function queuePush(tx: Transaction, notificationId: string, userId: string, reminderVersion: number, now: number): void {
  const subscriptions = tx.all('SELECT p.id FROM push_subscriptions p JOIN sessions s ON s.id=p.session_id AND s.user_id=p.user_id WHERE p.user_id=? AND p.active=1 AND s.revoked_at IS NULL AND s.expires_at>?', userId, now);
  for (const row of subscriptions) tx.run("INSERT OR IGNORE INTO push_deliveries(id,user_id,notification_id,subscription_id,reminder_version,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", randomUUID(), userId, notificationId, String(row.id), reminderVersion, now, now, now);
}
export class PushDelivery {
  constructor(private readonly db: Database, private readonly configuration: PushConfiguration | null, private readonly sender: PushSender = webpush.sendNotification.bind(webpush), private readonly now: () => number = Date.now) {}
  claimOne(): PushJob | null {
    if (!this.configuration) return null;
    return this.db.withTransaction(tx => {
      const now = this.now(), row = tx.get("SELECT id,attempts FROM push_deliveries WHERE (status='pending' AND next_attempt_at<=?) OR (status='running' AND lease_until<=?) ORDER BY next_attempt_at,id LIMIT 1", now, now);
      if (!row) return null;
      const changed = tx.run("UPDATE push_deliveries SET status='running',attempts=attempts+1,lease_until=?,updated_at=? WHERE id=? AND ((status='pending' AND next_attempt_at<=?) OR (status='running' AND lease_until<=?))", now + 60000, now, String(row.id), now, now);
      return Number(changed.changes) ? { id: String(row.id), attempts: Number(row.attempts) + 1 } : null;
    });
  }
  private finish(tx: Transaction, job: PushJob, status: string, error: string | null = null): void {
    tx.run('UPDATE push_deliveries SET status=?,lease_until=NULL,last_error_code=?,updated_at=? WHERE id=? AND status=\'running\' AND attempts=?', status, error, this.now(), job.id, job.attempts);
  }
  async deliver(job: PushJob): Promise<void> {
    if (!this.configuration) return;
    const config = this.configuration;
    const send = this.db.withTransaction(tx => {
      const now = this.now(), row = tx.get('SELECT d.*,p.endpoint,p.p256dh,p.auth,p.active,p.vapid_public_key,p.session_id,n.resource_id,n.read_at,n.reminder_id FROM push_deliveries d JOIN push_subscriptions p ON p.id=d.subscription_id AND p.user_id=d.user_id JOIN notifications n ON n.id=d.notification_id AND n.user_id=d.user_id WHERE d.id=?', job.id);
      if (!row || row.status !== 'running' || Number(row.attempts) !== job.attempts) return null;
      const session = tx.get('SELECT id FROM sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?', String(row.session_id), String(row.user_id), now);
      const reminder = row.reminder_id ? tx.get('SELECT * FROM reminders WHERE id=? AND user_id=?', String(row.reminder_id), String(row.user_id)) : undefined;
      let target;
      try { target = reminder && reminderTarget(tx, String(row.user_id), targetFromRow(reminder)); } catch { target = undefined; }
      if (!row.active || !session || row.vapid_public_key !== config.publicKey || row.read_at != null || !reminder || reminder.status !== 'sent' || reminder.version !== row.reminder_version || !target?.active || target.signature !== reminder.target_signature || target.version !== reminder.target_version) {
        this.finish(tx, job, 'canceled');
        if (!session || row.vapid_public_key !== config.publicKey) tx.run('UPDATE push_subscriptions SET active=0,updated_at=? WHERE id=?', now, String(row.subscription_id));
        return null;
      }
      const { deferUntil } = deliveryPreferences(tx, String(row.user_id), now);
      if (deferUntil !== null) {
        tx.run("UPDATE push_deliveries SET status='pending',lease_until=NULL,attempts=MAX(0,attempts-1),next_attempt_at=?,updated_at=? WHERE id=? AND attempts=?", deferUntil, now, job.id, job.attempts); return null;
      }
      try { validPushEndpoint(String(row.endpoint)); validPushKeys({ p256dh: String(row.p256dh), auth: String(row.auth) }); }
      catch { this.finish(tx, job, 'failed', 'INVALID_PUSH_SUBSCRIPTION'); tx.run("UPDATE push_subscriptions SET active=0,last_error_code='INVALID_PUSH_SUBSCRIPTION',updated_at=? WHERE id=?", now, String(row.subscription_id)); return null; }
      const tag = createHash('sha256').update(String(row.notification_id)).digest('base64url').slice(0, 32);
      return { subscriptionId: String(row.subscription_id), subscription: { endpoint: String(row.endpoint), keys: { p256dh: String(row.p256dh), auth: String(row.auth) } }, payload: JSON.stringify({ title: 'Research Tasks', body: '有一条研究提醒，打开研究空间查看详情。', href: String(row.resource_id), tag }), tag };
    });
    if (!send) return;
    // Provider I/O occurs after releasing the SQLite write transaction.
    try {
      await this.sender(send.subscription, send.payload, { vapidDetails: config, TTL: 3600, timeout: 10000, topic: send.tag, urgency: 'normal' });
      this.db.withTransaction(tx => this.finish(tx, job, 'sent'));
    } catch (error) {
      const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 0;
      this.db.withTransaction(tx => {
        if (status === 404 || status === 410) {
          tx.run("UPDATE push_subscriptions SET active=0,last_error_code='PUSH_SUBSCRIPTION_GONE',updated_at=? WHERE id=?", this.now(), send.subscriptionId);
          tx.run("UPDATE push_deliveries SET status='canceled',lease_until=NULL,last_error_code='PUSH_SUBSCRIPTION_GONE',updated_at=? WHERE subscription_id=? AND status IN ('pending','running')", this.now(), send.subscriptionId);
        } else if (status >= 300 && status < 500 && status !== 408 && status !== 429) this.finish(tx, job, 'failed', 'PUSH_REJECTED');
        else {
          const delay = Math.min(3600000, 10000 * 2 ** Math.min(job.attempts, 8));
          tx.run("UPDATE push_deliveries SET status=?,lease_until=NULL,last_error_code='PUSH_TEMPORARY_FAILURE',next_attempt_at=?,updated_at=? WHERE id=? AND status='running' AND attempts=?", job.attempts >= 5 ? 'failed' : 'pending', this.now() + delay, this.now(), job.id, job.attempts);
        }
      });
    }
  }
  async tick(): Promise<void> { for (let i = 0; i < 5; i++) { const job = this.claimOne(); if (!job) break; await this.deliver(job); } }
}
