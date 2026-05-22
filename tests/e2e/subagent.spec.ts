import { expect, test } from '@playwright/test';

test('subagent: subtree renders, traversal descends first', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/sub' }).click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();
  // Total milestones: main (3) + subagent (3) = 6
  await expect(page.locator('svg g[data-id]')).toHaveCount(6, { timeout: 5_000 });
  // Bounding region for subagent subtree should render
  await expect(page.locator('[data-testid="subagent-region"]')).toHaveCount(1);
  // Playback is paused by default — start it explicitly.
  await page.getByTestId('play-toggle').click();
  // Capture active-node ids at intervals during playback by reading the DOM
  // directly (no Playwright auto-wait). Default speed is 0.25× → 1600 ms
  // per node; 6 nodes ≈ 9.6 s. Sampling every 400 ms over 11 s gives 28
  // samples — enough to cover the subagent subtree.
  // DFS order: m1 → m2#tu_sub1 → s1 → s2#tu_sg → s4 → m4. At least one
  // observed active id must be a subagent node (s1, s2#tu_sg, or s4).
  const observed: (string | null)[] = [];
  for (let i = 0; i < 28; i++) {
    await page.waitForTimeout(400);
    const id = await page.evaluate(() => {
      const el = document.querySelector('svg g[data-state="active"]');
      return el ? el.getAttribute('data-id') : null;
    });
    observed.push(id);
  }
  const subagentNodeIds = new Set(['s1', 's2#tu_sg', 's4']);
  const hitSubagent = observed.some((id) => id !== null && subagentNodeIds.has(id));
  expect(hitSubagent, `Active node never landed on a subagent node. Observed: ${JSON.stringify(observed)}`).toBe(true);
});
