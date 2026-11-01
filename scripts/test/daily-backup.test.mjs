import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { openDatabase } from '../../packages/persistence/dist/production.js';
const root = new URL('../../', import.meta.url).pathname;
test('daily backup runs from any working directory, emits unique snapshots and refuses the live data folder', t => {
  const directory=mkdtempSync(join(tmpdir(),'daily-backup-')),source=join(directory,'data','research.sqlite'),backup=join(directory,'backups');
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const db=openDatabase({path:source,migrationsPath:join(root,'infra/migrations')});
  t.after(()=>db.close());
  db.withTransaction(tx=>tx.run('INSERT INTO users(id,identity_provider,identity_subject,created_at) VALUES(?,?,?,?)','daily-owner','local-password','daily-owner',Date.now()));
  const run=destination=>spawnSync('bash',[join(root,'scripts/backup-daily.sh')],{cwd:directory,env:{...process.env,DATABASE_PATH:source,BACKUP_DIRECTORY:destination,NODE_BINARY:process.execPath,BUILD_REVISION:'daily-test'},encoding:'utf8',timeout:10000});
  for(let attempt=0;attempt<2;attempt++){const result=run(backup);assert.equal(result.status,0,result.stderr);}
  const snapshots=readdirSync(backup).filter(name=>name.endsWith('.sqlite'));assert.equal(snapshots.length,2);
  for(const name of snapshots){const manifest=JSON.parse(readFileSync(join(backup,name+'.metadata.json'),'utf8'));assert.equal(manifest.revision,'daily-test');assert.match(manifest.sha256,/^[a-f0-9]{64}$/);}
  assert.equal(db.get('SELECT count(*) n FROM users').n,1);
  const rejected=run(join(directory,'data','backups'));assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/outside.*data/i);
});
