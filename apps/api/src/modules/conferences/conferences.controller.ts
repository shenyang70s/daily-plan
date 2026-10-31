import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ConferenceQuerySchema, CreateConferenceSubmissionSchema, ConferenceUpdatePreviewSchema, ConferenceUpdateConfirmSchema } from '@research/contracts';
import { SessionGuard } from '../identity/session.guard.js';
import type { AuthRequest } from '../identity/session.guard.js';
import { parseInput } from '../tasks/tasks.controller.js';
import { ConferenceSource } from './conference-source.js';
import { ConferenceImportService } from './conference-import.service.js';
@Controller('conferences') @UseGuards(SessionGuard)
export class ConferencesController {
  constructor(@Inject(ConferenceSource) private readonly source: ConferenceSource, @Inject(ConferenceImportService) private readonly importer: ConferenceImportService) {}
  @Get() async list(@Query() query: unknown) {
    const filter = parseInput(ConferenceQuerySchema, query), catalog = await this.source.catalog();
    return { ...catalog, items: catalog.items.filter(item => (!filter.focus || item.focuses.includes(filter.focus)) && (!filter.year || item.year === filter.year) && (!filter.q || `${item.title} ${item.description}`.toLocaleLowerCase().includes(filter.q.toLocaleLowerCase()))) };
  }
  @Post('create-submission') create(@Req() req: AuthRequest, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.importer.create(req.sessionContext!, parseInput(CreateConferenceSubmissionSchema, body), key); }
  @Post('import-preview') preview(@Req() req: AuthRequest, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.importer.preview(req.sessionContext!, parseInput(ConferenceUpdatePreviewSchema, body), key); }
  @Post('import-proposals/:id/confirm') confirm(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.importer.confirmUpdate(req.sessionContext!, id, parseInput(ConferenceUpdateConfirmSchema, body), key); }

}
