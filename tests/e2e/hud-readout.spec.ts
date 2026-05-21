import { expect, test } from '@playwright/test';

test('HUD: summary and result populate as trail enters each node', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();

  // The Bash tool_call milestone (index 2 of 4) becomes active at ~200ms;
  // its result line appears once edgeProgress >= 0.6 (~300ms into playback).
  // Pause at ~330ms so the HUD is frozen on the Bash node with the result
  // typewriter in motion. The typewriter (220ms duration) then completes
  // while playback is paused, letting us assert the text reliably.
  await page.waitForTimeout(330);
  await page.getByTestId('play-toggle').click();

  // Summary should show one of the milestone summaries seen so far.
  await expect(page.getByTestId('hud-summary')).toContainText(
    /Please print hello world|will run echo|Bash|Done/i,
    { timeout: 3_000 }
  );

  // Result line should show exit code 0 from the Bash tool_call.
  // Allow up to 2s for the typewriter to finish typing "exit 0 — hello".
  await expect(page.getByTestId('hud-result')).toContainText(/exit 0/, { timeout: 2_000 });
});
