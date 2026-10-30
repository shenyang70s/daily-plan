import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module.js';
import { workspaceRoot } from './database.service.js';

async function bootstrap(): Promise<void> {
  if(process.env.NODE_ENV==='production'){const origin=process.env.APP_ORIGIN;if(!origin||!origin.startsWith('https://')||new URL(origin).origin!==origin)throw new Error('APP_ORIGIN must be an exact HTTPS origin in production')}
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  const webRoot = resolve(workspaceRoot, 'apps/web/dist');
  if (existsSync(webRoot)) app.useStaticAssets(webRoot);
  try{
    const port = Number(process.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
    await app.listen(port, process.env.HOST || '127.0.0.1');
  }catch(error){await app.close();throw error}
}
bootstrap().catch((error: unknown) => {
  console.error('Research Tasks startup failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
