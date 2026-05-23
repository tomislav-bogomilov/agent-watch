import { test, expect } from '@playwright/test';

test('clicking a graph node moves the playhead and pins the detail panel', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-project-key="demo/happy"] li[data-testid^="session-item"]').first().click();
  await page.locator('svg g[data-id]').first().waitFor();
  await page.getByTestId('chrome-gutter').waitFor();

  // Read scrubber percentage at index 0.
  const startPct = Number(
    await page.getByTestId('scrubber-handle').getAttribute('data-pct')
  );

  // Click the 4th rendered node (NodeShape inner <g> has data-id, data-kind, data-state).
  const someNode = page.locator('g[data-id][data-kind][data-state]').nth(3);
  await someNode.click();

  // Detail panel should be visible.
  await expect(page.getByTestId('detail-panel')).toBeVisible();

  // Scrubber should have moved forward.
  await page.waitForTimeout(50);
  const movedPct = Number(
    await page.getByTestId('scrubber-handle').getAttribute('data-pct')
  );
  expect(movedPct).toBeGreaterThan(startPct);
});

test('after a click, pressing play resumes from the clicked node', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-project-key="demo/happy"] li[data-testid^="session-item"]').first().click();
  await page.locator('svg g[data-id]').first().waitFor();
  await page.getByTestId('chrome-gutter').waitFor();

  // Click the 3rd node, then press play, wait a tick, pause.
  await page.locator('g[data-id][data-kind][data-state]').nth(2).click();
  const afterClickPct = Number(
    await page.getByTestId('scrubber-handle').getAttribute('data-pct')
  );

  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(1600);                 // ~1 node at 0.25x speed
  await page.getByTestId('play-toggle').click();

  const afterPlayPct = Number(
    await page.getByTestId('scrubber-handle').getAttribute('data-pct')
  );
  expect(afterPlayPct).toBeGreaterThan(afterClickPct);
});
