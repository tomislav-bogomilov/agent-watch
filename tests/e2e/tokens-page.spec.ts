import { expect, test } from '@playwright/test';

test('tokens page: shows per-model rows and stacked-bar chart from fixtures', async ({ page }) => {
  await page.goto('/#/tokens');

  // Page chrome present
  await expect(page.getByTestId('tokens-page')).toBeVisible();
  await expect(page.getByText('TOKEN USAGE')).toBeVisible();

  // Fixtures contribute two model rows (opus main + opus sub + sonnet main = 3)
  await expect(page.getByTestId('model-row-claude-opus-4-7')).toBeVisible();
  await expect(page.getByTestId('model-row-claude-opus-4-7|sub')).toBeVisible();
  await expect(page.getByTestId('model-row-claude-sonnet-4-6')).toBeVisible();

  // Chart renders bars (3 model keys × N days)
  const initialRects = await page.locator('svg [data-role="bar"]').count();
  expect(initialRects).toBeGreaterThan(0);

  // 7D preset narrows the window — bar count must change (fixture days are
  // 2026-05-20 and 2026-05-23; "today" is whatever the test runner's date is
  // when invoked, so the assertion is "count changes" not "count equals N").
  await page.getByTestId('tokens-preset-7d').click();
  await expect.poll(async () => page.locator('svg [data-role="bar"]').count())
    .not.toBe(initialRects);

  // Metric switcher should still produce some bars when there's any data
  // in the current window. (If the 7d window contained no data, the empty
  // state is shown instead — that's also a valid outcome.)
  await page.getByTestId('tokens-preset-all').click();
  await page.getByTestId('tokens-metric-input').click();
  await expect(page.locator('svg [data-role="bar"]')).toHaveCount(initialRects);
});
