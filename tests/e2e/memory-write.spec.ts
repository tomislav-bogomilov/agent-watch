import { expect, test } from '@playwright/test';

test('memory page: create a memory then delete it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('library-mode').selectOption('memory');

  // No "create" affordance is on the page by default for an unselected state;
  // create is triggered from the editor opened via the (existing) detail edit
  // flow only for edits. For create, the test drives the API-backed flow by
  // opening an existing memory and saving a NEW one is not possible — so we
  // assert create via the dedicated create button.
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
