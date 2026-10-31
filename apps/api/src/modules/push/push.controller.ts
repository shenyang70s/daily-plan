import { Body, Controller, Delete, Get, Headers, Inject, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PushSubscriptionSchema, PushSubscriptionQuerySchema } from '@research/contracts';
import { SessionGuard } from '../identity/session.guard.js';
import type { AuthRequest } from '../identity/session.guard.js';
import { parseInput } from '../tasks/tasks.controller.js';
import { PushService } from './push.service.js';
@Controller('push')
@UseGuards(SessionGuard)
export class PushController {
  constructor(@Inject(PushService) private readonly push: PushService) {}
  @Get('config') config() { return this.push.config(); }
  @Get('subscriptions') status(@Req() req: AuthRequest, @Query() query: unknown) { return this.push.status(req.sessionContext!, parseInput(PushSubscriptionQuerySchema, query).endpointHash); }
  @Post('subscriptions') subscribe(@Req() req: AuthRequest, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.push.subscribe(req.sessionContext!, parseInput(PushSubscriptionSchema, body), key); }
  @Delete('subscriptions') unsubscribe(@Req() req: AuthRequest, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.push.unsubscribe(req.sessionContext!, parseInput(PushSubscriptionQuerySchema, body), key); }
}
