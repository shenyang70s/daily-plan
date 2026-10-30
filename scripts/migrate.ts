import BetterSqlite3 from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createDatabase } from '../packages/persistence/src/database.js';
import type { SqliteConnection } from '../packages/persistence/src/database.js';

const path = resolve(process.env.DATABASE_PATH || './var/research-tasks.sqlite');
mkdirSync(dirname(path), {recursive:true,mode:0o700});
const connection = new BetterSqlite3(path);
try {
  const database = createDatabase(connection as unknown as SqliteConnection, {migrationsPath:resolve('infra/migrations')});
  console.log(`Database schema ready (${database.all('SELECT name FROM schema_migrations').length} migrations)`);
} finally {connection.close();}
