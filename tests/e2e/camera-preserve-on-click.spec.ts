import { expect, test } from '@playwright/test';

async function readZoomScale(page: import('@playwright/test').Page): Promise<number> {
  const k = await page.evaluate(() => {
    const g = document.querySelector('svg g.zoom-layer') as SVGGElement | null;
    if (!g) return NaN;
    const t = g.getAttribute('transform') ?? '';
    const m = t.match(/scale\(([^)]+)\)/);
    return m ? Number.parseFloat(m[1]) : NaN;
  });
  return k;
}

test('clicking a node preserves the zoom level (does not refit)', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();
  // Zoom in on the canvas — any refit would visibly shrink the scale.
  const svg = page.locator('svg').first();
  const svgBox = await svg.boundingBox();
  if (!svgBox) throw new Error('no svg bbox');
  await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
  await page.mouse.wheel(0, -800);
  await page.waitForTimeout(350);
  const zoomedK = await readZoomScale(page);
  expect(zoomedK).toBeGreaterThan(1);
  // Click the node via JS event dispatch — bypasses viewport checks so this
  // test stays focused on the camera behavior, not on hit-testing.
  await page.evaluate(() => {
    const el = document.querySelector('svg g[data-id]') as SVGGElement | null;
    if (!el) throw new Error('no node');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await expect(page.getByTestId('detail-panel')).toBeVisible();
  await page.waitForTimeout(500);
  const afterK = await readZoomScale(page);
  // The zoom-layer's scale must stay near zoomedK. A refit would drop k below 1.
  expect(afterK).toBeGreaterThan(zoomedK * 0.85);
});
