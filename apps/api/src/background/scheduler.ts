import type { OnApplicationBootstrap, BeforeApplicationShutdown } from '@nestjs/common';
import { PushDelivery } from './push.js';
import { ReminderDelivery } from './delivery.js';
export class ReminderScheduler implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private running: Promise<void> | undefined;
  constructor(private readonly delivery: ReminderDelivery, private readonly push: PushDelivery) {}
  onApplicationBootstrap(): void { this.schedule(0); }
  private schedule(delay: number): void { if (!this.stopped) { this.timer = setTimeout(() => { this.running = this.run(); }, delay); this.timer.unref(); } }
  private async run(): Promise<void> { try { await this.delivery.tick(); await this.push.tick(); } catch { console.error('Reminder scan failed; will retry'); } finally { this.schedule(5000); } }
  async beforeApplicationShutdown(): Promise<void> { this.stopped = true; clearTimeout(this.timer); await this.running; }
}
