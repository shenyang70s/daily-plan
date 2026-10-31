import { disablePushSession } from '../push/push.service.js';
import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import type {Database} from '@research/persistence';
import {AppError} from '../../common/app-error.js';
import {dummyHash,hashPassword,verifyPassword} from './password.js';

export interface SessionContext {userId:string;sessionId:string;csrfToken:string}
export interface Preferences {timezone:string;workStart:string;workEnd:string;notify:boolean;quiet:boolean;ai:boolean;proactive:boolean}
const defaults:Preferences={timezone:'Asia/Shanghai',workStart:'09:00',workEnd:'18:00',notify:true,quiet:true,ai:true,proactive:true};
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const csrfFor=(token:string)=>createHmac('sha256',token).update('research-csrf-v1').digest('hex');
export class IdentityService {
  private readonly attempts=new Map<string,{count:number;expiresAt:number}>();
  constructor(private readonly db:Database,private readonly now:()=>number=Date.now){}
  async createAccount(input:string,password:string):Promise<{id:string;username:string}>{
    const username=input.trim().toLowerCase();
    if(!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username))throw new AppError(400,'INVALID_USERNAME','用户名须为 3–32 位字母、数字、点、下划线或连字符');
    if(this.db.get('SELECT user_id FROM local_credentials WHERE username=?',username))throw new AppError(409,'USERNAME_TAKEN','用户名已存在');
    const passwordHash=await hashPassword(password),id=randomUUID(),now=this.now();
    this.db.withTransaction(tx=>{
      if(tx.get('SELECT user_id FROM local_credentials WHERE username=?',username))throw new AppError(409,'USERNAME_TAKEN','用户名已存在');
      tx.run('INSERT INTO users(id,identity_provider,identity_subject,display_name,created_at) VALUES(?,?,?,?,?)',id,'local-password',id,username,now);
      tx.run('INSERT INTO local_credentials(user_id,username,password_hash,updated_at) VALUES(?,?,?,?)',id,username,passwordHash,now);
      tx.run('INSERT INTO user_preferences(user_id,timezone,preferences_json,updated_at) VALUES(?,?,?,?)',id,defaults.timezone,JSON.stringify(defaults),now);
    });
    return{id,username};
  }
  async login(input:string,password:string,ip:string){
    const now=this.now(),key=ip||'unknown';
    const previous=this.attempts.get(key);
    const bucket=previous&&previous.expiresAt>now?previous:{count:0,expiresAt:now+60_000};
    if(bucket.count>=5)throw new AppError(429,'TOO_MANY_ATTEMPTS','尝试次数过多，请一分钟后重试');
    bucket.count++;this.attempts.set(key,bucket);
    if(this.attempts.size>1000){for(const[k,v]of this.attempts)if(v.expiresAt<=now)this.attempts.delete(k);if(this.attempts.size>1000)throw new AppError(503,'AUTH_BUSY','认证繁忙，请稍后重试')}
    const username=input.trim().toLowerCase();
    const record=this.db.get('SELECT user_id,username,password_hash FROM local_credentials WHERE username=?',username);
    const valid=await verifyPassword(password,String(record?.password_hash||dummyHash));
    if(!valid||!record)throw new AppError(401,'INVALID_CREDENTIALS','用户名或口令不正确');
    this.attempts.delete(key);
    const token=randomBytes(32).toString('hex'),csrfToken=csrfFor(token),sessionId=randomUUID(),expiresAt=now+12*3600*1000;
    this.db.withTransaction(tx=>tx.run('INSERT INTO sessions(id,user_id,token_hash,csrf_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)',sessionId,String(record.user_id),digest(token),digest(csrfToken),expiresAt,now));
    return{token,csrfToken,expiresAt,user:{id:String(record.user_id),username:String(record.username)}};
  }
  authenticate(token:string):SessionContext{
    if(!/^[a-f0-9]{64}$/.test(token))throw new AppError(401,'UNAUTHENTICATED','请先登录');
    const session=this.db.get('SELECT id,user_id FROM sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?',digest(token),this.now());
    if(!session)throw new AppError(401,'UNAUTHENTICATED','会话已失效，请重新登录');
    return{userId:String(session.user_id),sessionId:String(session.id),csrfToken:csrfFor(token)};
  }
  requireCsrf(token:string,csrfToken:string):SessionContext{
    const ctx=this.authenticate(token);
    const session=this.db.get('SELECT csrf_hash FROM sessions WHERE id=? AND user_id=?',ctx.sessionId,ctx.userId);
    if(!csrfToken||digest(csrfToken)!==session?.csrf_hash)throw new AppError(403,'INVALID_CSRF','操作校验失败，请刷新后重试');
    return ctx;
  }
  logout(token:string):void{const ctx=this.authenticate(token);this.db.withTransaction(tx=>{tx.run('UPDATE sessions SET revoked_at=? WHERE id=? AND user_id=?',this.now(),ctx.sessionId,ctx.userId);disablePushSession(tx,ctx.sessionId,this.now())})}
  getMe(token:string){const ctx=this.authenticate(token),user=this.db.get('SELECT username FROM local_credentials WHERE user_id=?',ctx.userId);return{user:{id:ctx.userId,username:String(user?.username||'')},csrfToken:ctx.csrfToken,preferences:this.getPreferences(ctx)}}
  getPreferences(ctx:SessionContext):Preferences{const row=this.db.get('SELECT preferences_json FROM user_preferences WHERE user_id=?',ctx.userId);return{...defaults,...(row?JSON.parse(String(row.preferences_json)): {})}}
  updatePreferences(ctx:SessionContext,changes:Partial<Preferences>):Preferences{
    const next={...this.getPreferences(ctx),...changes};
    try{new Intl.DateTimeFormat('en',{timeZone:next.timezone}).format()}catch{throw new AppError(400,'INVALID_TIMEZONE','无效的时区')}
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.workStart)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.workEnd)||next.workStart>=next.workEnd)throw new AppError(400,'INVALID_WORK_HOURS','请设置有效的工作时间');
    this.db.withTransaction(tx=>tx.run('UPDATE user_preferences SET timezone=?,preferences_json=?,updated_at=? WHERE user_id=?',next.timezone,JSON.stringify(next),this.now(),ctx.userId));return next;
  }
}
