import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../dist/app.module.js';
import { IdentityService } from '../../dist/modules/identity/identity.service.js';
import { DatabaseService } from '../../dist/database.service.js';
import { inject } from '../helpers/inject.mjs';

const dateAt = (time, zone) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time);
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key).value).join('-');
};

test('persistent task workflow enforces ownership, versions, idempotency and date semantics', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'research-tasks-http-'));
  const previousDatabase = process.env.DATABASE_PATH, previousOrigin = process.env.APP_ORIGIN;
  process.env.DATABASE_PATH = join(directory, 'db.sqlite');
  process.env.APP_ORIGIN = 'http://app.test';
  let app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); await app.init();
  t.after(async () => {
    await app.close(); rmSync(directory, { recursive: true, force: true });
    if (previousDatabase === undefined) delete process.env.DATABASE_PATH; else process.env.DATABASE_PATH = previousDatabase;
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previousOrigin;
  });
  const identity = app.get(IdentityService);
  for (const username of ['task-owner', 'other-owner']) await identity.createAccount(username, 'task-test-passphrase');
  async function login(username) {
    const response = await inject(app, { method: 'POST', path: '/api/v1/auth/login', headers: { origin: 'http://app.test' }, body: { username, password: 'task-test-passphrase' } });
    assert.equal(response.status, 200);
    return { cookie: response.headers['set-cookie'].split(';')[0], origin: 'http://app.test', 'x-csrf-token': response.body.csrfToken };
  }
  const owner = await login('task-owner'), other = await login('other-owner');
  const request = (method, path, body, headers = owner, key = randomUUID()) => inject(app, { method, path: `/api/v1${path}`, headers: { ...headers, 'idempotency-key': key }, ...(body === undefined ? {} : { body }) });
  const create = async (body, headers = owner, key = randomUUID()) => {
    const response = await request('POST', '/tasks', body, headers, key);
    assert.equal(response.status, 201, JSON.stringify(response.body)); return response.body;
  };
  assert.equal((await inject(app, { path: '/api/v1/tasks' })).status, 401);
  assert.equal((await request('POST', '/tasks', { title: ' ' })).status, 400);
  assert.equal((await request('POST', '/tasks', { title: 'invalid owner', userId: 'other' })).status, 400);
  assert.equal((await request('POST', '/tasks', { title: 'invalid date', due: { kind: 'date', date: '2026-02-30' } })).status, 400);
  const key = randomUUID();
  const task = await create({ title: 'Read a paper' }, owner, key);
  assert.equal(task.status, 'inbox'); assert.equal(task.due, null); assert.equal(task.version, 1);
  const repeats = await Promise.all([create({ title: 'Read a paper' }, owner, key), create({ title: 'Read a paper' }, owner, key)]);
  assert.ok(repeats.every(item => item.id === task.id));
  assert.equal((await request('POST', '/tasks', { title: 'Different body' }, owner, key)).status, 409);
  assert.notEqual((await create({ title: 'Read a paper' }, other, key)).id, task.id);
  for (const [method, suffix, body] of [
    ['GET', '', undefined], ['PATCH', '', { title: 'hijack', expectedVersion: 1 }],
    ['DELETE', '', { expectedVersion: 1 }], ['POST', '/complete', { expectedVersion: 1 }],
    ['POST', '/restore', { expectedVersion: 1 }], ['POST', '/archive', { expectedVersion: 1 }],
  ]) assert.equal((await request(method, `/tasks/${task.id}${suffix}`, body, other)).status, 404);
  const changed = await request('PATCH', `/tasks/${task.id}`, { title: 'Read the revised paper', expectedVersion: 1 });
  assert.equal(changed.status, 200); assert.equal(changed.body.version, 2);
  assert.equal((await request('PATCH', `/tasks/${task.id}`, { note: 'stale overwrite', expectedVersion: 1 })).status, 409);
  assert.equal((await request('POST', `/tasks/${task.id}/archive`, { expectedVersion: 2 })).status, 422);
  const completed = (await request('POST', `/tasks/${task.id}/complete`, { expectedVersion: 2 })).body;
  assert.equal(completed.status, 'done'); assert.ok(completed.completedAt);
  const archived = (await request('POST', `/tasks/${task.id}/archive`, { expectedVersion: completed.version })).body;
  assert.ok(archived.archivedAt);
  assert.ok(!(await request('GET', '/tasks?q=revised')).body.items.some(item => item.id === task.id));
  assert.equal((await request('GET', '/tasks?archived=true&q=revised')).body.items[0].id, task.id);
  const reopened = (await request('POST', `/tasks/${task.id}/reopen`, { expectedVersion: archived.version })).body;
  assert.equal(reopened.status, 'todo'); assert.equal(reopened.completedAt, null); assert.equal(reopened.archivedAt, null);
  const deleted = (await request('DELETE', `/tasks/${task.id}`, { expectedVersion: reopened.version })).body;
  assert.ok(deleted.deletedAt); assert.equal((await request('GET', `/tasks/${task.id}`)).status, 404);
  const restored = await request('POST', `/tasks/${task.id}/restore`, { expectedVersion: deleted.version });
  assert.equal(restored.status, 200); assert.equal(restored.body.deletedAt, null);
  assert.equal((await request('GET', '/tasks?userId=other')).status, 400);

  const project = (await request('POST', '/projects', { name: 'Paper study' })).body;
  assert.ok(project.id);
  assert.equal((await request('GET', `/projects/${project.id}`, undefined, other)).status, 404);
  assert.equal((await create({ title: 'Project task', projectId: project.id })).projectId, project.id);
  assert.equal((await request('POST', '/tasks', { title: 'Wrong project', projectId: project.id }, other)).status, 404);
  const projectUpdated = await request('PATCH', `/projects/${project.id}`, { name: 'Paper revision', expectedVersion: 1 });
  assert.equal(projectUpdated.body.version, 2);
  assert.equal((await request('PATCH', `/projects/${project.id}`, { name: 'Stale', expectedVersion: 1 })).status, 409);
  const attached = (await request('GET', `/tasks?projectId=${project.id}`)).body.items[0];
  assert.equal((await request('DELETE', `/projects/${project.id}`, { expectedVersion: 2 })).status, 200);
  const detached = (await request('GET', `/tasks/${attached.id}`)).body;
  assert.equal(detached.projectId, null); assert.equal(detached.version, attached.version + 1);

  const today = dateAt(Date.now(), 'Asia/Shanghai');
  const tomorrow = dateAt(Date.now() + 2 * 86400000, 'Asia/Shanghai');
  const dueToday = await create({ title: 'Due today without a block', due: { kind: 'date', date: today } });
  const future = await create({ title: 'Future deadline', due: { kind: 'date', date: tomorrow } });
  const scheduled = await create({ title: 'Scheduled with no deadline' });
  const db = app.get(DatabaseService).database;
  const userId = (await request('GET', '/me')).body.user.id;
  const blockId = randomUUID(), now = Date.now();
  db.withTransaction(tx => tx.run('INSERT INTO task_schedule_blocks(id,user_id,task_id,start_at,end_at,timezone,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)', blockId, userId, scheduled.id, now, now + 60000, 'Asia/Shanghai', now, now));
  const todayTasks = (await request('GET', '/tasks?view=today')).body.items;
  assert.ok(todayTasks.some(item => item.id === dueToday.id));
  assert.ok(todayTasks.some(item => item.id === scheduled.id));
  assert.ok(!todayTasks.some(item => item.id === future.id));
  const rescheduled = await request('POST', `/tasks/${scheduled.id}/reschedule`, { scope: 'deadline', expectedVersion: 1, due: { kind: 'instant', at: '2026-11-11T11:59:59Z', timezone: 'Etc/GMT+12' } });
  assert.equal(rescheduled.status, 200); assert.equal(rescheduled.body.due.at, '2026-11-11T11:59:59.000Z');
  assert.equal(db.get('SELECT start_at,end_at FROM task_schedule_blocks WHERE id=?', blockId).start_at, now);
  assert.equal((await request('POST', `/tasks/${scheduled.id}/reschedule`, { scope: 'both', expectedVersion: rescheduled.body.version, due: null })).status, 422);
  assert.equal((await request('GET', '/tasks?view=inbox')).body.items.every(item => item.status === 'inbox'), true);

  await create({ title: 'Pagination A', type: 'research', priority: 'high' });
  await create({ title: 'Pagination B', type: 'research', priority: 'high' });
  const first = (await request('GET', '/tasks?q=Pagination&type=research&priority=high&limit=1')).body;
  assert.equal(first.items.length, 1); assert.ok(first.nextCursor);
  const second = (await request('GET', `/tasks?q=Pagination&type=research&priority=high&limit=1&cursor=${first.nextCursor}`)).body;
  assert.equal(second.items.length, 1); assert.notEqual(first.items[0].id, second.items[0].id); assert.equal(second.nextCursor, null);
  assert.equal((await request('GET', '/tasks?cursor=invalid')).status, 400);
  assert.equal((await request('GET', '/tasks?q=%25')).body.items.length, 0);
  await app.close();
  app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api/v1'); await app.init();
  assert.equal((await request('GET', `/tasks/${dueToday.id}`)).body.due.date, today);
});
