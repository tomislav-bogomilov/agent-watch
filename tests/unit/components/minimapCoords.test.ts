import { describe, it, expect } from 'vitest';
import { layoutFromMinimapPixel, viewportRectInLayout, isPointInRect } from '../../../src/components/minimapCoords';

describe('layoutFromMinimapPixel', () => {
  // Given a 200×140 minimap drawing a 1000×500 layout with uniform centering:
  // s = min(200/1000, 140/500) = 0.2; the y-axis fits exactly (500 * 0.2 = 100)
  // and the x-axis is fully used (1000 * 0.2 = 200).
  const W = 200;
  const H = 140;
  const s = Math.min(W / 1000, H / 500);
  const offX = (W - 1000 * s) / 2;
  const offY = (H - 500 * s) / 2;

  it('returns 0,0 for the top-left layout corner (after offset)', () => {
    const out = layoutFromMinimapPixel(offX, offY, offX, offY, s);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(0, 5);
  });

  it('returns 1000,500 for the bottom-right corner of the drawn layout', () => {
    const out = layoutFromMinimapPixel(offX + 1000 * s, offY + 500 * s, offX, offY, s);
    expect(out.x).toBeCloseTo(1000, 5);
    expect(out.y).toBeCloseTo(500, 5);
  });
});

describe('viewportRectInLayout', () => {
  it('returns the rect described by transform.k and the viewport size', () => {
    const r = viewportRectInLayout({ k: 2, x: -200, y: -100 }, { width: 800, height: 600 });
    // x = -tx/k = 100, y = -ty/k = 50, w = vw/k = 400, h = vh/k = 300
    expect(r.x).toBeCloseTo(100, 5);
    expect(r.y).toBeCloseTo(50, 5);
    expect(r.width).toBeCloseTo(400, 5);
    expect(r.height).toBeCloseTo(300, 5);
  });
});

describe('isPointInRect', () => {
  const rect = { x: 10, y: 20, width: 30, height: 40 };

  it('returns true for an interior point', () => {
    expect(isPointInRect({ x: 15, y: 25 }, rect)).toBe(true);
  });
  it('returns false for a point above the rect', () => {
    expect(isPointInRect({ x: 15, y: 5 }, rect)).toBe(false);
  });
  it('returns false for a point to the right of the rect', () => {
    expect(isPointInRect({ x: 100, y: 25 }, rect)).toBe(false);
  });
  it('treats the boundary as inside', () => {
    expect(isPointInRect({ x: 10, y: 20 }, rect)).toBe(true);
    expect(isPointInRect({ x: 40, y: 60 }, rect)).toBe(true);
  });
});
