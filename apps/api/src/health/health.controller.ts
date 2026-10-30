import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

@Controller()
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  @Get('health')
  health(): { status: 'ok' } { return { status: 'ok' }; }

  @Get('ready')
  ready(): { status: 'ok' } {
    if (!this.databaseService.database.ready()) {
      throw new ServiceUnavailableException({code:'DATABASE_NOT_READY',message:'数据库尚未就绪'});
    }
    return { status: 'ok' };
  }
}
