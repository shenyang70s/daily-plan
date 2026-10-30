import {Inject,Injectable} from '@nestjs/common';
import type {CanActivate,ExecutionContext} from '@nestjs/common';
import {AppError} from '../../common/app-error.js';
import {IdentityService} from './identity.service.js';
import type {SessionContext} from './identity.service.js';
export interface AuthRequest{method:string;headers:Record<string,string|string[]|undefined>;socket:{remoteAddress?:string};sessionContext?:SessionContext}
export function sessionCookie(request:AuthRequest):string{
  const cookie=typeof request.headers.cookie==='string'?request.headers.cookie:'';
  return cookie.split(';').map(part=>part.trim()).find(part=>part.startsWith('research_session='))?.slice('research_session='.length)||'';
}
export function assertOrigin(request:AuthRequest):void{
  const expected=process.env.APP_ORIGIN||'http://127.0.0.1:5173';
  if(request.headers.origin!==expected)throw new AppError(403,'INVALID_ORIGIN','请求来源校验失败');
}
@Injectable()
export class SessionGuard implements CanActivate{
  constructor(@Inject(IdentityService)private readonly identity:IdentityService){}
  canActivate(context:ExecutionContext):boolean{
    const request=context.switchToHttp().getRequest<AuthRequest>(),token=sessionCookie(request);
    if(['GET','HEAD','OPTIONS'].includes(request.method))request.sessionContext=this.identity.authenticate(token);
    else{assertOrigin(request);const csrf=request.headers['x-csrf-token'];request.sessionContext=this.identity.requireCsrf(token,typeof csrf==='string'?csrf:'')}
    context.switchToHttp().getResponse<{setHeader(name:string,value:string):void}>().setHeader('Cache-Control','no-store');
    return true;
  }
}
