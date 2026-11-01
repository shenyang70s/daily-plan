import { AccountModule } from './modules/account/account.module.js';
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
import {AiModule} from './modules/ai/ai.module.js';
@Module({imports:[AccountModule,IdentityModule,TasksModule,CalendarModule,SubmissionsModule,ConferencesModule,RemindersModule,AiModule],controllers:[HealthController],providers:[{provide:APP_FILTER,useClass:ApiErrorFilter}]})
export class AppModule {}
