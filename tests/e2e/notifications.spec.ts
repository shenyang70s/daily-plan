import { test, expect } from '@playwright/test';
import { signIn, api } from './helpers.js';
test('notifications can be marked read and snoozed persistently', async ({ page }) => {
  await signIn(page, 'notifications'); expect((await page.request.post('/__fixtures/notifications', { headers: { 'X-E2E-Fixture': 'isolated-test-only' }, data: {} })).ok()).toBeTruthy();
  await page.reload(); await page.locator('.notification-trigger').click(); await expect(page.locator('.notification-list li')).toHaveCount(2);
  await page.locator('.notification-list li').first().getByRole('button', { name: '标记已读', exact: true }).click();
  await expect.poll(async () => (await api(page, '/notifications')).unreadCount).toBe(1);
  await page.locator('.notification-list li:not(.notification-read)').getByRole('button', { name: '10 分钟后提醒', exact: true }).click();
  await expect.poll(async () => (await api(page, '/notifications')).items.filter((item: { snoozedUntil: string | null }) => item.snoozedUntil).length).toBe(1);
  await page.reload(); expect((await api(page, '/notifications')).unreadCount).toBe(0);
});
