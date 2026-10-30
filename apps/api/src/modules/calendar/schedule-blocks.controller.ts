import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CalendarQuerySchema, CreateScheduleBlockSchema, UpdateScheduleBlockSchema, ExpectedVersionSchema } from '@research/contracts';
import { SessionGuard } from '../identity/session.guard.js';
import type { AuthRequest } from '../identity/session.guard.js';
import { parseInput } from '../tasks/tasks.controller.js';
import { CalendarService } from './calendar.service.js';
@Controller('schedule-blocks') @UseGuards(SessionGuard)
export class ScheduleBlocksController {
  constructor(@Inject(CalendarService) private readonly calendar: CalendarService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: unknown) { return this.calendar.list(req.sessionContext!, parseInput(CalendarQuerySchema, query), 'block'); }
  @Post() create(@Req() req: AuthRequest, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.calendar.createBlock(req.sessionContext!, parseInput(CreateScheduleBlockSchema, body), key); }
  @Get(':id') get(@Req() req: AuthRequest, @Param('id') id: string) { return this.calendar.getBlock(req.sessionContext!, id); }
  @Patch(':id') update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.calendar.updateBlock(req.sessionContext!, id, parseInput(UpdateScheduleBlockSchema, body), key); }
  @Delete(':id') remove(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.calendar.cancelBlock(req.sessionContext!, id, parseInput(ExpectedVersionSchema, body), key); }
}
