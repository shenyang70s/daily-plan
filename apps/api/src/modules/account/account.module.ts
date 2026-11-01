import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { DatabaseService } from '../../database.service.js';
import { Observability, ObservabilityModule } from '../../common/observability.js';
import { AccountController } from './account.controller.js';
import { ExportService } from './export.service.js';
import { DeletionService } from './deletion.service.js';
import { StatusService } from './status.service.js';
@Module({ imports: [IdentityModule, ObservabilityModule], controllers: [AccountController], providers: [
  { provide: ExportService, useFactory: (db: DatabaseService) => new ExportService(db.database), inject: [DatabaseService] },
  { provide: DeletionService, useFactory: (db: DatabaseService) => new DeletionService(db.database), inject: [DatabaseService] },
  { provide: StatusService, useFactory: (db: DatabaseService, metrics: Observability) => new StatusService(db.database, metrics), inject: [DatabaseService, Observability] },
] })
export class AccountModule {}
