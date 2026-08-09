import { test, expect } from '@playwright/test';

// Uses the C--demo-happy / 2026-01-01-aaaa fixture — a non-live playback
// session with enough milestones (tool_use + result) that fakeBlocks() returns
// both fake-1 and fake-2 blocks.
//
// The InspectorTabs component renders null when tab='details' and no milestone
// is selected, so we must click a graph node first to pin a milestone and make
// the tabbed inspector appear, then switch to the Logical Steps tab.

test('narrative tab: enable -> fake blocks -> verbosity rebucket -> refresh -> click block', async ({ page }) => {
  await page.goto('/');

  // Open the happy-path playback session (non-live; no mtime touch needed).
  await page.getByTestId('session-item-2026-01-01-aaaa').click();

  // Wait for the graph nodes and playback chrome to be ready.
  await page.locator('g[data-id][data-kind][data-state]').first().waitFor({ timeout: 15_000 });
  await page.getByTestId('chrome-gutter').waitFor({ timeout: 10_000 });

  // Click a graph node to pin a milestone — this causes InspectorTabs to render
  // (it returns null when tab='details' and milestone is null).
  await page.locator('g[data-id][data-kind][data-state]').nth(2).click();
  await expect(page.getByTestId('inspector-tabs')).toBeVisible({ timeout: 8_000 });

  // Switch to the Logical Steps tab.
  await page.locator('[data-testid="tab-narrative"]').click();

  // The enable prompt should appear (narrative not yet started).
  await expect(page.locator('[data-testid="narr-enable"]')).toBeVisible({ timeout: 5_000 });
  await page.locator('[data-testid="narr-enable"]').click();

  // TG_NARRATOR_FAKE=1 → server returns two canned blocks quickly.
  await expect(page.locator('[data-testid="narr-flow"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="narr-block-fake-1"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-testid="narr-block-fake-2"]')).toBeVisible({ timeout: 10_000 });

  // Verbosity control: switch to Overview. rebucket() runs purely in the browser
  // (no network call). Blocks remain visible (both belong to different phases).
  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page.locator('[data-testid^="narr-block-"]')).toHaveCount(2);

  // Switch to Detailed verbosity — block detail text should render.
  await page.getByRole('button', { name: 'Detailed' }).click();
  await expect(page.locator('[data-testid="narr-block-fake-1"]')).toBeVisible();

  // Refresh triggers a server rebuild (fake resolves quickly, blocks reappear).
  await page.locator('[data-testid="narr-refresh"]').click();
  await expect(page.locator('[data-testid="narr-block-fake-1"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="narr-block-fake-2"]')).toBeVisible({ timeout: 10_000 });

  // Clicking a block does not throw and the app stays responsive (narr-flow still visible).
  await page.locator('[data-testid="narr-block-fake-2"]').click();
  await expect(page.locator('[data-testid="narr-flow"]')).toBeVisible();

  // Regression: the block list must be a bounded scroll container, not an
  // element that grows past the dock and overflows downward. A flex child with
  // `flex: 1; overflow: auto` only scrolls if it can shrink below its content —
  // i.e. it needs `min-height: 0` (the default `min-height: auto` blocks it).
  const flow = page.locator('[data-testid="narr-flow"]');
  await expect(flow).toHaveCSS('min-height', '0px');
  await expect(flow).toHaveCSS('overflow-y', 'auto');
  // And the list stays within the inspector dock (its bottom never exceeds it).
  const withinDock = await flow.evaluate((el) => {
    const dock = document.querySelector('[data-testid="inspector-tabs"]');
    return el.getBoundingClientRect().bottom <= dock.getBoundingClientRect().bottom + 1;
  });
  expect(withinDock).toBe(true);

  // Regression: in playback the dock overlays the same frame as the chrome
  // gutter (playback controls) anchored at the bottom. The dock must stop above
  // the gutter (App measures it and passes a bottomInset), not run behind it.
  // ResizeObserver → state → re-render is async, so poll.
  await expect.poll(async () => page.evaluate(() => {
    const d = document.querySelector('[data-testid="inspector-tabs"]').getBoundingClientRect();
    const g = document.querySelector('[data-testid="chrome-gutter"]').getBoundingClientRect();
    return Math.round(d.bottom - g.top);
  }), { timeout: 8_000 }).toBeLessThanOrEqual(1);

  // Clicking a step now also pins/selects its start node (playback): the Details
  // tab shows the pinned node.
  await page.locator('[data-testid="tab-details"]').click();
  await expect(page.locator('[data-testid="detail-panel"]')).toBeVisible({ timeout: 5_000 });
});
