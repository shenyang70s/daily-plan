import {Body,Controller,Get,HttpCode,Inject,Patch,Post,Req,Res,UseGuards} from '@nestjs/common';
import {LoginSchema,PreferencesPatchSchema} from '@research/contracts';
import type {Preferences} from './identity.service.js';
import {AppError} from '../../common/app-error.js';
import {IdentityService} from './identity.service.js';
import {assertOrigin,sessionCookie,SessionGuard} from './session.guard.js';
import type {AuthRequest} from './session.guard.js';
interface CookieResponse{setHeader(name:string,value:string):void}
const cookie=(token:string,maxAge:number)=>`research_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`;
@Controller()
export class AuthController{
 constructor(@Inject(IdentityService)private readonly identity:IdentityService){}
 @Post('auth/login') @HttpCode(200)
 async login(@Req()request:AuthRequest,@Res({passthrough:true})response:CookieResponse,@Body()body:unknown){
   assertOrigin(request);
   if(typeof request.headers['content-type']!=='string'||!/^application\/json(?:;|$)/i.test(request.headers['content-type']))throw new AppError(415,'JSON_REQUIRED','请使用 JSON 请求');
   const input=LoginSchema.safeParse(body);if(!input.success)throw new AppError(400,'INVALID_INPUT','请输入有效的用户名和口令');
   const result=await this.identity.login(input.data.username,input.data.password,request.socket.remoteAddress||'unknown');
   response.setHeader('Set-Cookie',cookie(result.token,12*3600));
   response.setHeader('Cache-Control','no-store');
   return{user:result.user,csrfToken:result.csrfToken};
 }
 @Get('me') @UseGuards(SessionGuard)
 me(@Req()request:AuthRequest,@Res({passthrough:true})response:CookieResponse){response.setHeader('Cache-Control','no-store');return this.identity.getMe(sessionCookie(request))}
 @Post('auth/logout') @HttpCode(200) @UseGuards(SessionGuard)
 logout(@Req()request:AuthRequest,@Res({passthrough:true})response:CookieResponse){this.identity.logout(sessionCookie(request));response.setHeader('Set-Cookie',cookie('',0));return{status:'ok'}}
 @Get('me/preferences') @UseGuards(SessionGuard)
 preferences(@Req()request:AuthRequest){return this.identity.getPreferences(request.sessionContext!)}
 @Patch('me/preferences') @UseGuards(SessionGuard)
 updatePreferences(@Req()request:AuthRequest,@Body()body:unknown){const input=PreferencesPatchSchema.safeParse(body);if(!input.success)throw new AppError(400,'INVALID_INPUT','偏好设置字段不正确');const changes:Partial<Preferences>={};for(const[key,value]of Object.entries(input.data))if(value!==undefined)Object.assign(changes,{[key]:value});return this.identity.updatePreferences(request.sessionContext!,changes)}
}
