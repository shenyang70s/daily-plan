import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../../dist/milestones.js';

test('next milestone uses an explicit clock and keeps date-only deadlines valid for their local day', () => {
  const now = Date.parse('2026-11-10T17:00:00Z');
  const milestones = [{ id: 'unknown', due: null }, { id: 'date', due: { kind: 'date', date: '2026-11-10' } }, { id: 'instant', due: { kind: 'instant', at: '2026-11-11T11:59:59Z', timezone: 'Etc/GMT+12' } }];
  assert.equal(rules.nextMilestone(milestones, now, 'America/Los_Angeles').id, 'date');
  assert.equal(rules.nextMilestone(milestones, now, 'Asia/Shanghai').id, 'instant');
  assert.equal(rules.nextMilestone([{ id: 'unknown', due: null }], now, 'Asia/Shanghai'), null);
  assert.equal(rules.deadlineCountdown(milestones[1].due, now, 'America/Los_Angeles').state, 'upcoming');
  assert.equal(rules.deadlineCountdown(milestones[1].due, now, 'Asia/Shanghai').state, 'passed');
});

test('shared deadline formatting preserves date-only semantics and local/source seconds', () => {
  const due = { kind: 'instant', at: '2026-11-11T11:59:59Z', timezone: 'Etc/GMT+12' };
  assert.match(rules.formatDeadline(due, 'AoE'), /2026-11-10 23:59:59.*-12:00/);
  assert.match(rules.formatDeadline(due, 'Asia/Shanghai'), /2026-11-11 19:59:59.*\+08:00/);
  assert.equal(rules.formatDeadline({ kind: 'date', date: '2026-11-10' }, 'Asia/Shanghai'), '2026-11-10');
  assert.equal(rules.formatDeadline(null, 'Asia/Shanghai'), '');
  assert.equal(rules.deadlineCountdown(due, Date.parse(due.at) + 1, 'Asia/Shanghai').state, 'passed');
});
