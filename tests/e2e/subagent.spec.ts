import { expect, test } from '@playwright/test';

test('subagent: subtree renders, traversal descends first', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/sub' }).click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();
  // Total milestones: main (3) + subagent (3) = 6
  await expect(page.locator('svg g[data-id]')).toHaveCount(6, { timeout: 5_000 });
  // Bounding region for subagent subtree should render
  await expect(page.locator('[data-testid="subagent-region"]')).toHaveCount(1);
  // Wait long enough to see the trail enter the subagent subtree.
  // Order: m1 (0) → m2#tu_sub1 (200ms) → s1 (400ms) → s2#tu_sg (600ms) → s4 (800ms) → m4 (1000ms)
  // At ~500-700ms after click, the active node should be inside the subagent subtree (s1, s2#tu_sg, or s4).
  await page.waitForTimeout(600);
  const active = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  // Active ID should be one of the subagent node ids
  expect(active).not.toBeNull();
  expect(active === 's1' || active === 's2#tu_sg' || active === 's4').toBe(true);
});
