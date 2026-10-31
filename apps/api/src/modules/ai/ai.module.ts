import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { IdentityService } from '../identity/identity.service.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { TasksService } from '../tasks/tasks.service.js';
import { CalendarModule } from '../calendar/calendar.module.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { SubmissionsModule } from '../submissions/submissions.module.js';
import { SubmissionsService } from '../submissions/submissions.service.js';
import { DatabaseService } from '../../database.service.js';
import { DeepSeekProvider } from './provider-adapter.js';
import { AiOrchestrator } from './orchestrator.js';
import { ReadTools } from './tool-registry.js';
import { AiController } from './ai.controller.js';
@Module({ imports: [IdentityModule, TasksModule, CalendarModule, SubmissionsModule], controllers: [AiController], providers: [
  { provide: DeepSeekProvider, useFactory: () => new DeepSeekProvider() },
  { provide: ReadTools, useFactory: (tasks: TasksService, calendar: CalendarService, submissions: SubmissionsService) => new ReadTools(tasks, calendar, submissions), inject: [TasksService, CalendarService, SubmissionsService] },
  { provide: AiOrchestrator, useFactory: (db: DatabaseService, identity: IdentityService, provider: DeepSeekProvider, tools: ReadTools) => new AiOrchestrator(db.database, identity, provider, tools), inject: [DatabaseService, IdentityService, DeepSeekProvider, ReadTools] },
] })
export class AiModule {}
