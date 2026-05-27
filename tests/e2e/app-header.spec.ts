import { test, expect } from '@playwright/test';

test('app header is visible on load and shows the brand', async ({ page }) => {
  await page.goto('/');
  const header = page.getByTestId('app-header');
  await expect(header).toBeVisible();
  await expect(header).toContainText('WATCH');
});

test('header sits above the sidebar (column layout)', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.getByTestId('session-list').waitFor();
  const headerBox = await page.getByTestId('app-header').boundingBox();
  const sidebarBox = await page.getByTestId('session-list').boundingBox();
  expect(headerBox).not.toBeNull();
  expect(sidebarBox).not.toBeNull();
  expect(sidebarBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1);
});
