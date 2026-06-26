import { expect, test } from '@playwright/test';

test('playback: starts paused; play advances; pause freezes; resume completes', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-project-key="demo/happy"] li[data-testid^="session-item"]').click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();

  // Slow the cadence to 0.25× (1600 ms/node) so the play/pause/resume
  // timing below is independent of the default speed (now 2×). Default is
  // 2×; three −clicks step 2→1→0.5→0.25.
  await page.getByTestId('speed-dec').click();
  await page.getByTestId('speed-dec').click();
  await page.getByTestId('speed-dec').click();
  await expect(page.getByTestId('speed-value')).toHaveText('0.25×');

  // Should remain paused: even after waiting longer than the whole playback would take,
  // no node should be in 'success' state yet (still all idle or at most one active).
  await page.waitForTimeout(800);
  const successCountBefore = await page.locator('svg g[data-state="success"]').count();
  expect(successCountBefore).toBe(0);

  // Press play (cadence set to 0.25× above → 1600 ms / node)
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(900);
  const midActive = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  expect(midActive).not.toBeNull();

  // Pause
  await page.getByTestId('play-toggle').click();
  const pausedAt = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  await page.waitForTimeout(1200);
  const stillAt = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  expect(stillAt).toBe(pausedAt);

  // Resume and finish (1600 ms/node × 7 nodes ≈ 11.2 s)
  await page.getByTestId('play-toggle').click();
  await expect(page.locator('svg g[data-state="success"]')).toHaveCount(7, { timeout: 20_000 });
});
