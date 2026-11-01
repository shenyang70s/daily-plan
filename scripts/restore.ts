import { resolve } from 'node:path';
import { restoreDatabase } from '../packages/persistence/src/backup.js';
async function main() {
  const [backup, destination, ...extra] = process.argv.slice(2);
  if (!backup || !destination || extra.length) throw new Error('Usage: pnpm db:restore snapshot.sqlite /data/new-database.sqlite (destination must not exist)');
  const result = await restoreDatabase({ backup, destination, migrationsPath: resolve('infra/migrations') });
  console.log(JSON.stringify({ ...result, next: 'Stop the application before switching DATABASE_PATH to the restored file, then restart and check readiness.' }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Restore failed'); process.exitCode = 1; });
