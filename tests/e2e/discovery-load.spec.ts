import { expect, test } from '@playwright/test';

test('discovery & load: lists fixture sessions and renders a tree', async ({ page }) => {
  await page.goto('/');
  // Sidebar shows the 3 fixture projects
  await expect(page.locator('aside li')).toHaveCount(3);
  // Click the happy-path session (cwd decodes to C:/demo/happy)
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  // SVG nodes should render (7 milestones in the happy path)
  await expect(page.locator('svg g[data-id]')).toHaveCount(7, { timeout: 5_000 });
});
