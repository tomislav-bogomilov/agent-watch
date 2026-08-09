import { expect, test } from '@playwright/test';

test('discovery & load: lists fixture sessions and renders a tree', async ({ page }) => {
  await page.goto('/');
  // Assert stable fixture identities instead of the global session total so
  // provider-specific fixtures can be added without breaking discovery.
  await expect(page.getByTestId('provider-badge-claude/C--demo-happy/2026-01-01-aaaa')).toBeVisible();
  const happyGroup = page.locator('[data-project-key="demo/happy"]');
  await expect(happyGroup.getByText('Build with Codex', { exact: true })).toBeVisible();
  await expect(happyGroup.getByText('CODEX', { exact: true })).toBeVisible();
  // Click the happy-path session (cwd decodes to C:/demo/happy)
  await page.getByTestId('provider-badge-claude/C--demo-happy/2026-01-01-aaaa').click();
  await expect(page.getByTestId('hud-summary')).toHaveText('Please print hello world');
  await expect(page.locator('svg g[data-id]')).toHaveCount(7, { timeout: 5_000 });
});
