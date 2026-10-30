import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type SqlValue = string | number | bigint | null | Uint8Array;
export interface SqlStatement {
  get(...params: SqlValue[]): Record<string, unknown> | undefined;
  all(...params: SqlValue[]): Record<string, unknown>[];
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}
/** Minimal common SQLite interface; bootstrap supplies the production driver. */
export interface SqliteConnection {
  exec(sql: string): unknown;
  prepare(sql: string): SqlStatement;
  close(): void;
}
export interface Transaction {
  get(sql: string, ...params: SqlValue[]): Record<string, unknown> | undefined;
  all(sql: string, ...params: SqlValue[]): Record<string, unknown>[];
  run(sql: string, ...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}
export interface Database {
  get: Transaction['get'];
  all: Transaction['all'];
  withTransaction<T>(callback: (transaction: Transaction) => T): T;
  ready(): boolean;
  close(): void;
}

export function createDatabase(connection: SqliteConnection, options: { migrationsPath: string; busyTimeoutMs?: number }): Database {
  const timeout = options.busyTimeoutMs ?? 5000;
  if (!Number.isSafeInteger(timeout) || timeout < 0 || timeout > 60_000) throw new Error('Invalid busy timeout');
  connection.exec(`PRAGMA busy_timeout=${timeout}; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;`);
  const scalar = (sql: string) => Object.values(connection.prepare(sql).get() ?? {})[0];
  if (scalar('PRAGMA foreign_keys') !== 1 || scalar('PRAGMA journal_mode') !== 'wal'
    || scalar('PRAGMA synchronous') !== 2 || scalar('PRAGMA busy_timeout') !== timeout) {
    throw new Error('SQLite initialization requires WAL, foreign keys, full sync and bounded lock waiting');
  }
  const files = readdirSync(options.migrationsPath).filter(file => /^\d+_[\w-]+\.sql$/.test(file)).sort();
  if (!files.length) throw new Error('No database migrations found');
  const definitions = files.map(name => {
    const sql = readFileSync(join(options.migrationsPath, name), 'utf8');
    return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  });
  // All migrations and the version ledger commit together, including initial bootstrap.
  connection.exec('BEGIN IMMEDIATE');
  try {
    connection.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at INTEGER NOT NULL) STRICT');
    const applied = connection.prepare('SELECT name,checksum FROM schema_migrations ORDER BY name').all();
    for (let i = 0; i < applied.length; i++) {
      if (definitions[i]?.name !== applied[i]?.name || definitions[i]?.checksum !== applied[i]?.checksum) {
        throw new Error('Database migration history differs from source; refusing to continue');
      }
    }
    for (const migration of definitions.slice(applied.length)) {
      connection.exec(migration.sql);
      connection.prepare('INSERT INTO schema_migrations(name,checksum,applied_at) VALUES(?,?,?)').run(migration.name,migration.checksum,Date.now());
    }
    connection.exec('COMMIT');
  } catch (error) {
    connection.exec('ROLLBACK');
    throw error;
  }
  let closed = false;
  let running = false;
  const ensureOpen = () => { if (closed) throw new Error('Database is closed'); };
  const database: Database = {
    get(sql,...params) { ensureOpen(); return connection.prepare(sql).get(...params); },
    all(sql,...params) { ensureOpen(); return connection.prepare(sql).all(...params); },
    withTransaction<T>(callback: (transaction: Transaction) => T): T {
      ensureOpen();
      if (callback.constructor.name === 'AsyncFunction') throw new Error('Transaction callback must be synchronous');
      if (running) throw new Error('Nested transactions are not supported');
      connection.exec('BEGIN IMMEDIATE');
      running = true;
      let active = true;
      const guard = () => { ensureOpen(); if (!active) throw new Error('Transaction is no longer active'); };
      const tx: Transaction = {
        get(sql,...params) {guard();return connection.prepare(sql).get(...params);},
        all(sql,...params) {guard();return connection.prepare(sql).all(...params);},
        run(sql,...params) {guard();return connection.prepare(sql).run(...params);},
      };
      try {
        const result = callback(tx);
        if (result && (typeof result === 'object' || typeof result === 'function') && 'then' in result) {
          throw new Error('Transaction callback must return a synchronous value');
        }
        connection.exec('COMMIT');
        return result;
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      } finally {
        active = false;
        running = false;
      }
    },
    ready() {
      if (closed) return false;
      try {
        const rows = connection.prepare('SELECT name,checksum FROM schema_migrations ORDER BY name').all();
        return rows.length === definitions.length && rows.every((row,i) => row.name === definitions[i]?.name && row.checksum === definitions[i]?.checksum);
      } catch { return false; }
    },
    close() { if (!closed) { if (running) throw new Error('Cannot close an active transaction'); connection.close(); closed = true; } },
  };
  return database;
}
