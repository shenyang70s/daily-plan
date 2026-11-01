import { expect, type Page } from '@playwright/test';
export async function signIn(page: Page, suffix = 'owner', navigate = true) {
  const username = `e2e-${suffix}-${crypto.randomUUID().slice(0, 8)}`;
  const result = await page.request.post('/__fixtures/account', { headers: { 'X-E2E-Fixture': 'isolated-test-only' }, data: { username } }); expect(result.ok()).toBeTruthy();
  if (navigate) await page.goto('/today'); await page.getByLabel('用户名', { exact: true }).fill(username); await page.getByLabel('口令', { exact: true }).fill('e2e-browser-passphrase'); await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.shell-sidebar')).toBeAttached(); return username;
}
export async function api(page: Page, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  return page.evaluate(async ({ path, body, method }) => {
    const me = await (await fetch('/api/v1/me')).json();
    const response = await fetch('/api/v1' + path, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken, 'Idempotency-Key': crypto.randomUUID() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); if (!response.ok) throw new Error(JSON.stringify(result)); return result;
  }, { path, body, method });
}
export async function generate(page: Page, input: string) {
  const entry = page.locator('.ai-page-entry').last();
  await entry.locator('input').fill(input); await entry.getByRole('button', { name: '交给 AI', exact: true }).click(); await expect(page.locator('.ai-plan-preview')).toBeVisible();
}
export async function confirm(page: Page) {
  await page.getByRole('button', { name: '确认执行 1 项操作', exact: true }).click(); await expect(page.getByRole('heading', { name: '方案已执行', exact: true })).toBeVisible();
  await page.locator('dialog[open]').last().getByRole('button', { name: '关闭', exact: true }).click();
}
