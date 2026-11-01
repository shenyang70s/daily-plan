import { test, expect } from '@playwright/test';
import { signIn, generate, api, confirm } from './helpers.js';
for (const width of [1440, 1180, 600]) test(`core surfaces and session isolation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await signIn(page, `layout-${width}`);
  await expect(page.locator('#today-task-input')).toBeVisible();
  await page.goto('/inbox'); await expect(page.getByText('收集箱已清空', { exact: true })).toBeVisible();
  await generate(page, `记录：布局研究任务${width}`);
  await page.getByRole('button', { name: '确认执行 1 项操作', exact: true }).focus(); await expect(page.getByRole('button', { name: '确认执行 1 项操作', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false); await page.screenshot({ path: `test-results/ai-preview-${width}.png` }); await confirm(page);
  await page.getByRole('link', { name: `布局研究任务${width}`, exact: true }).click(); await expect(page.locator('.resource-overview')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false); await page.screenshot({ path: `test-results/task-drawer-${width}.png` });
  const ownId = (await api(page, '/tasks')).items[0].id;
  await page.locator('dialog[open]').last().getByRole('button', { name: '关闭', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 }); await page.getByRole('button', { name: '退出登录', exact: true }).click(); await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  await signIn(page, `other-${width}`, false); await page.locator('.shell-sidebar a[href="/tasks"]').click(); await page.setViewportSize({ width, height: 900 }); await expect(page.getByText(`布局研究任务${width}`, { exact: true })).toHaveCount(0);
  const response = await page.request.get(`/api/v1/tasks/${ownId}`); expect(response.status()).toBe(404);
});
