import { test, expect } from '@playwright/test';

test('clicking a graph node moves the playhead and pins the detail panel', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('session-item-2026-01-01-aaaa').click();
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

  // Regression: the detail panel scrolls vertically only — its content must be
  // contained in the width (long unbreakable paths/ids wrap), never producing a
  // horizontal scrollbar. Setting only overflow-y makes overflow-x compute to
  // auto, so overflow-x must be pinned hidden.
  const panelOverflow = await page.getByTestId('detail-panel').evaluate((el) => ({
    overflowX: getComputedStyle(el).overflowX,
    hasHScroll: el.scrollWidth > el.clientWidth,
  }));
  expect(panelOverflow.overflowX).toBe('hidden');
  expect(panelOverflow.hasHScroll).toBe(false);

  // Scrubber should have moved forward.
  await page.waitForTimeout(50);
  const movedPct = Number(
    await page.getByTestId('scrubber-handle').getAttribute('data-pct')
  );
  expect(movedPct).toBeGreaterThan(startPct);
});

test('after a click, pressing play resumes from the clicked node', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('session-item-2026-01-01-aaaa').click();
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
