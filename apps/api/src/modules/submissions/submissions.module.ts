import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { IdentityService } from '../identity/identity.service.js';
import { DatabaseService } from '../../database.service.js';
import { SubmissionsService } from './submissions.service.js';
import { SubmissionsController } from './submissions.controller.js';
import { MilestonesController } from './milestones.controller.js';
@Module({ imports: [IdentityModule], controllers: [SubmissionsController, MilestonesController], providers: [{ provide: SubmissionsService, useFactory: (db: DatabaseService, identity: IdentityService) => new SubmissionsService(db.database, identity), inject: [DatabaseService, IdentityService] }], exports: [SubmissionsService] })
export class SubmissionsModule {}
