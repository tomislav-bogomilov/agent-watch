import { expect, test } from '@playwright/test';

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
