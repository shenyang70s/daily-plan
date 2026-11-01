import { Inject, Injectable, Module, Logger } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { finalize, tap } from 'rxjs';
import type { AuthRequest } from '../modules/identity/session.guard.js';

interface Measurements { requests: number; errors: number; totalMs: number; samples: number[] }
@Injectable()
export class Observability {
  readonly since = new Date().toISOString();
  private readonly users = new Map<string, Measurements>();
  record(userId: string, duration: number, failed: boolean): void {
    if (!this.users.has(userId) && this.users.size >= 1000) this.users.delete(this.users.keys().next().value!);
    const stats = this.users.get(userId) ?? { requests: 0, errors: 0, totalMs: 0, samples: [] };
    stats.requests++; stats.errors += Number(failed); stats.totalMs += duration;
    stats.samples.push(duration); if (stats.samples.length > 128) stats.samples.shift(); this.users.set(userId, stats);
  }
  forget(userId: string): void { this.users.delete(userId); }
  summary(userId: string) {
    const stats = this.users.get(userId), sorted = [...(stats?.samples ?? [])].sort((a, b) => a - b);
    return { since: this.since, requests: stats?.requests ?? 0, errors: stats?.errors ?? 0, avgDurationMs: stats ? stats.totalMs / stats.requests : 0, p95DurationMs: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? 0, sampleCount: sorted.length };
  }
}
@Injectable()
class RequestMetrics implements NestInterceptor {
  private readonly logger = new Logger('RequestMetrics');
  constructor(@Inject(Observability) private readonly metrics: Observability) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<AuthRequest & { route?: { path?: string } }>(), response = context.switchToHttp().getResponse<{ statusCode: number; setHeader(name: string, value: string): void }>();
    const started = performance.now(), requestId = randomUUID(), route = request.route?.path ?? 'unmatched'; let failed = false;
    response.setHeader('X-Request-Id', requestId);
    return next.handle().pipe(tap({ error: () => { failed = true; } }), finalize(() => {
      const durationMs = performance.now() - started, userId = request.sessionContext?.userId;
      // Long-lived streams, model workflows and bulk exports are not ordinary API latency.
      if (userId && !/\/(ai(?:\/|$)|account\/export|[^/]+\/stream)/.test(route) && !(request.method === 'DELETE' && route.endsWith('/account'))) this.metrics.record(userId, durationMs, failed || response.statusCode >= 400);
      if (process.env.REQUEST_LOGS === 'true') this.logger.log(JSON.stringify({ requestId, method: request.method, route, failed, durationMs: Math.round(durationMs) }));
    }));
  }
}
@Module({ providers: [Observability, { provide: APP_INTERCEPTOR, useClass: RequestMetrics }], exports: [Observability] })
export class ObservabilityModule {}
