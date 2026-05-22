import { expect, test } from '@playwright/test';

test('HUD: summary and result populate as trail enters each node', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();

  // Playback is paused by default — start it.
  await page.getByTestId('play-toggle').click();

  // Default speed is 0.25× → 1600ms per node. Bash tool_call (index 2 of 4)
  // becomes active at ~1600ms; its result line appears once edgeProgress
  // ≥ 0.6 (~2560ms into playback). Pause at ~2880ms so the HUD is frozen
  // on the Bash node with the result typewriter in motion.
  await page.waitForTimeout(2880);
  await page.getByTestId('play-toggle').click();

  // Summary should show one of the milestone summaries seen so far.
  await expect(page.getByTestId('hud-summary')).toContainText(
    /Please print hello world|will run echo|Bash|Done/i,
    { timeout: 3_000 }
  );

  // Result line should show exit code 0 from the Bash tool_call.
  await expect(page.getByTestId('hud-result')).toContainText(/exit 0/, { timeout: 2_000 });
});
