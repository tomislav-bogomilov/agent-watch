import { expect, test } from '@playwright/test';

test('HUD: summary and result populate as trail enters each node', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();

  // Playback is paused by default — start it.
  await page.getByTestId('play-toggle').click();

  // Default speed is 0.25× → 1600 ms per node. DFS order is
  // [root_prompt, assistant_turn, tool_call (Bash), completion]. The Bash
  // node becomes the active currentId at ~3200 ms (after edges to
  // root→assistant→bash). Its result line appears once edgeProgress
  // ≥ 0.6 (~4160 ms). Pause at ~4400 ms so the HUD is frozen on Bash
  // with the result typewriter in motion.
  await page.waitForTimeout(4400);
  await page.getByTestId('play-toggle').click();

  // Summary should show one of the milestone summaries seen so far.
  await expect(page.getByTestId('hud-summary')).toContainText(
    /Please print hello world|will run echo|Bash|Done/i,
    { timeout: 3_000 }
  );

  // Result line should show exit code 0 from the Bash tool_call.
  await expect(page.getByTestId('hud-result')).toContainText(/exit 0/, { timeout: 2_000 });
});
