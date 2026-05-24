export type Rect = { minX: number; minY: number; maxX: number; maxY: number };
export type Transform = { k: number; x: number; y: number };
export type Viewport = { width: number; height: number };

/** Returns the layout-space rectangle currently visible on screen given a
 *  zoom transform and viewport, expanded by `margin` layout units on each
 *  side. */
export function visibleLayoutRect(t: Transform, v: Viewport, margin: number): Rect {
  return {
    minX: (0          - t.x) / t.k - margin,
    minY: (0          - t.y) / t.k - margin,
    maxX: (v.width    - t.x) / t.k + margin,
    maxY: (v.height   - t.y) / t.k + margin,
  };
}

/** Inclusive on edges. Node footprints are small enough that a centre-only
 *  test plus the viewport margin is sufficient. */
export function nodeInRect(n: { x: number; y: number }, r: Rect): boolean {
  return n.x >= r.minX && n.x <= r.maxX && n.y >= r.minY && n.y <= r.maxY;
}

/** AABB-vs-rect: cheap and correct for the curved edges we draw (their
 *  bounding box is the rectangle spanned by endpoints). */
export function edgeIntersectsRect(
  e: { sourceX: number; sourceY: number; targetX: number; targetY: number },
  r: Rect
): boolean {
  const eMinX = Math.min(e.sourceX, e.targetX);
  const eMaxX = Math.max(e.sourceX, e.targetX);
  const eMinY = Math.min(e.sourceY, e.targetY);
  const eMaxY = Math.max(e.sourceY, e.targetY);
  return eMaxX >= r.minX && eMinX <= r.maxX && eMaxY >= r.minY && eMinY <= r.maxY;
}
