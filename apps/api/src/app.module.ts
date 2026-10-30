import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health/health.controller.js';

@Module({ providers: [DatabaseService], controllers: [HealthController] })
export class AppModule {}
