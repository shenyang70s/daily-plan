import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../dist/app.module.js';
import { IdentityService } from '../../dist/modules/identity/identity.service.js';
import { DatabaseService } from '../../dist/database.service.js';
import { inject } from '../helpers/inject.mjs';
test('AI unavailable/disabled is explicit, authenticated and independent of core CRUD',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'research-ai-http-')),saved={...process.env};process.env.DATABASE_PATH=join(directory,'db.sqlite');process.env.APP_ORIGIN='http://app.test';delete process.env.DEEPSEEK_API_KEY;delete process.env.AI_API_KEY;process.env.AI_PROVIDER='deepseek';const app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api/v1');await app.init();t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});for(const name of ['DATABASE_PATH','APP_ORIGIN','DEEPSEEK_API_KEY','AI_API_KEY','AI_PROVIDER'])if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];});
 assert.equal((await inject(app,{path:'/api/v1/ai/config'})).status,401);await app.get(IdentityService).createAccount('ai-owner','ai-test-passphrase');const login=await inject(app,{method:'POST',path:'/api/v1/auth/login',headers:{origin:'http://app.test'},body:{username:'ai-owner',password:'ai-test-passphrase'}}),headers={cookie:login.headers['set-cookie'].split(';')[0],origin:'http://app.test','x-csrf-token':login.body.csrfToken};const req=(method,path,body)=>inject(app,{method,path:'/api/v1'+path,headers:{...headers,'idempotency-key':randomUUID()},...(body===undefined?{}:{body})});
 assert.equal((await req('GET','/ai/config')).body.configured,false);assert.equal((await req('POST','/ai/interpret',{text:'今天有什么任务',requestId:randomUUID()})).status,503);assert.equal((await req('POST','/ai/interpret',{text:'今天有什么任务',requestId:randomUUID(),userId:'other'})).status,400);assert.equal((await inject(app,{method:'POST',path:'/api/v1/ai/interpret',headers:{...headers,'x-csrf-token':''},body:{text:'x',requestId:randomUUID()}})).status,403);const missingRun=randomUUID();assert.equal((await req('POST',`/ai/runs/${missingRun}/confirm`,{confirm:false})).status,400);assert.equal((await req('POST',`/ai/runs/${missingRun}/confirm`,{confirm:true,actions:[]})).status,400);assert.equal((await req('POST',`/ai/runs/${missingRun}/confirm`,{confirm:true})).status,404);assert.equal((await inject(app,{method:'POST',path:`/api/v1/ai/runs/${missingRun}/confirm`,headers:{...headers,'x-csrf-token':''},body:{confirm:true}})).status,403);await req('PATCH','/me/preferences',{ai:false});assert.equal((await req('GET','/ai/config')).body.enabled,false);assert.equal((await req('POST','/ai/interpret',{text:'今天有什么任务',requestId:randomUUID()})).status,403);assert.equal((await req('POST','/tasks',{title:'Ordinary CRUD still works'})).status,201);assert.equal(app.get(DatabaseService).database.get('SELECT count(*) n FROM ai_runs').n,0);
});
