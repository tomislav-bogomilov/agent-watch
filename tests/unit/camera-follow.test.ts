import { describe, it, expect } from 'vitest';
import { centerOnTransform } from '../../src/graph/useCamera';

function screenDistanceFromCenter(
  layoutPoint: { x: number; y: number },
  transform: { k: number; x: number; y: number },
  viewport: { width: number; height: number },
): number {
  const screenX = layoutPoint.x * transform.k + transform.x;
  const screenY = layoutPoint.y * transform.k + transform.y;
  const dx = screenX - viewport.width / 2;
  const dy = screenY - viewport.height / 2;
  return Math.sqrt(dx * dx + dy * dy);
}

describe('camera follow tolerance', () => {
  it('reports ~0 distance for a node already at the centered transform', () => {
    const pt = { x: 300, y: 200 };
    const viewport = { width: 800, height: 600 };
    const k = 1;
    const t = centerOnTransform(pt, viewport, k);
    expect(screenDistanceFromCenter(pt, t, viewport)).toBeLessThan(0.001);
  });

  it('reports a positive distance for an off-center node', () => {
    const pt = { x: 0, y: 0 };
    const viewport = { width: 800, height: 600 };
    const t = { k: 1, x: 0, y: 0 };
    expect(screenDistanceFromCenter(pt, t, viewport)).toBeCloseTo(500, 0);
  });
});
