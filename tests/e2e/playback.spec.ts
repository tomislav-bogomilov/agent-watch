import { expect, test } from '@playwright/test';

test('playback: starts paused; play advances; pause freezes; resume completes', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('session-item-2026-01-01-aaaa').click();
  await expect(page.getByTestId('selected-provider-badge')).toHaveText('CLAUDE');
  await expect(page.getByTestId('hud-summary')).toHaveText('Please print hello world');
  const nodes = page.locator('svg g[data-id]');
  await expect(nodes).toHaveCount(7);

  // Should remain paused: even after waiting longer than the whole playback would take,
  // no node should be in 'success' state yet (still all idle or at most one active).
  await page.waitForTimeout(800);
  const successCountBefore = await page.locator('svg g[data-state="success"]').count();
  expect(successCountBefore).toBe(0);

  // Press play (default 0.25× → 1600 ms / node)
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

  // Finish at maximum speed so this stays deterministic under parallel CI load.
  for (let i = 0; i < 4; i += 1) await page.getByTestId('speed-inc').click();
  await expect(page.getByTestId('speed-value')).toHaveText('4×');
  await page.getByTestId('play-toggle').click();
  await expect(page.getByTestId('scrubber-handle')).toHaveAttribute('data-pct', '100.0', { timeout: 8_000 });
  await expect(page.locator('svg g[data-state="active"]')).toHaveCount(0);
});
