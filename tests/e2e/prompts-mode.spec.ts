import { expect, test } from '@playwright/test';

test('prompts mode: dropdown switches the list, clicking a prompt opens a scoped graph', async ({ page }) => {
  await page.goto('/');

  // Default Sessions mode renders a list with 4 fixture projects (happy/fail/sub/live).
  await expect(page.locator('aside li[data-testid^="session-item"]')).toHaveCount(6);

  // Switch to Prompts mode via the dropdown.
  await page.locator('[data-testid="library-mode"]').selectOption('prompts');

  // Demo-happy fixture has 2 prompts (root + follow-up); the other fixtures
  // each contribute at least 1 prompt. So we expect >= 4 prompt rows total.
  const promptRows = page.locator('aside li[data-testid^="prompt-item"]');
  await expect(promptRows.first()).toBeVisible({ timeout: 5_000 });
  const promptCount = await promptRows.count();
  expect(promptCount).toBeGreaterThanOrEqual(4);

  // Click the prompt whose text contains "Now print goodbye" (the follow-up
  // we added in Task 1). Its slice covers tool_call (h6) + completion (h8)
  // -- 3 milestones total including the prompt itself.
  await page.locator('aside li[data-testid^="prompt-item"]', { hasText: 'Now print goodbye' }).click();

  // The session-header overlay relabels to PROMPT N.
  await expect(page.locator('[data-testid="session-header"]')).toContainText(/PROMPT \d+/);

  // The canvas mounts; the slice contains 3 nodes (prompt + tool + completion).
  await expect(page.locator('svg g[data-id]')).toHaveCount(3, { timeout: 5_000 });

  // Now switch back to Sessions mode and verify the dropdown remains
  // functional and the session list reappears.
  await page.locator('[data-testid="library-mode"]').selectOption('sessions');
  await expect(page.locator('aside li[data-testid^="session-item"]')).toHaveCount(6);
});
