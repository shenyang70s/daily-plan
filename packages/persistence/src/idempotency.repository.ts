import { createHash } from 'node:crypto';
import type { Transaction } from './database.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
export class IdempotencyConflict extends Error {}
export function idempotentWrite<T>(tx: Transaction, userId: string, scope: string, key: string, input: unknown, write: () => T): T {
  const hash = createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');
  const prior = tx.get('SELECT request_hash,response_json FROM idempotency_keys WHERE user_id=? AND scope=? AND key=?', userId, scope, key);
  if (prior) {
    if (prior.request_hash !== hash) throw new IdempotencyConflict('Idempotency key reused with another request');
    return JSON.parse(String(prior.response_json)) as T;
  }
  const response = write();
  tx.run('INSERT INTO idempotency_keys(user_id,scope,key,request_hash,response_json,created_at) VALUES(?,?,?,?,?,?)', userId, scope, key, hash, JSON.stringify(response), Date.now());
  return response;
}
