import BetterSqlite3 from 'better-sqlite3';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createDatabase} from './database.js';
import type {Database,SqliteConnection} from './database.js';

export function openDatabase(options:{path:string;migrationsPath:string}):Database {
  mkdirSync(dirname(options.path),{recursive:true,mode:0o700});
  const connection=new BetterSqlite3(options.path);
  try{return createDatabase(connection as unknown as SqliteConnection,{migrationsPath:options.migrationsPath})}
  catch(error){connection.close();throw error}
}
