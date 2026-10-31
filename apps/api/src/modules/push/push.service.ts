import { createHash, randomUUID } from 'node:crypto';
import type { Database, Transaction } from '@research/persistence';
import type { PushSubscriptionInput, PushStatusDto, PushConfigDto } from '@research/contracts';
import type { SessionContext } from '../identity/identity.service.js';
import { writeResource } from '../../common/idempotency.js';
import { AppError } from '../../common/app-error.js';
import { pushConfiguration, validPushEndpoint, validPushKeys } from './push-config.js';
import type { PushConfiguration } from './push-config.js';
export function disablePushSession(tx: Transaction, sessionId: string, now: number): void {
  tx.run('UPDATE push_subscriptions SET active=0,updated_at=? WHERE session_id=?', now, sessionId);
  tx.run("UPDATE push_deliveries SET status='canceled',lease_until=NULL,updated_at=? WHERE subscription_id IN (SELECT id FROM push_subscriptions WHERE session_id=?) AND status IN ('pending','running','failed')", now, sessionId);
}
export class PushService {
  constructor(private readonly db: Database, readonly configuration: PushConfiguration | null = pushConfiguration(), private readonly now: () => number = Date.now) {}
  config(): PushConfigDto { return { enabled: !!this.configuration, publicKey: this.configuration?.publicKey ?? null }; }
  status(ctx: SessionContext, endpointHash: string): PushStatusDto {
    const row = this.db.get('SELECT * FROM push_subscriptions WHERE endpoint_hash=? AND user_id=? AND session_id=?', endpointHash, ctx.userId, ctx.sessionId);
    const job = row ? this.db.get('SELECT status,last_error_code FROM push_deliveries WHERE subscription_id=? AND user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1', String(row.id), ctx.userId) : null;
    return { active: !!row?.active && row.vapid_public_key === this.configuration?.publicKey, deliveryStatus: job ? String(job.status) : null, lastErrorCode: row?.last_error_code ? String(row.last_error_code) : job?.last_error_code ? String(job.last_error_code) : null };
  }
  subscribe(ctx: SessionContext, input: PushSubscriptionInput, key: string): PushStatusDto {
    if (!this.configuration) throw new AppError(503, 'PUSH_NOT_CONFIGURED', '服务端尚未配置浏览器推送，应用内通知仍可使用');
    validPushEndpoint(input.endpoint); validPushKeys(input.keys);
    if (input.expirationTime != null && input.expirationTime <= this.now()) throw new AppError(400, 'PUSH_SUBSCRIPTION_EXPIRED', '推送订阅已过期，请重新订阅');
    return writeResource(this.db, ctx.userId, `push:subscribe:${ctx.sessionId}`, key, input, tx => {
      const hash = createHash('sha256').update(input.endpoint).digest('hex'), now = this.now();
      const session = tx.get('SELECT id FROM sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?', ctx.sessionId, ctx.userId, now);
      if (!session) throw new AppError(401, 'UNAUTHENTICATED', '请重新登录后开启推送');
      const existing = tx.get('SELECT p.*,s.expires_at,s.revoked_at FROM push_subscriptions p JOIN sessions s ON s.id=p.session_id WHERE p.endpoint_hash=?', hash);
      if (existing && existing.user_id !== ctx.userId && existing.active && !existing.revoked_at && Number(existing.expires_at) > now) throw new AppError(409, 'PUSH_BROWSER_IN_USE', '此浏览器订阅仍绑定另一个有效会话，请先退出原账户或重新生成浏览器订阅');
      if (existing && existing.user_id === ctx.userId && existing.session_id === ctx.sessionId && existing.vapid_public_key === this.configuration!.publicKey && existing.active && existing.p256dh === input.keys.p256dh && existing.auth === input.keys.auth) return { active: true, deliveryStatus: null, lastErrorCode: null };
      if (existing) tx.run('DELETE FROM push_subscriptions WHERE id=?', String(existing.id));
      const count = Number(tx.get('SELECT count(*) n FROM push_subscriptions WHERE user_id=?', ctx.userId)?.n);
      if (count >= 20) throw new AppError(422, 'PUSH_SUBSCRIPTION_LIMIT', '订阅数量已达上限，请先停用旧会话的订阅');
      tx.run('INSERT INTO push_subscriptions(id,user_id,session_id,endpoint_hash,endpoint,p256dh,auth,vapid_public_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)', randomUUID(), ctx.userId, ctx.sessionId, hash, input.endpoint, input.keys.p256dh, input.keys.auth, this.configuration!.publicKey, now, now);
      return { active: true, deliveryStatus: null, lastErrorCode: null };
    });
  }
  unsubscribe(ctx: SessionContext, input: { endpointHash: string }, key: string): PushStatusDto {
    return writeResource(this.db, ctx.userId, `push:unsubscribe:${ctx.sessionId}`, key, input, tx => {
      tx.run('UPDATE push_subscriptions SET active=0,updated_at=? WHERE endpoint_hash=? AND user_id=? AND session_id=?', this.now(), input.endpointHash, ctx.userId, ctx.sessionId);
      tx.run("UPDATE push_deliveries SET status='canceled',lease_until=NULL,updated_at=? WHERE subscription_id IN (SELECT id FROM push_subscriptions WHERE endpoint_hash=? AND user_id=? AND session_id=?) AND status IN ('pending','running','failed')", this.now(), input.endpointHash, ctx.userId, ctx.sessionId);
      return { active: false, deliveryStatus: null, lastErrorCode: null };
    });
  }
}
