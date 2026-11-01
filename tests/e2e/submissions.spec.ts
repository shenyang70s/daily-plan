import { test, expect } from '@playwright/test';
import { signIn, api } from './helpers.js';
test('CCF import preserves source provenance and never overwrites a manual deadline implicitly', async ({ page }) => {
  await signIn(page, 'source'); await page.request.post('/__fixtures/source', { headers: { 'X-E2E-Fixture': 'isolated-test-only' }, data: { version: 'a' } });
  await page.goto('/submissions'); await page.getByRole('button', { name: '选择顶会来源', exact: true }).click();
  await page.getByRole('button', { name: 'OSDI 2027 main', exact: true }).click(); await page.getByRole('button', { name: '确认来源并创建投稿', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'OSDI', exact: true })).toBeVisible();
  const submission = (await api(page, '/submissions')).items[0], full = submission.milestones.find((value: { kind: string }) => value.kind === 'full_paper');
  expect(submission.conferenceSource.commitSha).toBe('a'.repeat(40));
  await api(page, `/milestones/${full.id}`, { expectedVersion: full.version, due: { kind: 'date', date: '2026-12-15' }, confirmDeadlineChange: true }, 'PATCH');
  await page.request.post('/__fixtures/source', { headers: { 'X-E2E-Fixture': 'isolated-test-only' }, data: { version: 'b' } }); await page.reload();
  await page.getByRole('button', { name: '检查来源更新', exact: true }).click(); const dialog = page.locator('dialog[open]').last();
  await expect(dialog.getByText('来源更新与本地修订冲突', { exact: true })).toBeVisible(); await expect(dialog.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  const current = await api(page, `/submissions/${submission.id}`); expect(current.milestones.find((value: { id: string }) => value.id === full.id).due.date).toBe('2026-12-15'); expect(current.conferenceSource.commitSha).toBe('a'.repeat(40));
});
