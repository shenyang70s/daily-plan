import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTransition, isOverdue } from '../src/task-state.ts';
import { findConflicts } from '../src/calendar-conflict.ts';
import { parseLocalDate, normalizeFixedDeadline } from '../src/time.ts';

test('inbox can become todo; canceled tasks cannot complete without reopening', () => {
  assert.doesNotThrow(() => assertTransition('inbox', 'todo'));
  assert.doesNotThrow(() => assertTransition('done', 'todo'));
  assert.throws(() => assertTransition('canceled', 'done'), /transition/i);
});
test('date-only deadlines remain valid for their whole local calendar day', () => {
  assert.equal(isOverdue({ status: 'todo', due: {kind:'date',date:'2026-10-30'} }, {today:'2026-10-30',now:1793376000000}), false);
  assert.equal(isOverdue({ status: 'todo', due: {kind:'date',date:'2026-10-29'} }, {today:'2026-10-30',now:1793376000000}), true);
  assert.equal(isOverdue({ status: 'done', due: {kind:'date',date:'2026-10-29'} }, {today:'2026-10-30',now:1793376000000}), false);
});
test('half-open schedule intervals only conflict when they actually overlap', () => {
  const fixed=[{id:'meeting',startAt:100,endAt:200}];
  assert.deepEqual(findConflicts({startAt:200,endAt:300},fixed), []);
  assert.deepEqual(findConflicts({startAt:150,endAt:250},fixed).map(x=>x.id), ['meeting']);
  assert.throws(()=>findConflicts({startAt:200,endAt:100},fixed), /range/i);
});
test('calendar dates reject invalid leap days and do not convert into timestamps', () => {
  assert.equal(parseLocalDate('2024-02-29'),'2024-02-29');
  for(const value of ['2026-02-29','2026-04-31','2026-1-01','2026-10-30T00:00:00Z']) assert.throws(()=>parseLocalDate(value),/date/i);
});
test('AoE and UTC offsets preserve seconds without guessing regional timezones', () => {
  assert.deepEqual(normalizeFixedDeadline('2026-11-10 23:59:59','AoE'), {at:'2026-11-11T11:59:59.000Z',timezone:'Etc/GMT+12'});
  assert.equal(normalizeFixedDeadline('2026-11-10 23:59:59','UTC+8').at,'2026-11-10T15:59:59.000Z');
  assert.throws(()=>normalizeFixedDeadline('2026-11-10 23:59:59','PT'), /regional/i);
  assert.throws(()=>normalizeFixedDeadline('TBD','AoE'), /date/i);
});
