import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from '../src/database.ts';

const migrations=fileURLToPath(new URL('../../../infra/migrations/',import.meta.url));
function fixture(t,options={}) {
  const directory=mkdtempSync(join(tmpdir(),'research-tasks-test-'));
  const path=join(directory,'database.sqlite');
  const connection=new DatabaseSync(path);
  const db=createDatabase(connection,{migrationsPath:migrations,...options});
  t.after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
  return {db,path,directory};
}
function insertUser(tx,id='alice') { tx.run('INSERT INTO users(id,identity_provider,identity_subject,created_at) VALUES(?,?,?,?)',id,'https://issuer.example',id,1); }

test('migrations persist to disk and rerunning does not recreate tables',t=>{
  const {db,path}=fixture(t);
  db.withTransaction(tx=>insertUser(tx));
  const second=createDatabase(new DatabaseSync(path),{migrationsPath:migrations});
  try {assert.equal(second.get('SELECT id FROM users').id,'alice');assert.equal(second.ready(),true);assert.equal(second.get('SELECT count(*) AS count FROM schema_migrations').count,3);} finally {second.close();}
});
test('SQLite foreign keys reject orphan tasks and transactions roll back all writes',t=>{
  const {db}=fixture(t);
  assert.throws(()=>db.withTransaction(tx=>{insertUser(tx);tx.run("INSERT INTO tasks(id,user_id,title,type,status,priority,created_at,updated_at) VALUES('t1','nobody','test','research','todo','normal',1,1)");}),/FOREIGN KEY/);
  assert.equal(db.get('SELECT count(*) AS count FROM users').count,0);
  assert.throws(()=>db.withTransaction(tx=>{insertUser(tx);throw new Error('abort');}),/abort/);
  assert.equal(db.get('SELECT count(*) AS count FROM users').count,0);
});
test('schema forbids mixing a pure-date deadline with an exact timestamp',t=>{
  const {db}=fixture(t);db.withTransaction(tx=>insertUser(tx));
  assert.throws(()=>db.withTransaction(tx=>tx.run("INSERT INTO tasks(id,user_id,title,type,status,priority,due_date,due_at,created_at,updated_at) VALUES('t1','alice','test','research','todo','normal','2026-10-30',1,1,1)")),/CHECK/);
});
test('composite foreign keys prevent cross-user project assignment',t=>{
  const {db}=fixture(t);db.withTransaction(tx=>{insertUser(tx);insertUser(tx,'bob');tx.run("INSERT INTO projects(id,user_id,name,created_at,updated_at) VALUES('p1','bob','Bob project',1,1)");});
  assert.throws(()=>db.withTransaction(tx=>tx.run("INSERT INTO tasks(id,user_id,project_id,title,type,status,priority,created_at,updated_at) VALUES('t1','alice','p1','test','research','todo','normal',1,1)")),/FOREIGN KEY/);
});
test('async transaction callbacks are rejected before they can perform writes',t=>{
  const {db}=fixture(t);
  assert.throws(()=>db.withTransaction(async tx=>insertUser(tx)),/synchronous/);
  assert.equal(db.get('SELECT count(*) AS count FROM users').count,0);
});
test('a transaction handle cannot write after commit',t=>{
  const {db}=fixture(t);let handle;db.withTransaction(tx=>{handle=tx;insertUser(tx);});
  assert.throws(()=>handle.run("DELETE FROM users"),/active/);
  assert.equal(db.get('SELECT count(*) AS count FROM users').count,1);
});
test('WAL readers can read committed data while a writer owns a transaction; competing writes are bounded',t=>{
  const {db,path}=fixture(t,{busyTimeoutMs:20});
  db.withTransaction(tx=>insertUser(tx));
  const competing=createDatabase(new DatabaseSync(path),{migrationsPath:migrations,busyTimeoutMs:20});
  try {
    db.withTransaction(tx=>{tx.run("UPDATE users SET display_name='pending' WHERE id='alice'");assert.equal(competing.get("SELECT display_name FROM users WHERE id='alice'").display_name,null);assert.throws(()=>competing.withTransaction(other=>other.run("UPDATE users SET display_name='second' WHERE id='alice'")),/locked|busy/i);});
    competing.withTransaction(tx=>tx.run("UPDATE users SET display_name='recovered' WHERE id='alice'"));
    assert.equal(db.get('SELECT display_name FROM users').display_name,'recovered');
  } finally {competing.close();}
});
test('modified migration files are rejected instead of silently changing an existing schema',t=>{
  const {db,path,directory}=fixture(t);const custom=join(directory,'migrations');mkdirSync(custom);
  writeFileSync(join(custom,'001_identity_tasks_calendar.sql'),'CREATE TABLE changed(id INTEGER);');
  const raw=new DatabaseSync(path);
  try{assert.throws(()=>createDatabase(raw,{migrationsPath:custom}),/migration/i);}finally{raw.close();}
  assert.equal(db.ready(),true);
});
