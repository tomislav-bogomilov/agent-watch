import { expect, test } from '@playwright/test';

test('playback: starts paused; play advances; pause freezes; resume completes', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();

  // Should remain paused: even after waiting longer than the whole playback would take,
  // no node should be in 'success' state yet (still all idle or at most one active).
  await page.waitForTimeout(800);
  const successCountBefore = await page.locator('svg g[data-state="success"]').count();
  expect(successCountBefore).toBe(0);

  // Press play
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(450);
  const midActive = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  expect(midActive).not.toBeNull();

  // Pause
  await page.getByTestId('play-toggle').click();
  const pausedAt = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  await page.waitForTimeout(800);
  const stillAt = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  expect(stillAt).toBe(pausedAt);

  // Resume and finish (default 400ms/node × 4 nodes ≈ 1.6s)
  await page.getByTestId('play-toggle').click();
  await expect(page.locator('svg g[data-state="success"]')).toHaveCount(4, { timeout: 8_000 });
});
