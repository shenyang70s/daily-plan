import { resolve } from 'node:path';
import { openDatabase } from '../packages/persistence/src/production.js';
import { seedResearchData } from './demo/research-data.js';
const args=process.argv.slice(2).filter(arg=>arg!=='--');
if(args.length>1)throw new Error('用法：corepack pnpm demo:seed young');
const db=openDatabase({path:resolve(process.env.DATABASE_PATH||'./var/research-tasks.sqlite'),migrationsPath:resolve('infra/migrations')});
try { const result=seedResearchData(db,args[0]||'young');console.log(JSON.stringify({username:result.username,alreadySeeded:result.alreadySeeded,seededAt:result.seededAt,anchorDate:result.anchorDate,timezone:result.timezone,counts:result.counts,skipped:result.skipped},null,2)); }
catch(error){console.error(error instanceof Error?error.message:'模拟数据导入失败');process.exitCode=1;}
finally{db.close();}
