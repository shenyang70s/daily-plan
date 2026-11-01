import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../../packages/persistence/dist/production.js';
import { IdentityService } from '../../apps/api/dist/modules/identity/identity.service.js';
import { TasksService } from '../../apps/api/dist/modules/tasks/tasks.service.js';
import { hashPassword } from '../../apps/api/dist/modules/identity/password.js';
import { seedResearchData } from '../demo/research-data.ts';
import { copyResearchExamples } from '../demo/copy-research-data.mjs';
const now=Date.parse('2026-11-01T06:00:00Z');
async function fixture(t){const directory=mkdtempSync(join(tmpdir(),'demo-copy-')),db=openDatabase({path:join(directory,'db.sqlite'),migrationsPath:new URL('../../infra/migrations/',import.meta.url).pathname}),identity=new IdentityService(db,()=>now);t.after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});await identity.createAccount('young','source-test-password');const demo=seedResearchData(db,'young',now),tasks=new TasksService(db,identity,()=>now),ctx={userId:demo.userId,sessionId:'test',csrfToken:''};const personal=tasks.create(ctx,{title:'真实个人任务',type:'other',priority:'normal',due:null,durationMinutes:null,projectId:null,externalUrl:null,note:'不复制这项个人数据'},randomUUID());return{db,identity,demo,personal,hash:await hashPassword('sean-test-password')};}
const tables=['projects','tasks','calendar_events','task_schedule_blocks','event_preparation_tasks','submissions','submission_milestones','reminders','outbox_events','notifications','demo_datasets','local_credentials','user_preferences'];
const snapshot=(db,id)=>JSON.stringify(Object.fromEntries(tables.map(table=>[table,db.all(`SELECT * FROM ${table} WHERE user_id=? ORDER BY rowid`,id)])));
test('copies current examples with new IDs and complete owner links, preserving all source data',async t=>{
 const s=await fixture(t);s.db.withTransaction(tx=>tx.run('UPDATE tasks SET title=?,note=? WHERE id=?','用户修订的示例','保留当前笔记',s.demo.ids.tasks.snn_baseline));const before=snapshot(s.db,s.demo.userId);
 const result=copyResearchExamples(s.db,'young','sean',s.hash,now);assert.equal(result.counts.tasks,26);assert.equal(result.counts.blocks,14);assert.equal(result.counts.submissions,4);assert.equal(result.counts.reminders,8);assert.equal(snapshot(s.db,s.demo.userId),before);
 const account=await s.identity.login('sean','sean-test-password','sean-test');assert.equal(account.user.id,result.userId);
 const copied=s.db.all('SELECT * FROM tasks WHERE user_id=?',result.userId);assert.ok(copied.some(row=>row.title==='用户修订的示例'&&row.note==='保留当前笔记'));assert.ok(!copied.some(row=>row.id===s.personal.id||row.title===s.personal.title));
 const sourceIds=new Set(Object.values(s.demo.ids.tasks));assert.ok(copied.every(row=>!sourceIds.has(row.id)));
 for(const row of s.db.all('SELECT * FROM task_schedule_blocks WHERE user_id=?',result.userId))assert.ok(copied.some(task=>task.id===row.task_id));
 const notifications=s.db.all('SELECT * FROM notifications WHERE user_id=?',result.userId);assert.ok(notifications.every(row=>!JSON.stringify(row).includes(s.demo.userId)));assert.deepEqual(s.db.all('PRAGMA foreign_key_check'),[]);
 const retained=snapshot(s.db,result.userId);assert.throws(()=>copyResearchExamples(s.db,'young','sean',s.hash,now),/exists/i);assert.equal(snapshot(s.db,result.userId),retained);assert.equal(snapshot(s.db,s.demo.userId),before);
});
test('copy failure rolls back the new account and examples without touching young',async t=>{
 const s=await fixture(t),before=snapshot(s.db,s.demo.userId);s.db.withTransaction(tx=>tx.run("CREATE TRIGGER reject_demo_clone BEFORE INSERT ON submissions BEGIN SELECT RAISE(ABORT,'copy failure'); END"));assert.throws(()=>copyResearchExamples(s.db,'young','sean',s.hash,now),/copy failure/);assert.equal(s.db.get('SELECT user_id FROM local_credentials WHERE username=?','sean'),undefined);assert.equal(snapshot(s.db,s.demo.userId),before);assert.deepEqual(s.db.all('PRAGMA foreign_key_check'),[]);
});
