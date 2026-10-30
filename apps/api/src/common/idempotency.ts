import { idempotentWrite, IdempotencyConflict } from '@research/persistence';
import type { Database, Transaction } from '@research/persistence';
import { AppError } from './app-error.js';

export function writeResource<T>(database: Database, userId: string, scope: string, key: string, input: unknown, write: (tx: Transaction) => T): T {
  if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(key)) throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', '请为写入提供有效的 Idempotency-Key');
  try {
    return database.withTransaction(tx => idempotentWrite(tx, userId, scope, key, input, () => write(tx)));
  } catch (error) {
    if (error instanceof IdempotencyConflict) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', '该请求标识已用于不同的内容，请重新提交');
    if (error && typeof error === 'object' && 'code' in error && ['SQLITE_BUSY', 'SQLITE_BUSY_SNAPSHOT'].includes(String(error.code))) throw new AppError(503, 'DATABASE_BUSY', '数据正在更新，请稍后重试');
    throw error;
  }
}
