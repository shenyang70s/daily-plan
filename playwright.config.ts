import { defineConfig } from '@playwright/test';
const port = Number(process.env.E2E_PORT ?? 4179);
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 30000,
  forbidOnly: !!process.env.CI, retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {} },
  webServer: { command: 'node --import tsx tests/e2e/server.ts', url: `http://127.0.0.1:${port}/api/v1/ready`, reuseExistingServer: false, timeout: 30000, env: { RESEARCH_E2E: '1', E2E_PORT: String(port) } },
});
