import { test, expect } from '@playwright/test';
import { signIn, api, generate, confirm } from './helpers.js';
test('capture to inbox, schedule to Today, complete and reload', async ({ page }) => {
  await signIn(page, 'tasks'); await page.goto('/inbox'); await generate(page, '记录：边缘SNN复现实验'); await confirm(page);
  await page.getByRole('link', { name: '边缘SNN复现实验', exact: true }).click();
  await generate(page, '安排今天的工作时段'); await confirm(page);
  await page.goto('/today'); const row = page.locator('.task-row').filter({ hasText: '边缘SNN复现实验' }); await expect(row).toBeVisible();
  await row.locator('.task-complete-check').click(); await expect.poll(async () => (await api(page, '/tasks')).items[0].status).toBe('done');
  await page.reload(); const saved = (await api(page, '/tasks')).items[0]; expect(saved.status).toBe('done'); expect(saved.due).toBeNull(); expect(saved.scheduleBlocks).toHaveLength(1);
});
test('board is the default focus and secondary tools stay collapsed', async ({ page }) => {
  await signIn(page, 'board'); await api(page, '/tasks', { title: '看板布局验证' }); await page.goto('/tasks');
  await expect(page.locator('.task-board')).toBeVisible(); await expect(page.getByRole('button', { name: '批量管理', exact: true })).toBeHidden(); await expect(page.getByPlaceholder('搜索任务、项目……')).toBeHidden();
  for (const width of [1440, 1180, 600]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator('.task-board').evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `test-results/board-compact-${width}.png` });
    await page.getByText('筛选', { exact: true }).click(); await expect(page.getByPlaceholder('搜索任务、项目……')).toBeVisible();
    const menu = await page.locator('.board-filter-menu > div').boundingBox(); expect(menu!.x).toBeGreaterThanOrEqual(0); expect(menu!.x + menu!.width).toBeLessThanOrEqual(width);
    await page.getByText('筛选', { exact: true }).click(); await page.getByText('更多', { exact: true }).click(); await expect(page.getByRole('button', { name: '批量管理', exact: true })).toBeVisible();
    await page.getByText('更多', { exact: true }).click();
  }
});
test('board cards use concise project tags with full names available on hover', async ({ page }) => {
  await signIn(page, 'board-project');
  const name='【课题】边缘智能：事件感知与低功耗推理';
  const project=await api(page,'/projects',{name});
  await api(page,'/tasks',{title:'有课题的任务',projectId:project.id,type:'experiment'});
  await api(page,'/tasks',{title:'无课题的任务',type:'paper_reading'});
  await page.goto('/tasks');
  const linked=page.locator('.task-board-card').filter({hasText:'有课题的任务'}),unlinked=page.locator('.task-board-card').filter({hasText:'无课题的任务'});
  await expect(linked.locator('.task-board-project')).toHaveText('边缘智能');await expect(linked.locator('.task-board-project')).toHaveAttribute('title',name);
  await expect(linked.locator('.task-board-meta')).toHaveText('边缘智能');await expect(linked.locator('.task-board-type')).toHaveCount(0);await expect(unlinked.locator('.task-board-project')).toHaveCount(0);
  await expect(unlinked.locator('.task-board-meta')).toHaveText('论文阅读');
  for(const width of [1440,600]){
    await page.setViewportSize({width,height:900});
    const fits=await linked.locator('.task-board-meta').evaluate(element=>({overflow:getComputedStyle(element.querySelector('.task-board-project')).textOverflow,height:element.getBoundingClientRect().height}));
    expect(fits.overflow).toBe('ellipsis');expect(fits.height).toBeLessThan(25);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await page.screenshot({path:`test-results/board-project-${width}.png`});
  }
});
