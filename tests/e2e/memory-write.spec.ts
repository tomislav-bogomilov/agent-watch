import { expect, test } from '@playwright/test';

test('memory page: create a memory then delete it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-tab-memory').click();

  // Create a new memory via the dedicated sidebar button, then delete it,
  // leaving the fixture store in its original state.
  await page.getByTestId('memory-create').click();
  await page.getByTestId('editor-name').fill('e2e-temp');
  await page.getByTestId('editor-description').fill('temp e2e memory');
  await page.getByTestId('editor-body').fill('temp body');
  await page.getByTestId('editor-save').click();

  // New item appears in the sidebar.
  const item = page.getByTestId('memory-item-C--demo-mem-e2e-temp');
  await expect(item).toBeVisible({ timeout: 5000 });

  // Open and delete it.
  await item.click();
  await page.getByTestId('memory-delete').click();
  await page.getByTestId('delete-confirm-yes').click();
  await expect(item).toHaveCount(0, { timeout: 5000 });
});
