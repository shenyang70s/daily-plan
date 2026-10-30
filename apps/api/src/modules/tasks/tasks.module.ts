import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { IdentityService } from '../identity/identity.service.js';
import { DatabaseService } from '../../database.service.js';
import { TasksController } from './tasks.controller.js';
import { ProjectsController } from './projects.controller.js';
import { TasksService } from './tasks.service.js';
@Module({
  imports: [IdentityModule], controllers: [TasksController, ProjectsController],
  providers: [{ provide: TasksService, useFactory: (db: DatabaseService, identity: IdentityService) => new TasksService(db.database, identity), inject: [DatabaseService, IdentityService] }],
  exports: [TasksService],
})
export class TasksModule {}
