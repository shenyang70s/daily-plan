import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { DatabaseService } from '../../database.service.js';
import { RemindersService } from './reminders.service.js';
import { RemindersController } from './reminders.controller.js';
import { NotificationsController } from './notifications.controller.js';
import { ReminderDelivery } from '../../background/delivery.js';
import { ReminderScheduler } from '../../background/scheduler.js';
@Module({ imports: [IdentityModule], controllers: [RemindersController, NotificationsController], providers: [
  { provide: RemindersService, useFactory: (db: DatabaseService) => new RemindersService(db.database), inject: [DatabaseService] },
  { provide: ReminderDelivery, useFactory: (db: DatabaseService) => new ReminderDelivery(db.database), inject: [DatabaseService] },
  { provide: ReminderScheduler, useFactory: (delivery: ReminderDelivery) => new ReminderScheduler(delivery), inject: [ReminderDelivery] },
] })
export class RemindersModule {}
