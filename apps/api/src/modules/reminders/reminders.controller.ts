import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CreateReminderSchema, UpdateReminderSchema, ReminderTargetSchema, ExpectedVersionSchema } from '@research/contracts';
import { SessionGuard } from '../identity/session.guard.js';
import type { AuthRequest } from '../identity/session.guard.js';
import { parseInput } from '../tasks/tasks.controller.js';
import { RemindersService } from './reminders.service.js';
@Controller('reminders')
@UseGuards(SessionGuard)
export class RemindersController {
  constructor(@Inject(RemindersService) private readonly reminders: RemindersService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: unknown) { return this.reminders.list(req.sessionContext!, parseInput(ReminderTargetSchema, query)); }
  @Post() create(@Req() req: AuthRequest, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.reminders.create(req.sessionContext!, parseInput(CreateReminderSchema, body), key); }
  @Patch(':id') update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.reminders.update(req.sessionContext!, id, parseInput(UpdateReminderSchema, body), key); }
  @Delete(':id') cancel(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.reminders.cancel(req.sessionContext!, id, parseInput(ExpectedVersionSchema, body), key); }
}
