import { expect, test } from '@playwright/test';

async function rectAttrs(page: import('@playwright/test').Page) {
  // The viewport indicator is the only <rect> with stroke=var(--edge-trail).
  return page.evaluate(() => {
    const svg = document.querySelector('[data-testid="minimap"]') as SVGSVGElement | null;
    if (!svg) throw new Error('no minimap');
    const r = svg.querySelector('rect[stroke="var(--edge-trail)"]') as SVGRectElement | null;
    if (!r) throw new Error('no viewport rect');
    const w = parseFloat(r.getAttribute('width') ?? '0');
    const h = parseFloat(r.getAttribute('height') ?? '0');
    const x = parseFloat(r.getAttribute('x') ?? '0');
    const y = parseFloat(r.getAttribute('y') ?? '0');
    return { x, y, w, h };
  });
}

test('minimap wheel zoom shrinks the viewport rect', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('session-item-2026-01-01-aaaa').click();
  const minimap = page.getByTestId('minimap');
  await expect(minimap).toBeVisible();

  const before = await rectAttrs(page);

  const box = await minimap.boundingBox();
  if (!box) throw new Error('no minimap bbox');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -600); // zoom in
  await page.waitForTimeout(150);

  const after = await rectAttrs(page);
  // Zooming in raises k; viewport rect (vw / k) shrinks.
  expect(after.w).toBeLessThan(before.w);
  expect(after.h).toBeLessThan(before.h);
});

test('minimap drag inside the viewport rect pans the camera', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('session-item-2026-01-01-aaaa').click();
  const minimap = page.getByTestId('minimap');
  await expect(minimap).toBeVisible();

  // Position cursor inside the viewport rect — at the rect's center on the
  // minimap. Compute that from current attrs.
  const start = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="minimap"]') as SVGSVGElement;
    const r = svg.querySelector('rect[stroke="var(--edge-trail)"]') as SVGRectElement;
    const g = svg.querySelector('g') as SVGGElement;
    const t = (g.getAttribute('transform') ?? '').match(/translate\(([-0-9.]+), ([-0-9.]+)\) scale\(([-0-9.]+)\)/);
    if (!t) throw new Error('no transform');
    const offX = parseFloat(t[1]); const offY = parseFloat(t[2]); const s = parseFloat(t[3]);
    const rx = parseFloat(r.getAttribute('x') ?? '0');
    const ry = parseFloat(r.getAttribute('y') ?? '0');
    const rw = parseFloat(r.getAttribute('width') ?? '0');
    const rh = parseFloat(r.getAttribute('height') ?? '0');
    const svgBox = svg.getBoundingClientRect();
    return {
      cx: svgBox.x + offX + (rx + rw / 2) * s,
      cy: svgBox.y + offY + (ry + rh / 2) * s,
    };
  });

  const rectBefore = await rectAttrs(page);

  await page.mouse.move(start.cx, start.cy);
  await page.mouse.down();
  await page.mouse.move(start.cx + 30, start.cy + 30, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  const rectAfter = await rectAttrs(page);
  // The rect's top-left position in layout space should have shifted.
  expect(Math.abs(rectAfter.x - rectBefore.x) + Math.abs(rectAfter.y - rectBefore.y)).toBeGreaterThan(1);
});

test('clicking outside the viewport rect still jumps the camera (preserved behavior)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('session-item-2026-01-01-aaaa').click();
  const minimap = page.getByTestId('minimap');
  await expect(minimap).toBeVisible();

  const before = await rectAttrs(page);
  const box = await minimap.boundingBox();
  if (!box) throw new Error('no minimap bbox');
  // Top-left corner of the minimap is far outside the centered viewport rect.
  await page.mouse.click(box.x + 8, box.y + 8);
  await page.waitForTimeout(400);

  const after = await rectAttrs(page);
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(1);
});
