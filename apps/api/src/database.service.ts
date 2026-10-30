import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '@research/persistence';
import type { Database } from '@research/persistence';

export const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly database: Database;
  constructor() {
    this.database=openDatabase({path:resolve(workspaceRoot,process.env.DATABASE_PATH || './var/research-tasks.sqlite'),migrationsPath:resolve(workspaceRoot,'infra/migrations')});
  }
  onApplicationShutdown(): void { this.database.close(); }
}
