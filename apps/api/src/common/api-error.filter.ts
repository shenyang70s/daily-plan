import {Catch,HttpException} from '@nestjs/common';
import type {ArgumentsHost,ExceptionFilter} from '@nestjs/common';
import {AppError} from './app-error.js';
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost):void{
    const response=host.switchToHttp().getResponse<{status(code:number):{json(value:unknown):void}}>();
    if(error instanceof AppError){response.status(error.status).json({code:error.code,message:error.message});return}
    if(error instanceof HttpException){response.status(error.getStatus()).json({code:'HTTP_ERROR',message:error.message});return}
    response.status(500).json({code:'INTERNAL_ERROR',message:'服务暂时无法完成操作'});
  }
}
