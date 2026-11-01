import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../dist/app.module.js';
import { IdentityService } from '../../dist/modules/identity/identity.service.js';
import { DatabaseService } from '../../dist/database.service.js';
import { seedResearchData } from '../../../../scripts/demo/research-data.ts';
import { inject } from '../helpers/inject.mjs';

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'account-data-')), saved = { ...process.env };
  process.env.DATABASE_PATH = join(directory, 'db.sqlite'); process.env.APP_ORIGIN = 'http://app.test';
  delete process.env.DEEPSEEK_API_KEY;
  const app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api/v1'); await app.init();
  t.after(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); for (const key of ['DATABASE_PATH', 'APP_ORIGIN', 'DEEPSEEK_API_KEY']) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
  const identity = app.get(IdentityService), db = app.get(DatabaseService).database;
  await identity.createAccount('data-owner', 'account-data-passphrase'); await identity.createAccount('data-other', 'account-data-passphrase');
  const owned = seedResearchData(db, 'data-owner'), other = seedResearchData(db, 'data-other');
  const login = await inject(app, { method: 'POST', path: '/api/v1/auth/login', headers: { origin: 'http://app.test' }, body: { username: 'data-owner', password: 'account-data-passphrase' } });
  const headers = { cookie: login.headers['set-cookie'].split(';')[0], origin: 'http://app.test', 'x-csrf-token': login.body.csrfToken };
  const request = (method, path, body, extra = {}) => inject(app, { method, path: '/api/v1' + path, headers: { ...headers, 'idempotency-key': randomUUID(), ...extra }, ...(body === undefined ? {} : { body }) });
  const session = db.get('SELECT id FROM sessions WHERE user_id=?', owned.userId);
  db.withTransaction(tx => tx.run('INSERT INTO push_subscriptions(id,user_id,session_id,endpoint_hash,endpoint,p256dh,auth,vapid_public_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)', randomUUID(), owned.userId, session.id, 'export-fixture-hash', 'https://example.test/export-push-secret', 'PUSH_PRIVATE_KEY', 'PUSH_AUTH_SECRET', 'VAPID', Date.now(), Date.now()));
  const task = db.get("SELECT id,version FROM tasks WHERE user_id=? AND status='inbox' LIMIT 1", owned.userId);
  const plan = await request('POST', '/ai/plan', { kind: 'batch', operation: 'complete', tasks: [{ id: task.id, expectedVersion: task.version }] });
  assert.equal(plan.status, 200);
  assert.equal((await request('POST', `/ai/runs/${plan.body.id}/confirm`, { confirm: true })).status, 200);
  assert.equal((await request('POST', `/ai/runs/${plan.body.id}/undo`, { confirm: true })).status, 200);
  return { app, db, identity, owned, other, request, headers };
}

test('JSON and CSV exports contain only owner data and omit authentication and push secrets', async t => {
  const s = await fixture(t);
  s.db.withTransaction(tx => tx.run('UPDATE tasks SET title=?,note=? WHERE id=?', '=1+1', 'own private note\nwith "quotes", commas', Object.values(s.owned.ids.tasks)[0]));
  assert.equal((await inject(s.app, { path: '/api/v1/account/export?format=json' })).status, 401);
  assert.equal((await s.request('GET', '/account/export?format=xml')).status, 400);
  assert.equal((await s.request('GET', '/account/export?format=json&userId=' + s.other.userId)).status, 400);
  const response = await s.request('GET', '/account/export?format=json'); assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store'); assert.match(response.headers['content-disposition'], /attachment/);
  assert.equal(response.body.schemaVersion, 1); assert.equal(response.body.account.username, 'data-owner');
  assert.equal(response.body.data.tasks.length, 26); assert.equal(response.body.data.submissions.length, 4);
  assert.equal(response.body.data.milestones.length, 13); assert.equal(response.body.data.scheduleBlocks.length, 14);
  assert.ok(response.body.data.tasks.some(row => row.title === '=1+1' && row.note.includes('own private note\n')));
  const encoded = JSON.stringify(response.body);
  assert.ok(!encoded.includes(s.other.userId));
  for (const forbidden of ['password_hash', 'token_hash', 'csrf_hash', 'p256dh', 'vapid_public_key', 'account-data-passphrase', 'PUSH_PRIVATE_KEY', 'PUSH_AUTH_SECRET', 'export-push-secret']) assert.ok(!encoded.includes(forbidden));
  const csv = await s.request('GET', '/account/export?format=csv'); assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'], /text\/csv/); assert.match(csv.body, /record_type,record_id,data_json/);
  assert.ok(csv.body.includes('own private note')); assert.ok(!csv.body.includes(s.other.userId));
});

test('account deletion requires exact confirmation, current password and CSRF, then cascades all owner rows', async t => {
  const s = await fixture(t), password = 'account-data-passphrase', confirmation = '删除账户 data-owner';
  const session = s.db.get('SELECT id FROM sessions WHERE user_id=?', s.owned.userId);
  s.db.withTransaction(tx => tx.run('INSERT INTO push_subscriptions(id,user_id,session_id,endpoint_hash,endpoint,p256dh,auth,vapid_public_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)', randomUUID(), s.owned.userId, session.id, 'fixture-hash', 'https://example.test/push-secret', 'PUSH_PRIVATE_KEY', 'PUSH_AUTH_SECRET', 'VAPID', Date.now(), Date.now()));
  const beforeOther = s.db.all('SELECT * FROM tasks WHERE user_id=? ORDER BY id', s.other.userId);
  assert.equal((await s.request('DELETE', '/account', { password, confirmation }, { 'x-csrf-token': '' })).status, 403);
  assert.equal((await s.request('DELETE', '/account', { password })).status, 400);
  assert.equal((await s.request('DELETE', '/account', { password, confirmation: '删除账户 data-other' })).status, 400);
  assert.equal((await s.request('DELETE', '/account', { password: 'wrong-password', confirmation })).status, 403);
  assert.ok(s.db.get('SELECT id FROM users WHERE id=?', s.owned.userId));
  const response = await s.request('DELETE', '/account', { password, confirmation }); assert.equal(response.status, 204);
  assert.match(response.headers['set-cookie'], /Max-Age=0/);
  for (const table of ['users', 'local_credentials', 'sessions', 'user_preferences', 'projects', 'tasks', 'task_schedule_blocks', 'calendar_events', 'event_preparation_tasks', 'submissions', 'submission_milestones', 'reminders', 'outbox_events', 'notifications', 'push_subscriptions', 'push_deliveries', 'idempotency_keys', 'demo_datasets', 'ai_runs', 'ai_executions', 'ai_action_audits', 'ai_execution_undos', 'ai_delete_confirmations', 'conference_imports', 'conference_update_proposals', 'conference_update_audits', 'conference_import_snapshots']) {
    assert.equal(Number(s.db.get(`SELECT count(*) n FROM ${table} WHERE ${table === 'users' ? 'id' : 'user_id'}=?`, s.owned.userId).n), 0, table);
  }
  assert.equal((await s.request('GET', '/me')).status, 401);
  assert.deepEqual(s.db.all('SELECT * FROM tasks WHERE user_id=? ORDER BY id', s.other.userId), beforeOther);
  assert.deepEqual(s.db.all('PRAGMA foreign_key_check'), []);
});

test('running information is owner-scoped and reports queues, AI failure/time and ordinary API latency', async t => {
  const s = await fixture(t);
  await s.request('GET', '/tasks'); await s.request('GET', '/tasks/not-found');
  const response = await s.request('GET', '/account/status'); assert.equal(response.status, 200);
  assert.equal(response.body.reminders.failedDeliveries, 1);
  assert.ok(response.body.api.requests >= 2); assert.ok(response.body.api.errors >= 1);
  assert.ok(response.body.api.avgDurationMs >= 0); assert.ok(response.body.api.p95DurationMs >= 0);
  assert.equal(response.body.ai.failed, 0); assert.equal(response.body.ai.failureRate, null);
  assert.ok(!JSON.stringify(response.body).includes(s.other.userId));
  const session = s.db.get('SELECT id FROM sessions WHERE user_id=?', s.owned.userId), now = Date.now();
  s.db.withTransaction(tx => {
    for (const status of ['succeeded', 'failed']) tx.run('INSERT INTO ai_runs(id,user_id,session_id,request_id,input_text,status,phase,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)', randomUUID(), s.owned.userId, session.id, randomUUID(), 'PRIVATE_PROMPT', status, status, now - 600, now);
    tx.run('INSERT INTO ai_runs(id,user_id,session_id,request_id,input_text,status,phase,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)', randomUUID(), s.owned.userId, session.id, randomUUID(), 'PRIVATE_PROMPT', 'canceled', 'canceled', now - 600, now);
  });
  const measured = (await s.request('GET', '/account/status')).body;
  assert.equal(measured.ai.completed, 2); assert.equal(measured.ai.failed, 1); assert.equal(measured.ai.failureRate, .5); assert.equal(measured.ai.avgDurationMs, 600);
  assert.ok(!JSON.stringify(measured).includes('PRIVATE_PROMPT'));
  assert.equal((await inject(s.app, { path: '/api/v1/account/status' })).status, 401);
});


test('deletion rate limits password retries and rechecks a session revoked during verification', async t => {
  const s = await fixture(t), confirmation = '删除账户 data-owner';
  const { DeletionService } = await import('../../dist/modules/account/deletion.service.js');
  const ctx = s.identity.authenticate(s.headers.cookie.slice('research_session='.length));
  const pending = s.app.get(DeletionService).delete(ctx, { password: 'account-data-passphrase', confirmation });
  s.identity.logout(s.headers.cookie.slice('research_session='.length));
  await assert.rejects(pending, error => error.status === 401);
  assert.ok(s.db.get('SELECT id FROM users WHERE id=?', s.owned.userId));
  const login = await s.identity.login('data-owner', 'account-data-passphrase', 'retry-fixture');
  const current = s.identity.authenticate(login.token), service = new DeletionService(s.db);
  for (let index = 0; index < 5; index++) await assert.rejects(service.delete(current, { password: 'wrong-password', confirmation }), error => error.status === 403);
  await assert.rejects(service.delete(current, { password: 'account-data-passphrase', confirmation }), error => error.status === 429);
  assert.ok(s.db.get('SELECT id FROM users WHERE id=?', s.owned.userId));
});

test('optional request logs use route templates and omit bodies, queries and credentials', async t => {
  const s = await fixture(t), entries = [], saved = process.env.REQUEST_LOGS;
  const { Logger } = await import('@nestjs/common');
  Logger.overrideLogger({ log: value => entries.push(value), error() {}, warn() {} });
  process.env.REQUEST_LOGS = 'true';
  try {
    const created = await s.request('POST', '/tasks', { title: 'PRIVATE_TASK_LOG_TEST', note: 'PRIVATE_NOTE_LOG_TEST' });
    await s.request('GET', `/tasks/${created.body.id}?q=PRIVATE_QUERY_LOG_TEST`);
    await s.request('DELETE', '/account', { password: 'PRIVATE_PASSWORD_LOG_TEST', confirmation: '删除账户 data-owner' });
    assert.ok(entries.length >= 3);
    const text = entries.join('\n');
    for (const secret of ['PRIVATE_TASK_LOG_TEST', 'PRIVATE_NOTE_LOG_TEST', 'PRIVATE_QUERY_LOG_TEST', 'PRIVATE_PASSWORD_LOG_TEST', s.headers.cookie, s.headers['x-csrf-token'], created.body.id]) assert.ok(!text.includes(secret));
    const parsed = entries.map(value => JSON.parse(value));
    assert.ok(parsed.some(value => value.route.endsWith('/tasks/:id')));
    assert.ok(parsed.every(value => value.requestId && typeof value.durationMs === 'number'));
  } finally {
    Logger.overrideLogger(false);
    if (saved === undefined) delete process.env.REQUEST_LOGS; else process.env.REQUEST_LOGS = saved;
  }
});
