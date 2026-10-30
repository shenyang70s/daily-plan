import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CreateTaskSchema, UpdateTaskSchema, TaskListSchema, ExpectedVersionSchema } from '@research/contracts';
import { SessionGuard } from '../identity/session.guard.js';
import type { AuthRequest } from '../identity/session.guard.js';
import { AppError } from '../../common/app-error.js';
import { TasksService } from './tasks.service.js';

export function parseInput<T>(schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } }, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError(400, 'INVALID_INPUT', '请检查输入字段、日期、版本或筛选条件');
  return result.data;
}
@Controller('tasks')
@UseGuards(SessionGuard)
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: unknown) { return this.tasks.list(req.sessionContext!, parseInput(TaskListSchema, query)); }
  @Post() create(@Req() req: AuthRequest, @Body() body: unknown, @Headers('idempotency-key') key: string = '') { return this.tasks.create(req.sessionContext!, parseInput(CreateTaskSchema, body), key); }
  @Get(':id') get(@Req() req: AuthRequest, @Param('id') id: string) { return this.tasks.get(req.sessionContext!, id); }
  @Patch(':id') update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: string = '') { return this.tasks.update(req.sessionContext!, id, parseInput(UpdateTaskSchema, body), key); }
  @Post(':id/complete') @HttpCode(200) complete(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: string = '') { return this.tasks.complete(req.sessionContext!, id, parseInput(ExpectedVersionSchema, body), key); }
  @Post(':id/reopen') @HttpCode(200) reopen(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: string = '') { return this.tasks.reopen(req.sessionContext!, id, parseInput(ExpectedVersionSchema, body), key); }
  @Post(':id/archive') @HttpCode(200) archive(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: string = '') { return this.tasks.archive(req.sessionContext!, id, parseInput(ExpectedVersionSchema, body), key); }
  @Delete(':id') remove(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: string = '') { return this.tasks.remove(req.sessionContext!, id, parseInput(ExpectedVersionSchema, body), key); }
  @Post(':id/restore') @HttpCode(200) restore(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: string = '') { return this.tasks.restore(req.sessionContext!, id, parseInput(ExpectedVersionSchema, body), key); }
}
