import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CreateProjectSchema, UpdateProjectSchema, ExpectedVersionSchema, ProjectListSchema } from '@research/contracts';
import { SessionGuard } from '../identity/session.guard.js';
import type { AuthRequest } from '../identity/session.guard.js';
import { TasksService } from './tasks.service.js';
import { parseInput } from './tasks.controller.js';
@Controller('projects')
@UseGuards(SessionGuard)
export class ProjectsController {
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: unknown) { return this.tasks.listProjects(req.sessionContext!, parseInput(ProjectListSchema, query)); }
  @Post() create(@Req() req: AuthRequest, @Body() body: unknown, @Headers('idempotency-key') key: string = '') { return this.tasks.createProject(req.sessionContext!, parseInput(CreateProjectSchema, body), key); }
  @Get(':id') get(@Req() req: AuthRequest, @Param('id') id: string) { return this.tasks.getProject(req.sessionContext!, id); }
  @Patch(':id') update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: string = '') { return this.tasks.updateProject(req.sessionContext!, id, parseInput(UpdateProjectSchema, body), key); }
  @Delete(':id') remove(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: string = '') { return this.tasks.deleteProject(req.sessionContext!, id, parseInput(ExpectedVersionSchema, body), key); }
}
