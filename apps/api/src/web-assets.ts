import type { NestExpressApplication } from '@nestjs/platform-express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function configureWebAssets(app: NestExpressApplication, webRoot: string): void {
  const entry = resolve(webRoot, 'index.html');
  if (!existsSync(entry)) return;
  app.useStaticAssets(webRoot);
  app.use((request: IncomingMessage, response: ServerResponse & { sendFile(path: string): void }, next: () => void) => {
    const path = (request.url || '/').split('?')[0]!;
    const isApi = path === '/api' || path.startsWith('/api/');
    if (!['GET', 'HEAD'].includes(request.method || '') || isApi || path.startsWith('/assets/') || !request.headers.accept?.includes('text/html')) {
      next();
      return;
    }
    response.sendFile(entry);
  });
}
