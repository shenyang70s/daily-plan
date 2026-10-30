import { Module } from '@nestjs/common';
import {APP_FILTER} from '@nestjs/core';
import { HealthController } from './health/health.controller.js';
import {IdentityModule} from './modules/identity/identity.module.js';
import {ApiErrorFilter} from './common/api-error.filter.js';
import {TasksModule} from './modules/tasks/tasks.module.js';
import {CalendarModule} from './modules/calendar/calendar.module.js';
@Module({imports:[IdentityModule,TasksModule,CalendarModule],controllers:[HealthController],providers:[{provide:APP_FILTER,useClass:ApiErrorFilter}]})
export class AppModule {}
