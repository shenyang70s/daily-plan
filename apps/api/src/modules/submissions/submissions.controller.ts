import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CreateSubmissionSchema, UpdateSubmissionSchema, SubmissionListSchema, ExpectedVersionSchema, CreateMilestoneSchema } from '@research/contracts';
import { SessionGuard } from '../identity/session.guard.js';
import type { AuthRequest } from '../identity/session.guard.js';
import { parseInput } from '../tasks/tasks.controller.js';
import { SubmissionsService } from './submissions.service.js';
@Controller('submissions') @UseGuards(SessionGuard)
export class SubmissionsController {
  constructor(@Inject(SubmissionsService) private readonly submissions: SubmissionsService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: unknown) { return this.submissions.list(req.sessionContext!, parseInput(SubmissionListSchema, query)); }
  @Post() create(@Req() req: AuthRequest, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.submissions.create(req.sessionContext!, parseInput(CreateSubmissionSchema, body), key); }
  @Get(':id') get(@Req() req: AuthRequest, @Param('id') id: string) { return this.submissions.get(req.sessionContext!, id); }
  @Patch(':id') update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.submissions.update(req.sessionContext!, id, parseInput(UpdateSubmissionSchema, body), key); }
  @Delete(':id') archive(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.submissions.archive(req.sessionContext!, id, parseInput(ExpectedVersionSchema, body), key); }
  @Post(':id/restore') @HttpCode(200) restore(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.submissions.archive(req.sessionContext!, id, parseInput(ExpectedVersionSchema, body), key, true); }
  @Get(':id/milestones') milestones(@Req() req: AuthRequest, @Param('id') id: string) { return this.submissions.listMilestones(req.sessionContext!, id); }
  @Post(':id/milestones') createMilestone(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.submissions.createMilestone(req.sessionContext!, id, parseInput(CreateMilestoneSchema, body), key); }
}
