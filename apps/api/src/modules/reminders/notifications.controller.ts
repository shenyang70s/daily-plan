import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req, Sse, UseGuards } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { NotificationListSchema, SnoozeNotificationSchema, EmptyInputSchema } from '@research/contracts';
import { SessionGuard } from '../identity/session.guard.js';
import type { AuthRequest } from '../identity/session.guard.js';
import { parseInput } from '../tasks/tasks.controller.js';
import { DatabaseService } from '../../database.service.js';
import { RemindersService } from './reminders.service.js';
@Controller('notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(@Inject(RemindersService) private readonly reminders: RemindersService, @Inject(DatabaseService) private readonly database: DatabaseService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: unknown) { return this.reminders.notifications(req.sessionContext!, parseInput(NotificationListSchema, query)); }
  @Post(':id/read') read(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { parseInput(EmptyInputSchema, body); return this.reminders.read(req.sessionContext!, id, key); }
  @Post(':id/snooze') snooze(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key = '') { return this.reminders.snooze(req.sessionContext!, id, parseInput(SnoozeNotificationSchema, body), key); }
  @Sse('stream') stream(@Req() req: AuthRequest): Observable<MessageEvent> {
    const ctx = req.sessionContext!;
    return new Observable(subscriber => {
      const notify = () => {
        const session = this.database.database.get('SELECT id FROM sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?', ctx.sessionId, ctx.userId, Date.now());
        if (!session) { subscriber.complete(); return; }
        // The stream is an invalidation signal. GET remains the durable catch-up source.
        subscriber.next({ type: 'notifications', data: { refresh: true } });
      };
      notify(); const timer = setInterval(notify, 10000); timer.unref();
      return () => clearInterval(timer);
    });
  }
}
