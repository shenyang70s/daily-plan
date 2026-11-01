import { Body, Controller, Delete, Get, HttpCode, Inject, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AccountExportQuerySchema, DeleteAccountSchema } from '@research/contracts';
import { SessionGuard } from '../identity/session.guard.js';
import type { AuthRequest } from '../identity/session.guard.js';
import { parseInput } from '../tasks/tasks.controller.js';
import { ExportService } from './export.service.js';
import { DeletionService } from './deletion.service.js';
import { StatusService } from './status.service.js';
import { Observability } from '../../common/observability.js';
interface Response { setHeader(name: string, value: string): void; send(body: unknown): void }
@Controller('account') @UseGuards(SessionGuard)
export class AccountController {
  constructor(@Inject(ExportService) private readonly exports: ExportService, @Inject(DeletionService) private readonly deletion: DeletionService, @Inject(StatusService) private readonly status: StatusService, @Inject(Observability) private readonly metrics: Observability) {}
  @Get('export') export(@Req() req: AuthRequest, @Query() query: unknown, @Res() response: Response) {
    const { format } = parseInput(AccountExportQuerySchema, query), ctx = req.sessionContext!;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Disposition', `attachment; filename="research-tasks-${new Date().toISOString().slice(0, 10)}.${format}"`);
    response.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
    response.send(format === 'csv' ? this.exports.csv(ctx) : this.exports.json(ctx));
  }
  @Get('status') state(@Req() req: AuthRequest) { return this.status.get(req.sessionContext!); }
  @Delete() @HttpCode(204) async delete(@Req() req: AuthRequest, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = parseInput(DeleteAccountSchema, body);
    await this.deletion.delete(req.sessionContext!, input);
    this.metrics.forget(req.sessionContext!.userId);
    response.setHeader('Set-Cookie', `research_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  }
}
