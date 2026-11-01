import BetterSqlite3 from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, link, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { constants } from 'node:fs';

interface Migration { name: string; checksum: string }
export interface BackupMetadata { formatVersion: 1; createdAt: string; revision: string; sha256: string; migrations: Migration[] }
interface BackupOptions { source: string; destination: string; migrationsPath: string; revision?: string }
interface RestoreOptions { backup: string; destination: string; migrationsPath: string }
async function absent(path: string): Promise<void> {
  try { await lstat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw new Error(`Destination already exists: ${path}`);
}
async function destinationAvailable(path: string): Promise<void> { for (const suffix of ['', '-wal', '-shm', '.metadata.json']) await absent(path + suffix); }
async function digest(path: string): Promise<string> { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); }
async function definitions(directory: string): Promise<Migration[]> {
  const names = (await readdir(directory)).filter(name => /^\d+_[\w-]+\.sql$/.test(name)).sort();
  if (!names.length) throw new Error('No source migrations found');
  return Promise.all(names.map(async name => ({ name, checksum: createHash('sha256').update(await readFile(join(directory, name))).digest('hex') })));
}
function inspect(path: string, expected: Migration[]): Migration[] {
  const db = new BetterSqlite3(path, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('SQLite integrity_check failed');
    if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('SQLite foreign_key_check failed');
    const applied = db.prepare('SELECT name,checksum FROM schema_migrations ORDER BY name').all() as Migration[];
    if (!applied.length || applied.length > expected.length || applied.some((row, index) => row.name !== expected[index]?.name || row.checksum !== expected[index]?.checksum)) throw new Error('Backup migration history differs from application source');
    return applied;
  } finally { db.close(); }
}
async function metadata(path: string): Promise<BackupMetadata> {
  const value = JSON.parse(await readFile(path + '.metadata.json', 'utf8')) as BackupMetadata;
  if (value.formatVersion !== 1 || !Number.isFinite(Date.parse(value.createdAt)) || typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256) || !Array.isArray(value.migrations)) throw new Error('Invalid backup metadata');
  return value;
}
async function staging(destination: string): Promise<string> {
  await mkdir(dirname(destination), { recursive: true }); await destinationAvailable(destination);
  const directory = await mkdtemp(join(dirname(destination), '.research-recovery-')); await chmod(directory, 0o700); return directory;
}
async function sync(path: string): Promise<void> { const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
async function publish(file: string, destination: string): Promise<void> {
  await destinationAvailable(destination);
  // Same-filesystem hard-link publication is atomic and refuses an existing file.
  await sync(file); await link(file, destination); await sync(dirname(destination));
}
export async function backupDatabase(options: BackupOptions): Promise<BackupMetadata & { path: string }> {
  const source = resolve(options.source), destination = resolve(options.destination), expected = await definitions(options.migrationsPath), directory = await staging(destination), file = join(directory, 'snapshot.sqlite');
  let sourceDb: BetterSqlite3.Database | undefined;
  try {
    sourceDb = new BetterSqlite3(source, { readonly: true, fileMustExist: true, timeout: 5000 });
    await sourceDb.backup(file); sourceDb.close(); sourceDb = undefined;
    const migrations = inspect(file, expected); await chmod(file, 0o600);
    const manifest: BackupMetadata = { formatVersion: 1, createdAt: new Date().toISOString(), revision: options.revision ?? 'unversioned', sha256: await digest(file), migrations };
    await writeFile(join(directory, 'metadata.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await sync(join(directory, 'metadata.json'));
    await publish(file, destination);
    try { await link(join(directory, 'metadata.json'), destination + '.metadata.json'); await sync(dirname(destination)); }
    catch (error) { await rm(destination); throw error; }
    return { ...manifest, path: destination };
  } finally { sourceDb?.close(); await rm(directory, { recursive: true, force: true }); }
}
export async function restoreDatabase(options: RestoreOptions): Promise<BackupMetadata & { path: string }> {
  const backup = resolve(options.backup), destination = resolve(options.destination), manifest = await metadata(backup), expected = await definitions(options.migrationsPath), directory = await staging(destination), file = join(directory, 'restored.sqlite');
  try {
    await copyFile(backup, file, constants.COPYFILE_EXCL); await chmod(file, 0o600);
    if (await digest(file) !== manifest.sha256) throw new Error('Backup checksum mismatch');
    const applied = inspect(file, expected);
    if (JSON.stringify(applied) !== JSON.stringify(manifest.migrations)) throw new Error('Backup migration metadata mismatch');
    await publish(file, destination);
    return { ...manifest, path: destination };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
