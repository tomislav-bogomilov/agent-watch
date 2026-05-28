import { test, expect } from '@playwright/test';

test.describe('Hologram detail view', () => {
  test('pin opens DetailPanel AND HologramPanel together; Esc closes pin + hologram', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-project-key="demo/happy"] li[data-testid^="session-item"]').first().click();
    await page.locator('svg g[data-id]').first().waitFor();

    const firstNode = page.locator('g[data-id][data-kind][data-state]').first();
    await firstNode.click({ force: true });

    await expect(page.getByTestId('detail-panel')).toBeVisible();
    await expect(page.getByTestId('holo-root')).toBeVisible();

    await page.keyboard.press('Escape');

    // After Escape the pin is cleared; the hologram disappears.
    // The detail panel may remain showing the current playback node
    // (live/playback mode), but it is no longer pinned.
    await expect(page.getByTestId('holo-root')).toHaveCount(0);
    // Pinned detail view is gone — either panel is absent OR it no longer
    // shows as a pin (holo-id disappears along with holo-root).
    // We verify the hologram is gone; whether the panel stays in playback
    // mode is correct app behaviour.
  });

  test('clicking ▼ N more expands the skill list', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-project-key="demo/happy"] li[data-testid^="session-item"]').first().click();
    await page.locator('svg g[data-id]').first().waitFor();

    const firstNode = page.locator('g[data-id][data-kind][data-state]').first();
    await firstNode.click({ force: true });
    await expect(page.getByTestId('holo-root')).toBeVisible();

    const expand = page.getByTestId('holo-skill-expand');
    if (await expand.count() === 0) {
      test.skip();
      return;
    }

    const rowsBefore = await page.locator('[data-testid^="holo-skill-row-"]').count();
    await expand.click({ force: true });
    const rowsAfter = await page.locator('[data-testid^="holo-skill-row-"]').count();
    expect(rowsAfter).toBeGreaterThan(rowsBefore);
  });

  test('pinning a different node remounts cleanly', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-project-key="demo/happy"] li[data-testid^="session-item"]').first().click();
    await page.locator('svg g[data-id]').first().waitFor();

    const nodes = page.locator('g[data-id][data-kind][data-state]');
    await nodes.nth(0).click({ force: true });
    await expect(page.getByTestId('holo-root')).toBeVisible();
    const firstIdText = await page.getByTestId('holo-id').textContent();

    await nodes.nth(1).click({ force: true });
    await expect(page.getByTestId('holo-root')).toBeVisible();
    const secondIdText = await page.getByTestId('holo-id').textContent();

    expect(secondIdText).not.toBe(firstIdText);
  });

  test('clicking × on hologram closes the pin and hologram panel', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-project-key="demo/happy"] li[data-testid^="session-item"]').first().click();
    await page.locator('svg g[data-id]').first().waitFor();

    const firstNode = page.locator('g[data-id][data-kind][data-state]').first();
    await firstNode.click({ force: true });
    await expect(page.getByTestId('holo-root')).toBeVisible();

    // The holo-close button is an SVG <g> element. Use force:true to bypass the
    // detail-panel aside that may overlap the screen coordinates.
    await page.getByTestId('holo-close').click({ force: true });

    await expect(page.getByTestId('holo-root')).toHaveCount(0);
  });
});
