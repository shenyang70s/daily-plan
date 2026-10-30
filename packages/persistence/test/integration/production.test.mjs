import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {openDatabase} from '../../dist/production.js';
const migrationsPath=fileURLToPath(new URL('../../../../infra/migrations/',import.meta.url));
test('production better-sqlite3 driver migrates, commits and reopens a persistent file',t=>{
 const directory=mkdtempSync(join(tmpdir(),'research-driver-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const options={path:join(directory,'nested/db.sqlite'),migrationsPath};
 const db=openDatabase(options);
 try{db.withTransaction(tx=>tx.run("INSERT INTO users(id,identity_provider,identity_subject,created_at) VALUES('u1','issuer','subject',1)"));assert.equal(db.ready(),true)}finally{db.close()}
 const reopened=openDatabase(options);try{assert.equal(reopened.get('SELECT id FROM users').id,'u1')}finally{reopened.close()}
});
