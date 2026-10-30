import {resolve} from 'node:path';
import {openDatabase} from '../packages/persistence/src/production.js';
import {IdentityService} from '../apps/api/dist/modules/identity/identity.service.js';
function hidden(prompt:string):Promise<string>{
  return new Promise((resolve,reject)=>{
    let value='';process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();
    const finish=(error?:Error)=>{process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');error?reject(error):resolve(value)};
    const onData=(chunk:Buffer)=>{for(const char of chunk.toString('utf8').replace(/\u001b\[[0-9;]*[A-Za-z]/g,'')){
      if(char==='\u0003'){finish(new Error('已取消'));return}
      if(char==='\r'||char==='\n'){finish();return}
      if(char==='\u007f'||char==='\b'){value=Array.from(value).slice(0,-1).join('');continue}
      if(char>=' '&&value.length<129)value+=char;
    }};
    process.stdin.on('data',onData);
  });
}
async function main():Promise<void>{
  const args=process.argv.slice(2).filter(arg=>arg!=='--');
  if(args.length!==1||!args[0])throw new Error('用法：corepack pnpm account:create <用户名>。口令通过交互或标准输入读取，不放入命令行。');
  let password:string;
  if(process.stdin.isTTY){password=await hidden('口令（12–128 字符，输入不显示）：');const repeated=await hidden('再次输入口令：');if(password!==repeated)throw new Error('两次口令不一致')}
  else{let input='';for await(const chunk of process.stdin){input+=chunk.toString();if(Buffer.byteLength(input)>1024)throw new Error('输入过长')}password=input.replace(/\r?\n$/,'');if(/[\r\n]/.test(password))throw new Error('标准输入只接受一行口令')}
  const db=openDatabase({path:resolve(process.env.DATABASE_PATH||'./var/research-tasks.sqlite'),migrationsPath:resolve('infra/migrations')});
  try{const user=await new IdentityService(db).createAccount(args[0],password);console.log(`账号已创建：${user.username}`)}finally{db.close()}
}
main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:'创建失败');process.exitCode=1});
