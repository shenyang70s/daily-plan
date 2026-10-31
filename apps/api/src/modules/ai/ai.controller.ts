import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Req, Sse, UseGuards } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AiInterpretSchema, AiConfirmSchema, ManualPlanSchema, EmptyInputSchema } from '@research/contracts';
import { SessionGuard } from '../identity/session.guard.js';
import type { AuthRequest } from '../identity/session.guard.js';
import { parseInput } from '../tasks/tasks.controller.js';
import { DatabaseService } from '../../database.service.js';
import { AiOrchestrator } from './orchestrator.js';
@Controller('ai')
@UseGuards(SessionGuard)
export class AiController {
  constructor(@Inject(AiOrchestrator) private readonly ai: AiOrchestrator, @Inject(DatabaseService) private readonly db: DatabaseService) {}
  @Get('config') config(@Req() req: AuthRequest) { return this.ai.config(req.sessionContext!); }
  @Post('interpret') @HttpCode(202) start(@Req() req: AuthRequest, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.ai.start(req.sessionContext!, parseInput(AiInterpretSchema, body), key); }
  @Post('plan') @HttpCode(200) plan(@Req() req: AuthRequest, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.ai.plan(req.sessionContext!, parseInput(ManualPlanSchema, body), key); }
  @Post('runs/:id/deletion-confirmation') @HttpCode(200) deletion(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { parseInput(AiConfirmSchema, body); return this.ai.deletionConfirmation(req.sessionContext!, id, key); }
  @Post('runs/:id/undo') @HttpCode(200) undo(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { parseInput(AiConfirmSchema, body); return this.ai.undo(req.sessionContext!, id, key); }
  @Get('runs/:id') get(@Req() req: AuthRequest, @Param('id') id: string) { return this.ai.get(req.sessionContext!, id); }
  @Post('runs/:id/confirm') @HttpCode(200) confirm(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { const parsed = parseInput(AiConfirmSchema, body); return this.ai.confirm(req.sessionContext!, id, key, parsed.deletionToken, parsed.deleteAcknowledgement); }
  @Post('runs/:id/cancel') cancel(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { parseInput(EmptyInputSchema, body); return this.ai.cancel(req.sessionContext!, id, key); }
  @Sse('runs/:id/stream') stream(@Req() req: AuthRequest, @Param('id') id: string): Observable<MessageEvent> {
    const ctx = req.sessionContext!; this.ai.get(ctx, id);
    return new Observable(subscriber => {
      const emit = () => {
        try {
          if (!this.db.database.get('SELECT id FROM sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?', ctx.sessionId, ctx.userId, Date.now())) { subscriber.complete(); return; }
          const run = this.ai.get(ctx, id); subscriber.next({ type: 'progress', data: { id: run.id, phase: run.phase, status: run.status } });
          if (['succeeded', 'failed', 'canceled'].includes(run.status)) subscriber.complete();
        } catch { subscriber.complete(); }
      };
      emit(); const timer = setInterval(emit, 500); timer.unref(); return () => clearInterval(timer);
    });
  }
}
