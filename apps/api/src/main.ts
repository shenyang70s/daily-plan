import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module.js';
import { workspaceRoot } from './database.service.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  const webRoot = resolve(workspaceRoot, 'apps/web/dist');
  if (existsSync(webRoot)) app.useStaticAssets(webRoot);
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  await app.listen(port, process.env.HOST || '127.0.0.1');
}
bootstrap().catch((error: unknown) => {
  console.error('Research Tasks startup failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
