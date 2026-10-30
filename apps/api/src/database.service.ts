import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import BetterSqlite3 from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@research/persistence';
import type { Database, SqliteConnection } from '@research/persistence';

export const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly database: Database;
  constructor() {
    const path = resolve(workspaceRoot, process.env.DATABASE_PATH || './var/research-tasks.sqlite');
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const connection = new BetterSqlite3(path);
    try {
      this.database = createDatabase(connection as unknown as SqliteConnection, {
        migrationsPath: resolve(workspaceRoot, 'infra/migrations'),
      });
    } catch (error) { connection.close(); throw error; }
  }
  onApplicationShutdown(): void { this.database.close(); }
}
