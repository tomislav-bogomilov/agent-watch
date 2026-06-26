import { expect, test } from '@playwright/test';
import { utimes } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../fixtures/claude-projects/C--demo-live/2026-05-24-live-fixture.jsonl');
const SESSION_ID = '2026-05-24-live-fixture';

test('LIVE: per-pane Details|Logical Steps replaces the global dock; step click pins', async ({ page }) => {
  const now = new Date();
  await utimes(FIXTURE, now, now);
  await page.goto('/');
  await page.locator(`[data-testid="session-item-${SESSION_ID}"]`).click();
  await expect(page.locator('[data-testid="live-panes-grid"]')).toBeVisible({ timeout: 15_000 });

  // The single global dock must NOT exist in LIVE.
  await expect(page.getByTestId('inspector-tabs')).toHaveCount(0);

  // MAIN pane has its own tabbed inspector, Details active by default.
  const mainPane = page.locator('[data-testid="live-pane"]').first();
  await expect(mainPane.getByTestId('pane-tab-details')).toBeVisible();
  await expect(mainPane.getByTestId('pane-tab-narrative')).toBeVisible();

  // Open this pane's Logical Steps (opt-in), enable, get fake blocks.
  await mainPane.getByTestId('pane-tab-narrative').click();
  await expect(mainPane.getByTestId('narr-enable')).toBeVisible({ timeout: 5_000 });
  await mainPane.getByTestId('narr-enable').click();
  await expect(mainPane.getByTestId('narr-flow')).toBeVisible({ timeout: 15_000 });
  await expect(mainPane.getByTestId('narr-block-fake-1')).toBeVisible({ timeout: 10_000 });

  // The Logical Steps list stays inside the pane's aside (no downward overflow),
  // and is a vertical scroll container. Check while still on the narrative tab.
  const flow = mainPane.getByTestId('narr-flow');
  await expect(flow).toHaveCSS('min-height', '0px');
  await expect(flow).toHaveCSS('overflow-y', 'auto');
  const withinAside = await flow.evaluate((el) => {
    const aside = el.closest('[data-testid="live-pane-detail"]') as HTMLElement;
    return el.getBoundingClientRect().bottom <= aside.getBoundingClientRect().bottom + 1;
  });
  expect(withinAside).toBe(true);

  // Click a step -> pins that pane's start node. Switch to Details -> PINNED control shows.
  await mainPane.getByTestId('narr-block-fake-1').click();
  await mainPane.getByTestId('pane-tab-details').click();
  await expect(mainPane.getByTestId('live-pane-unpin')).toBeVisible({ timeout: 5_000 });
});
