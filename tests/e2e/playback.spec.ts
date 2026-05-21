import { expect, test } from '@playwright/test';

test('playback: auto-advances, pause freezes, resume continues', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  // Wait for nodes
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();
  // Trail should have an active node mid-traversal (4 nodes × 200ms = ~800ms total)
  await page.waitForTimeout(400);
  const active1 = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  expect(active1).not.toBeNull();
  // Pause
  await page.getByTestId('play-toggle').click();
  const pausedAt = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  await page.waitForTimeout(800);
  const stillAt = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  expect(stillAt).toBe(pausedAt);
  // Resume
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(1_200);
  // Should eventually finish; success nodes appear
  await expect(page.locator('svg g[data-state="success"]')).toHaveCount(4, { timeout: 5_000 });
});
