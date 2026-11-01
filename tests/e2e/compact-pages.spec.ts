import { test, expect } from '@playwright/test';
import { signIn, api } from './helpers.js';
test('Today has one submit path and no duplicate command hints', async ({ page }) => {
  await signIn(page, 'compact-today');
  await expect(page.locator('.command-hints')).toHaveCount(0); await expect(page.locator('.today-command kbd')).toHaveCount(0);
  await page.locator('#today-task-input').fill('记录：今日输入验证'); await page.locator('#today-task-input').press('Enter');
  await expect(page.locator('.ai-plan-preview')).toBeVisible(); expect((await api(page, '/tasks')).items).toHaveLength(0);
});
test('Inbox and calendar put primary content above long explanations and secondary tools', async ({ page }) => {
  await signIn(page, 'compact-pages'); await api(page, '/tasks', { title: '紧凑收集箱验证' });
  for (const width of [1440, 600]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/inbox'); await expect(page.locator('.task-row')).toHaveCount(1);
    expect(await page.locator('.task-row').evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(320);
    await expect(page.getByRole('button', { name: '批量管理', exact: true })).toBeHidden(); await expect(page.getByPlaceholder('搜索标题或备注')).toBeHidden();
    await page.getByText('筛选', { exact: true }).click(); await expect(page.locator('.board-filter-menu input[type=search]')).toBeVisible();
    await page.getByText('筛选', { exact: true }).click(); await page.getByText('更多', { exact: true }).click(); await expect(page.getByRole('button', { name: '批量管理', exact: true })).toBeVisible(); await page.getByText('更多', { exact: true }).click();
    await page.screenshot({ path: `test-results/inbox-compact-${width}.png` });
    await page.goto('/calendar'); await expect(page.locator('.calendar-scroll')).toBeVisible();
    await expect(page.getByText('日/周视图可拖动工作块', { exact: false })).toBeHidden();
    expect(await page.locator('.calendar-scroll').evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(340);
    await expect(page.locator('.calendar-zone')).toHaveText('Asia/Shanghai'); await page.getByText('操作提示', { exact: true }).click(); await expect(page.getByText('日/周视图可拖动工作块', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.getByText('操作提示', { exact: true }).click(); await page.screenshot({ path: `test-results/calendar-compact-${width}.png` });
  }
});
