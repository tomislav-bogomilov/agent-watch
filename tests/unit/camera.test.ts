import { describe, it, expect } from 'vitest';
import { fitTransform, centerOnTransform, type Bounds, type Viewport } from '../../src/graph/useCamera';

describe('fitTransform', () => {
  const tall: Bounds = { width: 1200, height: 4000 };
  const wide: Bounds = { width: 4000, height: 1000 };
  const viewport: Viewport = { width: 1200, height: 800 };

  it('scales down to fit a tall layout while preserving aspect ratio', () => {
    const t = fitTransform(tall, viewport, 24);
    // Height-constrained: scale = (800 - 48) / 4000
    expect(t.k).toBeCloseTo((800 - 48) / 4000, 3);
  });

  it('scales down to fit a wide layout', () => {
    const t = fitTransform(wide, viewport, 24);
    // Width-constrained: scale = (1200 - 48) / 4000
    expect(t.k).toBeCloseTo((1200 - 48) / 4000, 3);
  });

  it('caps scale at 1 (no zoom-up when layout is smaller than viewport)', () => {
    const small: Bounds = { width: 200, height: 200 };
    const t = fitTransform(small, viewport, 24);
    expect(t.k).toBe(1);
  });

  it('centers the layout horizontally', () => {
    const t = fitTransform(tall, viewport, 24);
    expect(t.x).toBeCloseTo((viewport.width - tall.width * t.k) / 2, 1);
  });
});

describe('centerOnTransform', () => {
  it('positions the given layout point at the viewport center', () => {
    const t = centerOnTransform({ x: 500, y: 300 }, { width: 1000, height: 600 }, 2);
    // After applying: screen.x = layout.x * k + t.x ⇒ 1000/2 = 500*2 + t.x ⇒ t.x = -500
    expect(t.k).toBe(2);
    expect(t.x).toBe(500 - 500 * 2);
    expect(t.y).toBe(300 - 300 * 2);
  });
});
