import {Module} from '@nestjs/common';
import {DatabaseService} from '../../database.service.js';
import {AuthController} from './auth.controller.js';
import {IdentityService} from './identity.service.js';
import {SessionGuard} from './session.guard.js';
@Module({providers:[DatabaseService,{provide:IdentityService,useFactory:(service:DatabaseService)=>new IdentityService(service.database),inject:[DatabaseService]},SessionGuard],controllers:[AuthController],exports:[IdentityService,SessionGuard,DatabaseService]})
export class IdentityModule{}
