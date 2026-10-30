import { Module } from '@nestjs/common';
import {APP_FILTER} from '@nestjs/core';
import { HealthController } from './health/health.controller.js';
import {IdentityModule} from './modules/identity/identity.module.js';
import {ApiErrorFilter} from './common/api-error.filter.js';
import {TasksModule} from './modules/tasks/tasks.module.js';
import {CalendarModule} from './modules/calendar/calendar.module.js';
import {SubmissionsModule} from './modules/submissions/submissions.module.js';
import {ConferencesModule} from './modules/conferences/conferences.module.js';
import {RemindersModule} from './modules/reminders/reminders.module.js';
@Module({imports:[IdentityModule,TasksModule,CalendarModule,SubmissionsModule,ConferencesModule,RemindersModule],controllers:[HealthController],providers:[{provide:APP_FILTER,useClass:ApiErrorFilter}]})
export class AppModule {}
