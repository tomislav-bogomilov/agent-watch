import { test, expect } from '@playwright/test';

async function loadDemoHappy(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).first().click();
  await page.locator('svg g[data-id]').first().waitFor();
  await page.getByTestId('chrome-gutter').waitFor();
}

test.describe('context badge', () => {
  test('badge appears on the current/root node by default; multiplies as playback advances', async ({ page }) => {
    await loadDemoHappy(page);

    const badges = page.getByTestId('context-badge');
    const initialCount = await badges.count();
    // Root and propagated user prompts have contextSize via Task 4, plus the
    // current playhead always shows; expect at least 1.
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // Play, wait long enough to cross several edges at default 0.25x
    // (1600 ms/node), then pause.
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(4800);
    await page.getByTestId('play-toggle').click();

    const after = await badges.count();
    expect(after).toBeGreaterThan(initialCount);
  });

  test('show-all-context toggle reveals badges on every milestone with usage', async ({ page }) => {
    await loadDemoHappy(page);
    const before = await page.getByTestId('context-badge').count();
    await page.getByTestId('filter-show-all-context').check();
    // Allow React state to flush.
    await page.waitForTimeout(50);
    const after = await page.getByTestId('context-badge').count();
    expect(after).toBeGreaterThan(before);
  });
});
