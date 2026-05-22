import { expect, test } from '@playwright/test';

test('wheel-zoom enlarges nodes (graph is no longer fit-to-screen only)', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  const firstNode = page.locator('svg g[data-id]').first();
  await expect(firstNode).toBeVisible();
  const before = await firstNode.boundingBox();
  if (!before) throw new Error('no node bbox');
  const svg = page.locator('svg').first();
  const svgBox = await svg.boundingBox();
  if (!svgBox) throw new Error('no svg bbox');
  await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
  await page.mouse.wheel(0, -800);
  await page.waitForTimeout(300);
  const after = await firstNode.boundingBox();
  if (!after) throw new Error('no node bbox post-zoom');
  expect(after.width).toBeGreaterThan(before.width);
});

test('FIT button reduces scale toward fit after zoom', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  const firstNode = page.locator('svg g[data-id]').first();
  await expect(firstNode).toBeVisible();
  const svg = page.locator('svg').first();
  const svgBox = await svg.boundingBox();
  if (!svgBox) throw new Error('no svg bbox');
  await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
  await page.mouse.wheel(0, -1200);
  await page.waitForTimeout(300);
  const zoomed = await firstNode.boundingBox();
  if (!zoomed) throw new Error('no zoomed bbox');
  await page.getByTestId('fit-button').click();
  await page.waitForTimeout(400);
  const fitted = await firstNode.boundingBox();
  if (!fitted) throw new Error('no fitted bbox');
  expect(fitted.width).toBeLessThan(zoomed.width);
});

test('tooltip lands within 260px of the hovered node', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  const node = page.locator('svg g[data-id]').first();
  await expect(node).toBeVisible();
  await node.hover();
  const tip = page.locator('[data-testid="node-tooltip"]');
  await expect(tip).toBeVisible();
  const nodeBox = await node.boundingBox();
  const tipBox = await tip.boundingBox();
  if (!nodeBox || !tipBox) throw new Error('missing bbox');
  const dx = Math.abs((tipBox.x + tipBox.width / 2) - (nodeBox.x + nodeBox.width / 2));
  expect(dx).toBeLessThan(260);
});
