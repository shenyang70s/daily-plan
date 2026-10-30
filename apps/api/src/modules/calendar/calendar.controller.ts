import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CalendarQuerySchema, CreateCalendarEventSchema, UpdateCalendarEventSchema, CreateScheduledTaskSchema, CheckConflictsSchema, ExpectedVersionSchema, RescheduleTaskSchema } from '@research/contracts';
import { SessionGuard } from '../identity/session.guard.js';
import type { AuthRequest } from '../identity/session.guard.js';
import { parseInput } from '../tasks/tasks.controller.js';
import { CalendarService } from './calendar.service.js';
@Controller('calendar') @UseGuards(SessionGuard)
export class CalendarController {
  constructor(@Inject(CalendarService) private readonly calendar: CalendarService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: unknown) { return this.calendar.list(req.sessionContext!, parseInput(CalendarQuerySchema, query)); }
  @Get('events') events(@Req() req: AuthRequest, @Query() query: unknown) { return this.calendar.list(req.sessionContext!, parseInput(CalendarQuerySchema, query), 'event'); }
  @Post('events') create(@Req() req: AuthRequest, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.calendar.createEvent(req.sessionContext!, parseInput(CreateCalendarEventSchema, body), key); }
  @Get('events/:id') event(@Req() req: AuthRequest, @Param('id') id: string) { return this.calendar.getEvent(req.sessionContext!, id); }
  @Patch('events/:id') update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.calendar.updateEvent(req.sessionContext!, id, parseInput(UpdateCalendarEventSchema, body), key); }
  @Delete('events/:id') remove(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.calendar.deleteEvent(req.sessionContext!, id, parseInput(ExpectedVersionSchema, body), key); }
  @Post('tasks') createTask(@Req() req: AuthRequest, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.calendar.createTask(req.sessionContext!, parseInput(CreateScheduledTaskSchema, body), key); }
  @Post('conflicts/check') @HttpCode(200) check(@Req() req: AuthRequest, @Body() body: unknown) { return this.calendar.check(req.sessionContext!, parseInput(CheckConflictsSchema, body)); }
}
@Controller('tasks') @UseGuards(SessionGuard)
export class TaskRescheduleController {
  constructor(@Inject(CalendarService) private readonly calendar: CalendarService) {}
  @Post(':id/reschedule') @HttpCode(200) reschedule(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.calendar.reschedule(req.sessionContext!, id, parseInput(RescheduleTaskSchema, body), key); }
}
