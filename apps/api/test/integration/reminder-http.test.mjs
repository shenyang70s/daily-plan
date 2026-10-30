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
import { ReminderDelivery } from '../../dist/background/delivery.js';
import { inject } from '../helpers/inject.mjs';
test('reminder HTTP validates ownership, CSRF, metadata, versions and event/milestone targets', async t => {
 const directory=mkdtempSync(join(tmpdir(),'research-reminder-http-')),oldDb=process.env.DATABASE_PATH,oldOrigin=process.env.APP_ORIGIN;process.env.DATABASE_PATH=join(directory,'db.sqlite');process.env.APP_ORIGIN='http://app.test';
 const app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api/v1');await app.init();t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});if(oldDb===undefined)delete process.env.DATABASE_PATH;else process.env.DATABASE_PATH=oldDb;if(oldOrigin===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=oldOrigin;});
 assert.equal((await inject(app,{path:'/api/v1/notifications'})).status,401);assert.equal((await inject(app,{path:'/api/v1/notifications/stream'})).status,401);
 const identity=app.get(IdentityService);await identity.createAccount('remind-http','reminder-http-passphrase');await identity.createAccount('remind-other','reminder-http-passphrase');
 async function login(username){const result=await inject(app,{method:'POST',path:'/api/v1/auth/login',headers:{origin:'http://app.test'},body:{username,password:'reminder-http-passphrase'}});return {cookie:result.headers['set-cookie'].split(';')[0],origin:'http://app.test','x-csrf-token':result.body.csrfToken};}
 const headers=await login('remind-http'),other=await login('remind-other');const req=(method,path,body,h=headers,key=randomUUID())=>inject(app,{method,path:'/api/v1'+path,headers:{...h,'idempotency-key':key},...(body===undefined?{}:{body})});
 const at=new Date(Date.now()+3600000).toISOString();const event=(await req('POST','/calendar/events',{title:'Meeting',startAt:at,endAt:new Date(Date.now()+7200000).toISOString(),timezone:'UTC'})).body;
 const input={targetType:'event',targetId:event.id,mode:'relative',offsetMinutes:0,timezone:'UTC'},key=randomUUID();const created=await req('POST','/reminders',input,headers,key);assert.equal(created.status,201,JSON.stringify(created.body));assert.equal((await req('POST','/reminders',input,headers,key)).body.id,created.body.id);
 assert.equal((await req('POST','/reminders',{...input,userId:'owner'})).status,400);assert.equal((await req('POST','/reminders',input,{...headers,'x-csrf-token':''})).status,403);assert.equal((await req('POST','/reminders',input,other)).status,404);assert.equal((await req('GET',`/reminders?targetType=event&targetId=${event.id}`,undefined,other)).status,404);
 const updated=await req('PATCH',`/reminders/${created.body.id}`,{mode:'absolute',at,timezone:'UTC',expectedVersion:created.body.version});assert.equal(updated.status,200);assert.equal((await req('DELETE',`/reminders/${created.body.id}`,{expectedVersion:created.body.version})).status,409);assert.equal((await req('DELETE',`/reminders/${created.body.id}`,{expectedVersion:updated.body.version})).body.status,'canceled');
 const submission=(await req('POST','/submissions',{name:'Reminder conference'})).body,milestone=(await req('POST',`/submissions/${submission.id}/milestones`,{kind:'full_paper',due:{kind:'instant',at,timezone:'UTC'},expectedSubmissionVersion:submission.version})).body;
 const saved=await req('POST','/reminders',{...input,targetType:'milestone',targetId:milestone.id});assert.equal(saved.status,201,JSON.stringify(saved.body));
 const db=app.get(DatabaseService).database,ctx=identity.authenticate(headers.cookie.split('=')[1]);identity.updatePreferences(ctx,{quiet:false});await new ReminderDelivery(db,()=>Date.parse(at)+1).tick();const notification=(await req('GET','/notifications')).body.items[0];assert.equal(notification.href,`/submissions/${submission.id}`);assert.match(notification.body,/来源时间：.*\+00:00 · UTC/);assert.match(notification.body,/\+08:00 · Asia\/Shanghai/);assert.equal((await req('POST',`/notifications/${notification.id}/read`,{},other)).status,404);assert.equal((await req('POST',`/notifications/${notification.id}/read`,{})).status,201);assert.equal((await req('GET','/notifications')).body.unreadCount,0);
});
