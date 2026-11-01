import type { Database, Transaction } from '@research/persistence';
import type { DeleteAccountInput } from '@research/contracts';
import type { SessionContext } from '../identity/identity.service.js';
import { verifyPassword } from '../identity/password.js';
import { AppError } from '../../common/app-error.js';

export class DeletionService {
  private readonly attempts = new Map<string, { count: number; until: number }>();
  constructor(private readonly db: Database, private readonly now: () => number = Date.now) {}
  private credentials(reader: Pick<Transaction, 'get'>, ctx: SessionContext) {
    const session = reader.get('SELECT id FROM sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?', ctx.sessionId, ctx.userId, this.now());
    const user = session && reader.get('SELECT username,password_hash FROM local_credentials WHERE user_id=?', ctx.userId);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', '会话已失效，请重新登录');
    return user;
  }
  async delete(ctx: SessionContext, input: DeleteAccountInput): Promise<void> {
    const user = this.credentials(this.db, ctx);
    if (input.confirmation !== `删除账户 ${user.username}`) throw new AppError(400, 'CONFIRMATION_REQUIRED', '请完整输入当前账户的删除确认文字');
    const now = this.now();
    for (const [key, item] of this.attempts) if (item.until <= now) this.attempts.delete(key);
    if (!this.attempts.has(ctx.userId) && this.attempts.size >= 1000) throw new AppError(503, 'AUTH_BUSY', '认证繁忙，请稍后重试');
    const attempt = this.attempts.get(ctx.userId) ?? { count: 0, until: now + 60_000 };
    if (attempt.count >= 5) throw new AppError(429, 'TOO_MANY_ATTEMPTS', '尝试次数过多，请一分钟后重试');
    attempt.count++; this.attempts.set(ctx.userId, attempt);
    if (!await verifyPassword(input.password, String(user.password_hash))) throw new AppError(403, 'INVALID_PASSWORD', '当前密码不正确');
    // KDF is asynchronous: re-check both session and credential inside the deletion transaction.
    this.db.withTransaction(tx => {
      const current = this.credentials(tx, ctx);
      if (current.password_hash !== user.password_hash || current.username !== user.username) throw new AppError(409, 'CREDENTIAL_CHANGED', '账户信息已变化，请重新确认');
      tx.run('DELETE FROM users WHERE id=?', ctx.userId);
    });
    this.attempts.delete(ctx.userId);
  }
}
