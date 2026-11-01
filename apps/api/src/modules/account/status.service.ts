import type { Database } from '@research/persistence';
import type { AccountStatusDto } from '@research/contracts';
import type { SessionContext } from '../identity/identity.service.js';
import type { Observability } from '../../common/observability.js';
export class StatusService {
  constructor(private readonly db: Database, private readonly metrics: Observability, private readonly now: () => number = Date.now) {}
  get(ctx: SessionContext): AccountStatusDto {
    const now = this.now(), since = now - 86_400_000;
    return this.db.withTransaction(tx => {
      const count = (sql: string, ...params: (string | number)[]) => Number(tx.get(sql, ctx.userId, ...params)?.n ?? 0);
      const queue = tx.get("SELECT count(*) n,min(next_attempt_at) oldest FROM outbox_events WHERE user_id=? AND status IN ('pending','running') AND next_attempt_at<=?", ctx.userId, now);
      const ai = tx.get("SELECT count(*) completed,sum(status='failed') failed,avg(updated_at-created_at) duration FROM ai_runs WHERE user_id=? AND origin='model' AND status IN ('succeeded','failed') AND updated_at>=?", ctx.userId, since);
      const completed = Number(ai?.completed ?? 0), failed = Number(ai?.failed ?? 0);
      return { observedAt: new Date(now).toISOString(), reminders: {
        overdue: count("SELECT count(*) n FROM reminders WHERE user_id=? AND status='pending' AND scheduled_for<=?", now),
        queuedDeliveries: Number(queue?.n ?? 0), oldestWaitSeconds: queue?.oldest == null ? 0 : Math.max(0, (now - Number(queue.oldest)) / 1000),
        failedDeliveries: count("SELECT count(*) n FROM outbox_events WHERE user_id=? AND status='failed'"),
        failedPushDeliveries: count("SELECT count(*) n FROM push_deliveries WHERE user_id=? AND status='failed'"),
      }, ai: { since: new Date(since).toISOString(), completed, failed, failureRate: completed ? failed / completed : null, avgDurationMs: ai?.duration == null ? null : Number(ai.duration) }, api: this.metrics.summary(ctx.userId) };
    });
  }
}
