import '../../apps/api/node_modules/reflect-metadata/Reflect.js';
// This isolated fixture is never imported by the production application.
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../apps/api/dist/app.module.js';
import { IdentityService } from '../../apps/api/dist/modules/identity/identity.service.js';
import { DatabaseService } from '../../apps/api/dist/database.service.js';
import { DeepSeekProvider } from '../../apps/api/dist/modules/ai/provider-adapter.js';
import { ConferenceSource, parseConferenceSnapshot } from '../../apps/api/dist/modules/conferences/conference-source.js';
import { RemindersService } from '../../apps/api/dist/modules/reminders/reminders.service.js';
import { TasksService } from '../../apps/api/dist/modules/tasks/tasks.service.js';
import { configureWebAssets } from '../../apps/api/dist/web-assets.js';
import { AppError } from '../../apps/api/dist/common/app-error.js';
import { normalizeDeadline } from '../../packages/domain/dist/index.js';
import type { InterpretContext } from '../../apps/api/dist/modules/ai/context-builder.js';
if (process.env.RESEARCH_E2E !== '1') throw new Error('This server is only for isolated E2E execution');
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const directory = mkdtempSync(join(tmpdir(), 'research-e2e-'));
process.env.DATABASE_PATH = join(directory, 'test.sqlite');
process.env.NODE_ENV = 'test'; process.env.APP_ORIGIN = `http://127.0.0.1:${process.env.E2E_PORT ?? 4179}`;
delete process.env.DEEPSEEK_API_KEY; delete process.env.AI_API_KEY; delete process.env.PUSH_VAPID_PRIVATE_KEY; delete process.env.PUSH_VAPID_PUBLIC_KEY; delete process.env.PUSH_VAPID_SUBJECT;
const app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api/v1');
const identity = app.get(IdentityService), db = app.get(DatabaseService).database, tasks = app.get(TasksService);
const provider = app.get(DeepSeekProvider);
Object.defineProperty(provider, 'configured', { value: true });
provider.interpret = async (input: InterpretContext) => {
  if (input.text.includes('模拟超时')) throw new AppError(504, 'AI_TIMEOUT', '测试模型超时，未保存任何任务');
  const title = input.text.split('：').at(-1)!.trim() || '隔离测试任务';
  let actions: unknown[];
  if (input.research?.scope?.type === 'task') {
    const task = input.research.scope.resource as { id: string; version: number };
    const start = Date.now() + 60000;
    actions = [{ kind: 'block_create', input: { taskId: task.id, expectedTaskVersion: task.version, startAt: new Date(start).toISOString(), endAt: new Date(start + 300000).toISOString(), timezone: 'Asia/Shanghai' } }];
  } else if (input.text.includes('时段创建')) {
    const local = input.text.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0];
    if (!local) return { kind: 'clarification', question: '请选择具体时段' };
    const start = normalizeDeadline({ localDateTime: local.replace(' ', 'T'), timezone: 'Asia/Shanghai' }).at;
    actions = [{ kind: 'task_create', task: { title, due: null, durationMinutes: 30 }, autoSchedule: false, schedule: { startAt: start, endAt: new Date(Date.parse(start) + 1800000).toISOString(), timezone: 'Asia/Shanghai' } }];
  } else actions = [{ kind: 'task_create', task: { title, due: null }, autoSchedule: false }];
  return { kind: 'plan', title: '隔离研究方案', explanation: 'E2E 使用确定性模型替身；此时尚未保存业务数据', assumptions: [], actions };
};
const yaml = `- title: OSDI
  description: E2E fixture, not real conference facts
  sub: SE
  rank: { ccf: A }
  confs:
    - year: 2027
      id: osdi2027
      link: https://example.test/osdi
      timezone: AoE
      timeline:
        - abstract_deadline: '2026-12-01 23:59:59'
          deadline: '2026-12-08 23:59:59'
          decision_deadline: TBD
`;
const snapshots = ['a', 'b'].map((value, index) => ({ commitSha: value.repeat(40), fetchedAt: '2026-11-01T00:00:00Z', files: [{ path: 'conference/SE/osdi.yml', yaml: index ? yaml.replace('2026-12-08', '2026-12-10') : yaml }] }));
let sourceVersion = 0;
const source = app.get(ConferenceSource);
source.snapshot = (sha: string) => snapshots.find(value => value.commitSha === sha);
source.catalog = async () => { const value = snapshots[sourceVersion]!; return { items: parseConferenceSnapshot(value), commitSha: value.commitSha, fetchedAt: value.fetchedAt, checkedAt: new Date().toISOString(), stale: false }; };
type Request = { headers: Record<string, string | undefined>; body: Record<string, string> };
type Response = { status(code: number): Response; json(body: unknown): void };
const raw = app.getHttpAdapter().getInstance();
raw.post('/__fixtures/:operation', require('express').json(), async (req: Request & { params: { operation: string } }, res: Response) => {
  if (req.headers['x-e2e-fixture'] !== 'isolated-test-only') return res.status(403).json({ error: 'Fixture access denied' });
  try {
    if (req.params.operation === 'account') return res.json(await identity.createAccount(req.body.username, 'e2e-browser-passphrase'));
    if (req.params.operation === 'source') { sourceVersion = req.body.version === 'b' ? 1 : 0; return res.json({ ok: true }); }
    if (req.params.operation === 'notifications') {
      const token = (req.headers.cookie ?? '').split(';').map(value => value.trim()).find(value => value.startsWith('research_session='))?.slice('research_session='.length) ?? '';
      const ctx = identity.authenticate(token), task = tasks.create(ctx, { title: '隔离通知目标', type: 'other', priority: 'normal', due: null, durationMinutes: null, projectId: null, externalUrl: null, note: '' }, randomUUID());
      for (let index = 0; index < 2; index++) {
        const reminder = app.get(RemindersService).create(ctx, { targetType: 'task', targetId: task.id, mode: 'absolute', at: new Date(Date.now() + 600000).toISOString(), timezone: 'Asia/Shanghai' }, randomUUID());
        db.withTransaction((tx: { run: (...args: unknown[]) => unknown }) => {
          tx.run("UPDATE reminders SET status='sent' WHERE id=? AND user_id=?", reminder.id, ctx.userId);
          tx.run("UPDATE outbox_events SET status='sent' WHERE reminder_id=? AND user_id=?", reminder.id, ctx.userId);
          tx.run('INSERT INTO notifications(id,user_id,delivery_key,title,body,resource_type,resource_id,created_at,reminder_id) VALUES(?,?,?,?,?,?,?,?,?)', randomUUID(), ctx.userId, randomUUID(), `隔离通知 ${index}`, '仅供测试', 'task', `/tasks/${task.id}`, Date.now(), reminder.id);
        });
      }
      return res.json({ taskId: task.id });
    }
    return res.status(404).json({ error: 'Unknown fixture operation' });
  } catch { return res.status(400).json({ error: 'Fixture operation failed' }); }
});
configureWebAssets(app, resolve('apps/web/dist'));
await app.listen(Number(process.env.E2E_PORT ?? 4179), '127.0.0.1');
async function stop() { await app.close(); rmSync(directory, { recursive: true, force: true }); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
