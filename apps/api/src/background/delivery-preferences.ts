import type { Transaction } from '@research/persistence';
import { localDateTimeAt, calendarDateAt, shiftCalendarDate, normalizeDeadline } from '@research/domain';
export function deliveryPreferences(tx: Pick<Transaction, 'get'>, userId: string, now: number): { timezone: string; deferUntil: number | null } {
  const preferences = tx.get('SELECT timezone,preferences_json FROM user_preferences WHERE user_id=?', userId), prefs = JSON.parse(String(preferences?.preferences_json ?? '{}'));
  const timezone = String(preferences?.timezone ?? 'Asia/Shanghai');
  let deferUntil: number | null = prefs.notify === false ? now + 60000 : null;
  if (prefs.quiet !== false) {
    const local = localDateTimeAt(new Date(now).toISOString(), timezone), hour = Number(local.slice(11, 13));
    if (hour >= 22 || hour < 8) {
      const date = calendarDateAt(new Date(now).toISOString(), timezone), nextDate = hour >= 22 ? shiftCalendarDate(date, 1) : date;
      deferUntil = Math.max(deferUntil ?? 0, Date.parse(normalizeDeadline({ localDateTime: `${nextDate}T08:00`, timezone }).at));
    }
  }
  return { timezone, deferUntil };
}
