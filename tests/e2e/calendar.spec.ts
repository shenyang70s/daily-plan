import { test, expect } from '@playwright/test';
import { signIn, api, confirm } from './helpers.js';
test('calendar slot creates a confirmed work block without turning its start into a deadline', async ({ page }) => {
  await signIn(page, 'calendar'); await page.goto('/calendar'); await page.getByRole('button', { name: '下一段日期', exact: true }).click();
  await page.locator('.calendar-slot-button').last().click();
  const input = page.locator('.ai-command textarea'), prefix = await input.inputValue();
  expect(prefix).toContain('Asia/Shanghai'); await expect(page.locator('.ai-plan-preview')).toHaveCount(0);
  await input.fill(prefix + '时段创建：类脑计算论文阅读'); await page.getByRole('button', { name: '生成方案', exact: true }).click(); await expect(page.locator('.ai-plan-preview')).toBeVisible();
  expect((await api(page, '/tasks')).items).toHaveLength(0); await confirm(page);
  await page.reload(); const saved = (await api(page, '/tasks')).items[0]; expect(saved.title).toBe('类脑计算论文阅读'); expect(saved.due).toBeNull(); expect(saved.scheduleBlocks).toHaveLength(1);
});
