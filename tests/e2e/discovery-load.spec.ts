import { expect, test } from '@playwright/test';

test('discovery & load: lists fixture sessions and renders a tree', async ({ page }) => {
  await page.goto('/');
  // Sidebar shows the 7 Claude fixtures plus one Codex fixture.
  await expect(page.locator('aside li[data-testid^="session-item"]')).toHaveCount(8);
  // Click the happy-path session (cwd decodes to C:/demo/happy)
  await page.getByTestId('provider-badge-claude/C--demo-happy/2026-01-01-aaaa').click();
  await expect(page.getByTestId('hud-summary')).toHaveText('Please print hello world');
  await expect(page.locator('svg g[data-id]')).toHaveCount(7, { timeout: 5_000 });
});
