import 'reflect-metadata';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {NestFactory} from '@nestjs/core';
import {Module} from '@nestjs/common';
import {APP_FILTER} from '@nestjs/core';
import {randomUUID} from 'node:crypto';
import {IdentityModule} from '../../dist/modules/identity/identity.module.js';
import {IdentityService} from '../../dist/modules/identity/identity.service.js';
import {DatabaseService} from '../../dist/database.service.js';
import {ApiErrorFilter} from '../../dist/common/api-error.filter.js';
import {SubmissionsModule} from '../../dist/modules/submissions/submissions.module.js';
import {SubmissionsService} from '../../dist/modules/submissions/submissions.service.js';
import {ConferencesController} from '../../dist/modules/conferences/conferences.controller.js';
import {ConferenceSource} from '../../dist/modules/conferences/conference-source.js';
import {ConferenceImportService} from '../../dist/modules/conferences/conference-import.service.js';
import {inject} from '../helpers/inject.mjs';
const fixture={commitSha:'a'.repeat(40),fetchedAt:'2026-10-30T00:00:00Z',files:[{path:'conference/SE/osdi.yml',yaml:`- title: OSDI
  description: Operating systems
  sub: SE
  rank: { ccf: A }
  confs:
    - year: 2027
      id: osdi2027
      link: https://www.usenix.org/conference/osdi27
      timezone: UTC
      timeline:
        - abstract_deadline: '2026-12-01 22:59:59'
          deadline: '2026-12-08 22:59:59'
          decision_deadline: TBD
`}]};
test('catalog/import are authenticated, atomic, traced, duplicate-safe and preserve local edits offline',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'research-ccf-'));const oldDb=process.env.DATABASE_PATH,oldOrigin=process.env.APP_ORIGIN;process.env.DATABASE_PATH=join(directory,'db.sqlite');process.env.APP_ORIGIN='http://app.test';let calls=0;
 const fetcher=async()=>{calls++;throw new Error('offline')};
 class TestModule{};Module({imports:[IdentityModule,SubmissionsModule],controllers:[ConferencesController],providers:[{provide:ConferenceSource,useFactory:db=>new ConferenceSource(db.database,fetcher,fixture),inject:[DatabaseService]},{provide:ConferenceImportService,useFactory:(db,source,submissions)=>new ConferenceImportService(db.database,source,submissions),inject:[DatabaseService,ConferenceSource,SubmissionsService]},{provide:APP_FILTER,useClass:ApiErrorFilter}]})(TestModule);
 const app=await NestFactory.create(TestModule,{logger:false});app.setGlobalPrefix('api/v1');await app.init();t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});if(oldDb===undefined)delete process.env.DATABASE_PATH;else process.env.DATABASE_PATH=oldDb;if(oldOrigin===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=oldOrigin;});
 assert.equal((await inject(app,{path:'/api/v1/conferences'})).status,401);await app.get(IdentityService).createAccount('ccf-owner','ccf-test-passphrase');const login=await inject(app,{method:'POST',path:'/api/v1/auth/login',headers:{origin:'http://app.test'},body:{username:'ccf-owner',password:'ccf-test-passphrase'}});const headers={cookie:login.headers['set-cookie'].split(';')[0],origin:'http://app.test','x-csrf-token':login.body.csrfToken};
 const req=(method,path,body,key=randomUUID())=>inject(app,{method,path:'/api/v1'+path,headers:{...headers,'idempotency-key':key},...(body===undefined?{}:{body})});
 const response=await req('GET','/conferences?focus=systems');assert.equal(response.status,200);assert.equal(response.body.stale,true);assert.equal(response.body.items.length,1);const candidate=response.body.items[0];assert.equal(candidate.rank,'A');assert.equal((await req('GET','/conferences?focus=ai')).body.items.length,0);assert.equal(calls,1);
 assert.equal((await req('GET','/submissions')).body.items.length,0);
 const body={candidateId:candidate.id,commitSha:fixture.commitSha,submission:{name:'OSDI',year:2027,round:'main'}};
 assert.equal((await req('POST','/conferences/create-submission',{...body,commitSha:'b'.repeat(40)})).status,409);
 assert.equal((await req('POST','/conferences/create-submission',{...body,deadlines:[]})).status,400);
 const key=randomUUID(),created=await req('POST','/conferences/create-submission',body,key);assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(created.body.created,true);const submission=created.body.submission;assert.equal(submission.milestones.length,3);assert.equal(submission.milestones[0].verifiedAt,null);assert.ok(submission.milestones.every(node=>node.sourceUrl.includes(fixture.commitSha)));assert.equal(submission.conferenceSource.commitSha,fixture.commitSha);assert.equal(submission.conferenceSource.filePath,'conference/SE/osdi.yml');assert.equal((await req('POST','/conferences/create-submission',body,key)).body.submission.id,submission.id);
 const full=submission.milestones.find(node=>node.kind==='full_paper');assert.equal((await req('PATCH',`/milestones/${full.id}`,{expectedVersion:full.version,due:{kind:'date',date:'2026-12-10'},confirmDeadlineChange:true})).status,200);
 const repeat=await req('POST','/conferences/create-submission',body);assert.equal(repeat.body.created,false);assert.equal(repeat.body.submission.id,submission.id);assert.equal(repeat.body.submission.milestones.find(node=>node.id===full.id).due.date,'2026-12-10');assert.equal((await req('GET','/submissions')).body.items.length,1);
 const preview=await req('POST','/conferences/import-preview',{submissionId:submission.id,expectedVersion:repeat.body.submission.version});assert.equal(preview.status,201);assert.equal(preview.body.stale,true);const choices=preview.body.items.map(item=>({kind:item.kind,action:'keep_local'}));assert.equal((await req('POST',`/conferences/import-proposals/${preview.body.id}/confirm`,{confirm:true,choices,commitSha:'spoof'})).status,400);const kept=await req('POST',`/conferences/import-proposals/${preview.body.id}/confirm`,{confirm:true,choices});assert.equal(kept.status,201);assert.equal(kept.body.applied,0);assert.equal(kept.body.submission.version,repeat.body.submission.version);assert.equal((await req('POST',`/conferences/import-proposals/${preview.body.id}/confirm`,{confirm:true,choices})).body.submission.version,kept.body.submission.version);
 const broken={...fixture,files:fixture.files.map(file=>({...file,yaml:file.yaml.replace('      timezone: UTC\n','')}))};const db=app.get(DatabaseService).database;const blockedSource=new ConferenceSource(db,fetcher,broken);const service=new ConferenceImportService(db,blockedSource,app.get(SubmissionsService));assert.throws(()=>service.create(app.get(IdentityService).authenticate(headers.cookie.split('=')[1]),{...body,commitSha:broken.commitSha},randomUUID()),error=>error.code==='CONFERENCE_NOT_IMPORTABLE');
});
