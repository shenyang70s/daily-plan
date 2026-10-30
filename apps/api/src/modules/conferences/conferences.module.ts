import { Module } from '@nestjs/common';
import { DatabaseService } from '../../database.service.js';
import { IdentityModule } from '../identity/identity.module.js';
import { SubmissionsModule } from '../submissions/submissions.module.js';
import { SubmissionsService } from '../submissions/submissions.service.js';
import { ConferenceSource } from './conference-source.js';
import { ConferenceImportService } from './conference-import.service.js';
import { ConferencesController } from './conferences.controller.js';
@Module({ imports: [IdentityModule, SubmissionsModule], controllers: [ConferencesController], providers: [{ provide: ConferenceSource, useFactory: (db: DatabaseService) => new ConferenceSource(db.database), inject: [DatabaseService] }, { provide: ConferenceImportService, useFactory: (db: DatabaseService, source: ConferenceSource, submissions: SubmissionsService) => new ConferenceImportService(db.database, source, submissions), inject: [DatabaseService, ConferenceSource, SubmissionsService] }], exports: [ConferenceSource] })
export class ConferencesModule {}
