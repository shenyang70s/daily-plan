import { Body, Controller, Delete, Headers, Inject, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { UpdateMilestoneSchema, DeleteMilestoneSchema } from '@research/contracts';
import { SessionGuard } from '../identity/session.guard.js';
import type { AuthRequest } from '../identity/session.guard.js';
import { parseInput } from '../tasks/tasks.controller.js';
import { SubmissionsService } from './submissions.service.js';
@Controller('milestones') @UseGuards(SessionGuard)
export class MilestonesController {
  constructor(@Inject(SubmissionsService) private readonly submissions: SubmissionsService) {}
  @Patch(':id') update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.submissions.updateMilestone(req.sessionContext!, id, parseInput(UpdateMilestoneSchema, body), key); }
  @Delete(':id') remove(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.submissions.deleteMilestone(req.sessionContext!, id, parseInput(DeleteMilestoneSchema, body), key); }
}
