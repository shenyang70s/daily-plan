import { Module } from '@nestjs/common';
import { DatabaseService } from '../../database.service.js';
import { IdentityModule } from '../identity/identity.module.js';
import { IdentityService } from '../identity/identity.service.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { TasksService } from '../tasks/tasks.service.js';
import { CalendarService } from './calendar.service.js';
import { CalendarController, TaskRescheduleController } from './calendar.controller.js';
import { ScheduleBlocksController } from './schedule-blocks.controller.js';
@Module({ imports: [IdentityModule, TasksModule], controllers: [CalendarController, ScheduleBlocksController, TaskRescheduleController], providers: [{ provide: CalendarService, useFactory: (db: DatabaseService, tasks: TasksService, identity: IdentityService) => new CalendarService(db.database, tasks, identity), inject: [DatabaseService, TasksService, IdentityService] }], exports: [CalendarService] })
export class CalendarModule {}
