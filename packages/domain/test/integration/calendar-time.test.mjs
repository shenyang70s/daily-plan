import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as time from '../../dist/calendar-time.js';

test('local calendar conversion preserves seconds and rejects missing or ambiguous DST times', () => {
  assert.equal(typeof time.normalizeDeadline, 'function');
  assert.deepEqual(time.normalizeDeadline({ localDateTime: '2026-11-10T23:59:59', timezone: 'AoE' }), { at: '2026-11-11T11:59:59.000Z', timezone: 'Etc/GMT+12' });
  assert.throws(() => time.normalizeDeadline({ localDateTime: '2026-03-08T02:30', timezone: 'PT' }));
  assert.throws(() => time.normalizeDeadline({ localDateTime: '2026-11-01T01:30', timezone: 'PT' }));
  assert.equal(time.normalizeDeadline({ localDateTime: '2026-11-01T01:30', timezone: 'PT', offset: '-07:00' }).at, '2026-11-01T08:30:00.000Z');
  assert.throws(() => time.normalizeDeadline({ localDateTime: '2026-03-08T02:30', timezone: 'PT', offset: '-08:00' }));
  assert.throws(() => time.normalizeDeadline({ localDateTime: '2026-11-01T01:30', timezone: 'PT', offset: '+08:00' }));
});

test('calendar ranges follow local DST days, Monday weeks and 42-cell month grids', () => {
  const day = time.calendarWindow('2026-03-08', 'day', 'America/Los_Angeles');
  assert.equal(Date.parse(day.to) - Date.parse(day.from), 23 * 3600000);
  assert.deepEqual(day.dates, ['2026-03-08']);
  assert.equal(time.calendarWindow('2026-11-01', 'day', 'America/Los_Angeles').dates.length, 1);
  const week = time.calendarWindow('2026-10-30', 'week', 'Asia/Shanghai');
  assert.equal(week.dates[0], '2026-10-26'); assert.equal(week.dates.length, 7);
  assert.equal(time.calendarWindow('2026-10-30', 'month', 'Asia/Shanghai').dates.length, 42);
  assert.equal(time.localDateTimeAt('2026-11-11T11:59:59Z', 'Etc/GMT+12'), '2026-11-10T23:59:59');
});

test('CCF source UTC offsets normalize without treating PT as fixed UTC-8', () => {
  assert.equal(time.normalizeDeadline({ localDateTime: '2026-10-30T23:59:59', timezone: 'UTC-8' }).at, '2026-10-31T07:59:59.000Z');
  assert.equal(time.normalizeDeadline({ localDateTime: '2026-10-30T23:59:59', timezone: 'UTC+5:30' }).at, '2026-10-30T18:29:59.000Z');
  assert.throws(() => time.normalizeDeadline({ localDateTime: '2026-10-30T23:59:59', timezone: 'UTC+15' }));
});
