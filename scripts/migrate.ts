import {resolve} from 'node:path';
import {openDatabase} from '../packages/persistence/src/production.js';

const database=openDatabase({path:resolve(process.env.DATABASE_PATH || './var/research-tasks.sqlite'),migrationsPath:resolve('infra/migrations')});
try{console.log(`Database schema ready (${database.all('SELECT name FROM schema_migrations').length} migrations)`)}
finally{database.close()}
