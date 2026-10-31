import { PushDelivery } from '../../background/push.js';
import { PushService } from '../push/push.service.js';
import { PushController } from '../push/push.controller.js';
import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { DatabaseService } from '../../database.service.js';
import { RemindersService } from './reminders.service.js';
import { RemindersController } from './reminders.controller.js';
import { NotificationsController } from './notifications.controller.js';
import { ReminderDelivery } from '../../background/delivery.js';
import { ReminderScheduler } from '../../background/scheduler.js';
@Module({ imports: [IdentityModule], controllers: [RemindersController, NotificationsController, PushController], providers: [
  { provide: PushService, useFactory: (db: DatabaseService) => new PushService(db.database), inject: [DatabaseService] },
  { provide: RemindersService, useFactory: (db: DatabaseService) => new RemindersService(db.database), inject: [DatabaseService] },
  { provide: ReminderDelivery, useFactory: (db: DatabaseService) => new ReminderDelivery(db.database), inject: [DatabaseService] },
  { provide: PushDelivery, useFactory: (db: DatabaseService, push: PushService) => new PushDelivery(db.database, push.configuration), inject: [DatabaseService, PushService] },
  { provide: ReminderScheduler, useFactory: (delivery: ReminderDelivery, push: PushDelivery) => new ReminderScheduler(delivery, push), inject: [ReminderDelivery, PushDelivery] },
] })
export class RemindersModule {}
