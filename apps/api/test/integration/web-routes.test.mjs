import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../dist/app.module.js';
import { configureWebAssets } from '../../dist/web-assets.js';
import { inject } from '../helpers/inject.mjs';

test('production deep links serve the Web entry without swallowing API or asset errors', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'research-web-routes-'));
  const previousDatabase = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = join(directory, 'db.sqlite');
  const webRoot = join(directory, 'web');
  mkdirSync(join(webRoot, 'assets'), { recursive: true });
  writeFileSync(join(webRoot, 'index.html'), '<!doctype html><div id="root">research-web</div>');
  writeFileSync(join(webRoot, 'assets', 'test.css'), 'body { color: red; }');
  const app = await NestFactory.create(AppModule, { logger: false });
  t.after(async () => {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
    if (previousDatabase === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabase;
  });
  app.setGlobalPrefix('api/v1');
  configureWebAssets(app, webRoot);
  await app.init();
  for (const path of ['/today', '/tasks/task-id', '/settings/notifications', '/unknown-page']) {
    const response = await inject(app, { path, headers: { accept: 'text/html' } });
    assert.equal(response.status, 200);
    assert.match(response.body, /research-web/);
  }
  assert.equal((await inject(app, { path: '/api/v1/health', headers: { accept: 'text/html' } })).body.status, 'ok');
  assert.equal((await inject(app, { path: '/api/v1/me', headers: { accept: 'text/html' } })).status, 401);
  assert.equal((await inject(app, { path: '/api/v1/missing', headers: { accept: 'text/html' } })).status, 404);
  assert.equal((await inject(app, { method: 'POST', path: '/today', headers: { accept: 'text/html' } })).status, 404);
  assert.equal((await inject(app, { path: '/assets/missing.js', headers: { accept: 'text/html' } })).status, 404);
  assert.match((await inject(app, { path: '/assets/test.css' })).body, /color: red/);
});
