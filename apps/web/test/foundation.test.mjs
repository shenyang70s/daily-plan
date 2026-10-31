import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { resolveRoute } from '../src/app/routes.ts';
import { apiRequest, ApiError, setCsrfToken, onSessionExpired } from '../src/lib/api-client.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; setCsrfToken(''); });

test('routes distinguish lists, deep links, settings and unknown paths', () => {
  assert.deepEqual(resolveRoute('/'), { page: 'today' });
  assert.deepEqual(resolveRoute('/inbox'), { page: 'inbox' });
  assert.deepEqual(resolveRoute('/tasks/abc-123'), { page: 'tasks', resourceId: 'abc-123' });
  assert.deepEqual(resolveRoute('/submissions/paper-1/'), { page: 'submissions', resourceId: 'paper-1' });
  assert.deepEqual(resolveRoute('/settings/notifications'), { page: 'settings', section: 'notifications' });
  assert.deepEqual(resolveRoute('/settings'), { page: 'settings', section: 'general' });
  for (const path of ['/unknown', '/tasks/id/extra', '/settings/unknown', '/tasks/%E0%A4%A']) {
    assert.deepEqual(resolveRoute(path), { page: 'notFound' });
  }
});

test('writes send same-origin credentials, CSRF and cancellation signal', async () => {
  const abort = new AbortController();
  setCsrfToken('test-csrf');
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/me/preferences');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers.get('X-CSRF-Token'), 'test-csrf');
    assert.equal(options.headers.get('Content-Type'), 'application/json');
    assert.equal(options.signal, abort.signal);
    return Response.json({ notify: true });
  };
  assert.deepEqual(await apiRequest('/me/preferences', { method: 'PATCH', body: '{}', signal: abort.signal }), { notify: true });
});

test('expired business requests notify the session listener but login failures do not', async () => {
  let expired = 0;
  const unsubscribe = onSessionExpired(() => { expired += 1; });
  try {
    globalThis.fetch = async () => Response.json({ code: 'UNAUTHORIZED', message: '登录已过期' }, { status: 401 });
    await assert.rejects(apiRequest('/me/preferences'), error => error instanceof ApiError && error.status === 401);
    await assert.rejects(apiRequest('/auth/login', { method: 'POST', body: '{}' }), ApiError);
    assert.equal(expired, 1);
  } finally { unsubscribe(); }
});

test('version conflicts retain structured errors and no-content writes succeed', async () => {
  globalThis.fetch = async () => Response.json({ code: 'VERSION_CONFLICT', message: '记录已更新', fieldErrors: { title: ['必填'] } }, { status: 409 });
  await assert.rejects(apiRequest('/tasks/1'), error => error.status === 409 && error.code === 'VERSION_CONFLICT' && error.fieldErrors.title[0] === '必填');
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await apiRequest('/auth/logout', { method: 'POST' }), undefined);
});

test('non-JSON errors remain HTTP errors and aborted requests stay aborted', async () => {
  globalThis.fetch = async () => new Response('upstream unavailable', { status: 502 });
  await assert.rejects(apiRequest('/me'), error => error instanceof ApiError && error.status === 502);
  globalThis.fetch = async () => { throw new DOMException('Aborted', 'AbortError'); };
  await assert.rejects(apiRequest('/me'), error => error.name === 'AbortError');
});

test('calendar event/block deep links retain their resource type', () => {
  assert.deepEqual(resolveRoute('/calendar/events/event-id'), { page: 'calendar', resourceId: 'event-id', resourceKind: 'event' });
  assert.deepEqual(resolveRoute('/calendar/blocks/block-id'), { page: 'calendar', resourceId: 'block-id', resourceKind: 'block' });
  assert.deepEqual(resolveRoute('/calendar/events/%2Fhidden'), { page: 'notFound' });
});

test('API schedule conflicts retain confirmation details', async () => {
  globalThis.fetch = async () => Response.json({ code: 'SCHEDULE_CONFLICT', message: '有冲突', details: { confirmationToken: 'token', conflicts: [{ id: 'event' }] } }, { status: 409 });
  await assert.rejects(apiRequest('/schedule-blocks', { method: 'POST', body: '{}' }), error => error.details.confirmationToken === 'token' && error.details.conflicts[0].id === 'event');
});

test('prototype category navigation and mini-calendar dates survive URL queries and invalid values stay safe', () => {
  assert.deepEqual(resolveRoute('/tasks?type=experiment'), { page: 'tasks', taskType: 'experiment' });
  assert.deepEqual(resolveRoute('/calendar?date=2026-11-02'), { page: 'calendar', date: '2026-11-02' });
  assert.deepEqual(resolveRoute('/tasks?type=other'), { page: 'tasks', taskType: 'other' });
  assert.deepEqual(resolveRoute('/tasks?type=invalid'), { page: 'tasks' });
  assert.deepEqual(resolveRoute('/calendar?date=2026-02-30'), { page: 'calendar' });
});
