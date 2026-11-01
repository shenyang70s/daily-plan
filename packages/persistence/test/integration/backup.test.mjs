import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import BetterSqlite3 from 'better-sqlite3';
import { createDatabase } from '../../dist/index.js';
import { backupDatabase, restoreDatabase } from '../../dist/backup.js';
const migrationsPath = new URL('../../../../infra/migrations/', import.meta.url).pathname;
function fixture(t) { const directory=mkdtempSync(join(tmpdir(),'recovery-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));return {directory,source:join(directory,'live.sqlite'),backup:join(directory,'snapshot.sqlite'),restored:join(directory,'restored.sqlite')}; }
test('online backup captures committed WAL rows while source stays open; restore validates and preserves them',async t=>{
 const f=fixture(t),connection=new BetterSqlite3(f.source),db=createDatabase(connection,{migrationsPath});t.after(()=>db.close());
 connection.pragma('wal_autocheckpoint = 0');
 db.withTransaction(tx=>tx.run('INSERT INTO users(id,identity_provider,identity_subject,created_at) VALUES(?,?,?,?)','owner','local-password','owner',Date.now()));
 const saved=await backupDatabase({source:f.source,destination:f.backup,migrationsPath,revision:'test-revision'});
 assert.equal(saved.revision,'test-revision');assert.equal(saved.migrations.length,13);assert.match(saved.sha256,/^[a-f0-9]{64}$/);
 db.withTransaction(tx=>tx.run('INSERT INTO users(id,identity_provider,identity_subject,created_at) VALUES(?,?,?,?)','later','local-password','later',Date.now()));
 await restoreDatabase({backup:f.backup,destination:f.restored,migrationsPath});
 const recovered=new BetterSqlite3(f.restored,{readonly:true});try{assert.equal(recovered.prepare('SELECT count(*) n FROM users').get().n,1);assert.ok(recovered.prepare('SELECT id FROM users WHERE id=?').get('owner'));assert.deepEqual(recovered.pragma('foreign_key_check'),[]);}finally{recovered.close();}
 assert.equal(db.get('SELECT count(*) n FROM users').n,2);
});
test('backup/restore never overwrite databases or sidecars, and reject tampered backups',async t=>{
 const f=fixture(t),db=createDatabase(new BetterSqlite3(f.source),{migrationsPath});db.close();
 await backupDatabase({source:f.source,destination:f.backup,migrationsPath});
 const original=readFileSync(f.source);
 await assert.rejects(restoreDatabase({backup:f.backup,destination:f.source,migrationsPath}),/exist/i);
 assert.deepEqual(readFileSync(f.source),original);
 writeFileSync(f.restored+'-wal','active-sidecar');
 await assert.rejects(restoreDatabase({backup:f.backup,destination:f.restored,migrationsPath}),/exist/i);
 await assert.rejects(backupDatabase({source:f.source,destination:f.backup,migrationsPath}),/exist/i);
 const bytes=readFileSync(f.backup);bytes[100]^=1;writeFileSync(f.backup,bytes);
 await assert.rejects(restoreDatabase({backup:f.backup,destination:join(f.directory,'corrupt.sqlite'),migrationsPath}),/checksum/i);
});
test('restore refuses a modified migration history without publishing a destination',async t=>{
 const f=fixture(t),db=createDatabase(new BetterSqlite3(f.source),{migrationsPath});
 db.withTransaction(tx=>tx.run('UPDATE schema_migrations SET checksum=? WHERE name=?','x','001_identity_tasks_calendar.sql'));db.close();
 await assert.rejects(backupDatabase({source:f.source,destination:f.backup,migrationsPath}),/migration/i);
});

test('a restored older migration prefix upgrades cleanly; broken foreign keys cannot be backed up', async t => {
 const f=fixture(t),older=join(f.directory,'old-migrations');mkdirSync(older);
 copyFileSync(join(migrationsPath,'001_identity_tasks_calendar.sql'),join(older,'001_identity_tasks_calendar.sql'));
 createDatabase(new BetterSqlite3(f.source),{migrationsPath:older}).close();
 await backupDatabase({source:f.source,destination:f.backup,migrationsPath});
 await restoreDatabase({backup:f.backup,destination:f.restored,migrationsPath});
 const connection=new BetterSqlite3(f.restored),db=createDatabase(connection,{migrationsPath});
 assert.equal(db.ready(),true);assert.equal(db.all('SELECT name FROM schema_migrations').length,13);
 connection.pragma('foreign_keys=OFF');
 connection.prepare('INSERT INTO user_preferences(user_id,updated_at) VALUES(?,?)').run('missing-owner',Date.now());db.close();
 await assert.rejects(backupDatabase({source:f.restored,destination:join(f.directory,'invalid.sqlite'),migrationsPath}),/foreign_key_check/);
});
test('backup and restore CLIs operate on explicit paths without reading live application data', t => {
 const f=fixture(t),root=new URL('../../../../',import.meta.url).pathname;
 createDatabase(new BetterSqlite3(f.source),{migrationsPath}).close();
 const run=(script,args)=>spawnSync(process.execPath,['--import','tsx',join(root,'scripts',script),...args],{cwd:root,env:{...process.env,DATABASE_PATH:f.source,BUILD_REVISION:'cli-test'},encoding:'utf8',timeout:10000});
 const backed=run('backup.ts',[f.backup]);assert.equal(backed.status,0,backed.stderr);assert.equal(JSON.parse(backed.stdout).revision,'cli-test');
 const restored=run('restore.ts',[f.backup,f.restored]);assert.equal(restored.status,0,restored.stderr);assert.equal(JSON.parse(restored.stdout).path,f.restored);
 const overwrite=run('restore.ts',[f.backup,f.source]);assert.notEqual(overwrite.status,0);assert.match(overwrite.stderr,/exist/i);
});
