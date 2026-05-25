import { expect, test } from '@playwright/test';

test('discovery & load: lists fixture sessions and renders a tree', async ({ page }) => {
  await page.goto('/');
  // Sidebar shows the 6 fixture sessions (happy/fail/sub/live each have 1; tokens has 2).
  await expect(page.locator('aside li[data-testid^="session-item"]')).toHaveCount(6);
  // Click the happy-path session (cwd decodes to C:/demo/happy)
  await page.locator('[data-project-key="demo/happy"] li[data-testid^="session-item"]').click();
  // SVG nodes should render (7 milestones in the happy path)
  await expect(page.locator('svg g[data-id]')).toHaveCount(7, { timeout: 5_000 });
});
