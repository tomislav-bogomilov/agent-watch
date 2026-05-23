import { test, expect } from '@playwright/test';

test('sidebar auto-collapses below 1400px and re-expands above', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.getByTestId('session-list').waitFor();

  // Wide: sidebar should be expanded (filter input visible).
  await expect(page.getByTestId('session-filter')).toBeVisible();

  // Resize narrow → auto-collapse: filter input removed, only the collapse stub remains.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByTestId('session-filter')).toHaveCount(0);
  await expect(page.getByTestId('sidebar-toggle')).toBeVisible();

  // Manually expand at narrow width.
  await page.getByTestId('sidebar-toggle').click();
  await expect(page.getByTestId('session-filter')).toBeVisible();

  // Resize wide again — sidebar stays expanded.
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(page.getByTestId('session-filter')).toBeVisible();
});

test('canvas+gutter are capped and centered above 2400px wide', async ({ page }) => {
  await page.setViewportSize({ width: 3400, height: 1000 });
  await page.goto('/');
  await page.locator('[data-project-key="demo/happy"] li[data-testid^="session-item"]').first().click();
  await page.locator('svg g[data-id]').first().waitFor();
  await page.getByTestId('chrome-gutter').waitFor();

  // The gutter is inside contentFrame; its bounding rect width must be <= CONTENT_MAX.
  const gutter = page.getByTestId('chrome-gutter');
  const box = await gutter.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(2400 + 1);

  // The frame should be visually centered within <main>:
  // sidebar sits on the left; the frame's left edge should sit strictly to the right
  // of (sidebar right edge + a noticeable side-band).
  const sidebarBox = await page.getByTestId('session-list').boundingBox();
  expect(sidebarBox).not.toBeNull();
  expect(box!.x).toBeGreaterThan(sidebarBox!.x + sidebarBox!.width + 50);
});
