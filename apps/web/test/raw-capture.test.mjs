import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rawCaptureTask } from '../src/features/ai/raw-capture.ts';

test('raw fallback preserves text and never infers a deadline or schedule', () => {
  const text = '  明天14点读SNN论文\n保留这些原始要求  ';
  const body = rawCaptureTask(text);
  assert.equal(body.title, '明天14点读SNN论文');
  assert.equal(body.note, text);
  assert.equal(body.due, null);
  assert.equal(body.projectId, null);
  assert.equal(body.durationMinutes, null);
  assert.equal('schedule' in body, false);
});

test('long input produces a valid title without losing the original text', () => {
  const text = 'a'.repeat(199) + '🧠'.repeat(500);
  const body = rawCaptureTask(text);
  assert.ok(body.title.length <= 200);
  assert.ok(!/[\uD800-\uDBFF]$/.test(body.title));
  assert.equal(body.note, text);
  assert.throws(() => rawCaptureTask('   '));
});
