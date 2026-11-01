import { test, expect } from '@playwright/test';
import { signIn, api, generate, confirm } from './helpers.js';
test('AI preview writes nothing before confirmation and persists after reload', async ({ page }) => {
  await signIn(page, 'ai'); await page.goto('/inbox'); await generate(page, '记录：AI持久化验证');
  expect((await api(page, '/tasks')).items).toHaveLength(0);
  await confirm(page); await page.reload();
  await expect(page.getByRole('link', { name: 'AI持久化验证', exact: true })).toBeVisible();
  const tasks = (await api(page, '/tasks')).items; expect(tasks).toHaveLength(1); expect(tasks[0].due).toBeNull();
});
test('model timeout preserves original input and leaves business data untouched', async ({ page }) => {
  await signIn(page, 'timeout'); await page.goto('/inbox');
  await page.locator('.ai-page-entry input').fill('模拟超时：保留输入'); await page.getByRole('button', { name: '交给 AI', exact: true }).click();
  await expect(page.getByRole('button', { name: '仅保存原文到收集箱', exact: true })).toBeVisible();
  await expect(page.locator('.ai-command textarea')).toHaveValue('模拟超时：保留输入'); expect((await api(page, '/tasks')).items).toHaveLength(0);
});
