import { expect, test } from '@playwright/test';

test('scrubber click jumps playhead and pauses', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-project-key="demo/happy"] li[data-testid^="session-item"]').click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();

  // Start playback so we can verify the scrubber pauses it.
  await page.getByTestId('play-toggle').click();

  const scrubber = page.getByTestId('scrubber-track');
  await expect(scrubber).toBeVisible();
  const box = await scrubber.boundingBox();
  if (!box) throw new Error('no scrubber bbox');
  // Click near 80% — should land near the end
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
  const handlePct = await page.getByTestId('scrubber-handle').getAttribute('data-pct');
  expect(Number(handlePct)).toBeGreaterThan(50);
  // Should be paused (play button shows ▶)
  await expect(page.getByTestId('play-toggle')).toHaveText('▶');
});

test('step-forward button advances one milestone', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-project-key="demo/happy"] li[data-testid^="session-item"]').click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();
  const before = await page.getByTestId('scrubber-handle').getAttribute('data-pct');
  await page.getByTestId('step-forward').click();
  const after = await page.getByTestId('scrubber-handle').getAttribute('data-pct');
  expect(Number(after)).toBeGreaterThan(Number(before));
});
