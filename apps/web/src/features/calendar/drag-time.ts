import { normalizeDeadline } from '@research/domain';
import type { CalendarItem, CalendarRange } from '@research/contracts';
export function draggedBlockRange(item: CalendarItem, localStart: string, timezone: string): CalendarRange {
  if (item.kind !== 'block' || !item.startAt || !item.endAt) throw new Error('仅工作块可拖动');
  const duration = Date.parse(item.endAt) - Date.parse(item.startAt);
  if (duration <= 0) throw new Error('工作块时长无效');
  const startAt = normalizeDeadline({ localDateTime: localStart, timezone }).at;
  return { startAt, endAt: new Date(Date.parse(startAt) + duration).toISOString(), timezone };
}
