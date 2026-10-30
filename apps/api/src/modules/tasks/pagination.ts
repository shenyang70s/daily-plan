import type { CursorPage } from '@research/contracts';
import { AppError } from '../../common/app-error.js';
export function paginate<T extends { id: string; createdAt: string }>(items: T[], limit: number, cursor?: string): CursorPage<T> {
  let remaining = items;
  if (cursor) {
    let position: { id: string; createdAt: string };
    try {
      position = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (!position || typeof position.id !== 'string' || !/^[\da-f-]{36}$/i.test(position.id) || typeof position.createdAt !== 'string' || !Number.isFinite(Date.parse(position.createdAt))) throw new Error('Invalid cursor');
    } catch { throw new AppError(400, 'INVALID_CURSOR', '分页标识无效，请刷新列表'); }
    remaining = items.filter(item => item.createdAt < position.createdAt || (item.createdAt === position.createdAt && item.id < position.id));
  }
  const page = remaining.slice(0, limit), last = page.at(-1);
  return { items: page, nextCursor: remaining.length > limit && last ? Buffer.from(JSON.stringify({ id: last.id, createdAt: last.createdAt })).toString('base64url') : null };
}
