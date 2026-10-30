import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {AppError} from '../../common/app-error.js';
// OWASP scrypt profile: N=2^15, r=8, p=3; bound concurrent KDF memory.
let active=0;
async function derive(password:string,salt:Buffer):Promise<Buffer>{
  if(active>=2)throw new AppError(503,'PASSWORD_SERVICE_BUSY','认证繁忙，请稍后重试');
  active++;
  try{return await new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)))}
  finally{active--}
}
export async function hashPassword(password:string):Promise<string>{
  if(password.length<12||password.length>128)throw new AppError(400,'INVALID_PASSWORD','口令须为 12–128 个字符');
  const salt=randomBytes(16),hash=await derive(password,salt);
  return `scrypt$32768$8$3$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export async function verifyPassword(password:string,encoded:string):Promise<boolean>{
  if(password.length>128)return false;
  const parts=/^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
  if(!parts)return false;
  const expected=Buffer.from(parts[2]!,'hex'),actual=await derive(password,Buffer.from(parts[1]!,'hex'));
  return timingSafeEqual(expected,actual);
}
export const dummyHash=`scrypt$32768$8$3$${'00'.repeat(16)}$${'00'.repeat(64)}`;
