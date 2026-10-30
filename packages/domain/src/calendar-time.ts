import { Temporal } from '@js-temporal/polyfill';

export function calendarTimezone(timezone: string): string {
  const zone = timezone === 'PT' ? 'America/Los_Angeles' : ['AoE', 'UTC-12'].includes(timezone) ? 'Etc/GMT+12' : timezone === 'UTC' ? 'Etc/UTC' : timezone;
  Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(zone);
  return zone;
}
export function normalizeDeadline(input: { localDateTime: string; timezone: string; offset?: string }): { at: string; timezone: string } {
  const timezone = calendarTimezone(input.timezone);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(input.localDateTime)) throw new RangeError('Invalid local time');
  const local = Temporal.PlainDateTime.from(input.localDateTime, { overflow: 'reject' });
  const zoned = input.offset
    ? Temporal.ZonedDateTime.from(`${local.toString()}${input.offset}[${timezone}]`, { offset: 'reject', disambiguation: 'reject' })
    : local.toZonedDateTime(timezone, { disambiguation: 'reject' });
  return { at: new Date(zoned.epochMilliseconds).toISOString(), timezone };
}
export function localDateTimeAt(at: string, timezone: string): string {
  return Temporal.Instant.from(at).toZonedDateTimeISO(calendarTimezone(timezone)).toPlainDateTime().toString({ smallestUnit: 'second' });
}
export function calendarDateAt(at: string, timezone: string): string { return localDateTimeAt(at, timezone).slice(0, 10); }
export function shiftCalendarDate(date: string, amount: number, unit: 'days' | 'months' = 'days'): string { return Temporal.PlainDate.from(date).add({ [unit]: amount }).toString(); }
export function calendarWindow(date: string, view: 'day' | 'week' | 'month', timezone: string): { from: string; to: string; dates: string[] } {
  let start = Temporal.PlainDate.from(date);
  if (view === 'month') start = start.with({ day: 1 });
  if (view !== 'day') start = start.subtract({ days: start.dayOfWeek - 1 });
  const length = view === 'day' ? 1 : view === 'week' ? 7 : 42;
  const zone = calendarTimezone(timezone);
  return {
    from: new Date(start.toZonedDateTime(zone).epochMilliseconds).toISOString(),
    to: new Date(start.add({ days: length }).toZonedDateTime(zone).epochMilliseconds).toISOString(),
    dates: Array.from({ length }, (_, index) => start.add({ days: index }).toString()),
  };
}
export function calendarOffsetAt(at: string, timezone: string): string { return Temporal.Instant.from(at).toZonedDateTimeISO(calendarTimezone(timezone)).offset; }
export function shiftLocalTime(local: string, minutes: number): string { return Temporal.PlainDateTime.from(local).add({ minutes }).toString({ smallestUnit: 'second' }); }
