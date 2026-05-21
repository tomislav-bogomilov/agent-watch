import { expect, test } from '@playwright/test';

test('failure: failed tool_call renders red with red-dot indicator', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/fail' }).click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();
  // The Read tool call should be in failed state
  await expect(page.locator('svg g[data-state="failed"]')).toHaveCount(1, { timeout: 5_000 });
  // Wait for playback to finish (3 milestones × 200ms ≈ 600ms; allow buffer)
  await page.waitForTimeout(2_000);
  // Success path should NOT include the failed branch.
  // The fail fixture has 3 milestones total. Success path = root_prompt + completion = 2.
  // success-state nodes < total nodes (3).
  const total = await page.locator('svg g[data-id]').count();
  const successCount = await page.locator('svg g[data-state="success"]').count();
  expect(successCount).toBeLessThan(total);
});
