import { resolve } from 'node:path';
import { backupDatabase } from '../packages/persistence/src/backup.js';
async function main() {
  const [destination, ...extra] = process.argv.slice(2);
  if (!destination || extra.length) throw new Error('Usage: pnpm db:backup /separate-backup-volume/snapshot.sqlite');
  const result = await backupDatabase({ source: resolve(process.env.DATABASE_PATH || './var/research-tasks.sqlite'), destination, migrationsPath: resolve('infra/migrations'), revision: process.env.BUILD_REVISION?.trim() || 'unversioned' });
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Backup failed'); process.exitCode = 1; });
