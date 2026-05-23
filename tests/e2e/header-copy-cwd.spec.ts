import { expect, test } from '@playwright/test';

test('header copy-cwd button copies the path and flashes the check glyph', async ({ page, context }) => {
  // Grant clipboard permission so the page can call writeText in Chromium.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('/');
  await page.locator('[data-project-key="demo/happy"] li[data-testid^="session-item"]').first().click();

  // Header overlay must be visible with the cwd row.
  const header = page.getByTestId('session-header');
  await expect(header).toBeVisible();

  const btn = page.getByTestId('header-copy-cwd');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('⧉');

  await btn.click();

  // Glyph flips to ✓ briefly, then reverts.
  await expect(btn).toHaveText('✓');
  await page.waitForTimeout(1400);
  await expect(btn).toHaveText('⧉');

  // The clipboard now holds the cwd text. Read it back from the page context.
  const clipped = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipped).toMatch(/demo\/happy/);
});
