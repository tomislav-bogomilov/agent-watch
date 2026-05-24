import { describe, it, expect } from 'vitest';
import { visibleLayoutRect, nodeInRect, edgeIntersectsRect, type Rect } from '../../../src/graph/viewport';

describe('visibleLayoutRect', () => {
  it('translates screen viewport to layout coordinates at k=1, x=y=0', () => {
    const r = visibleLayoutRect({ k: 1, x: 0, y: 0 }, { width: 800, height: 600 }, 0);
    expect(r).toEqual({ minX: 0, minY: 0, maxX: 800, maxY: 600 });
  });

  it('accounts for a pan', () => {
    // Pan right 200 (transform.x = 200) shifts visible layout LEFT by 200.
    const r = visibleLayoutRect({ k: 1, x: 200, y: 0 }, { width: 800, height: 600 }, 0);
    expect(r.minX).toBe(-200);
    expect(r.maxX).toBe(600);
  });

  it('accounts for zoom-out', () => {
    // k=0.5 means each layout unit covers 0.5 screen px -> visible layout is 2x viewport.
    const r = visibleLayoutRect({ k: 0.5, x: 0, y: 0 }, { width: 800, height: 600 }, 0);
    expect(r).toEqual({ minX: 0, minY: 0, maxX: 1600, maxY: 1200 });
  });

  it('expands by margin', () => {
    const r = visibleLayoutRect({ k: 1, x: 0, y: 0 }, { width: 800, height: 600 }, 200);
    expect(r).toEqual({ minX: -200, minY: -200, maxX: 1000, maxY: 800 });
  });
});

describe('nodeInRect', () => {
  const rect: Rect = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  it('keeps a node strictly inside', () => {
    expect(nodeInRect({ x: 50, y: 50 }, rect)).toBe(true);
  });
  it('keeps a node on the edge', () => {
    expect(nodeInRect({ x: 0, y: 0 }, rect)).toBe(true);
    expect(nodeInRect({ x: 100, y: 100 }, rect)).toBe(true);
  });
  it('drops a node outside', () => {
    expect(nodeInRect({ x: 200, y: 50 }, rect)).toBe(false);
    expect(nodeInRect({ x: 50, y: -10 }, rect)).toBe(false);
  });
});

describe('edgeIntersectsRect', () => {
  const rect: Rect = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  it('keeps edges with both endpoints inside', () => {
    expect(edgeIntersectsRect({ sourceX: 10, sourceY: 10, targetX: 90, targetY: 90 }, rect)).toBe(true);
  });
  it('keeps edges with one endpoint inside', () => {
    expect(edgeIntersectsRect({ sourceX: 10, sourceY: 10, targetX: 200, targetY: 90 }, rect)).toBe(true);
  });
  it('keeps edges whose AABB crosses the rect even if both endpoints are outside', () => {
    // Endpoints at (-50, 50) and (150, 50). AABB is x:[-50,150] y:[50,50] which overlaps x:[0,100].
    expect(edgeIntersectsRect({ sourceX: -50, sourceY: 50, targetX: 150, targetY: 50 }, rect)).toBe(true);
  });
  it('drops edges whose AABB is entirely outside', () => {
    expect(edgeIntersectsRect({ sourceX: 200, sourceY: 200, targetX: 300, targetY: 300 }, rect)).toBe(false);
    expect(edgeIntersectsRect({ sourceX: -50, sourceY: -50, targetX: -10, targetY: -10 }, rect)).toBe(false);
  });
});
