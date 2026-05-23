import type { Transform } from '../graph/useCamera';

export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };

/**
 * Convert a pixel position inside the minimap SVG to a layout-space point.
 *
 * The minimap renders the layout uniformly scaled (factor `s`) with an offset
 * `(offX, offY)` to center it within the SVG. The inverse, given an event
 * coordinate already expressed relative to the SVG's top-left, is:
 *   layoutX = (pixelX - offX) / s
 *   layoutY = (pixelY - offY) / s
 */
export function layoutFromMinimapPixel(
  pixelX: number,
  pixelY: number,
  offX: number,
  offY: number,
  s: number,
): Point {
  return { x: (pixelX - offX) / s, y: (pixelY - offY) / s };
}

/**
 * Compute the camera's current visible rectangle in layout coordinates,
 * derived from the camera transform and the canvas viewport size.
 */
export function viewportRectInLayout(transform: Transform, viewport: { width: number; height: number }): Rect {
  return {
    x: -transform.x / transform.k,
    y: -transform.y / transform.k,
    width: viewport.width / transform.k,
    height: viewport.height / transform.k,
  };
}

/**
 * Inclusive boundary test: a point sitting exactly on the rect's edge is
 * considered inside. Avoids "dead" pixel rows along the rect's outline.
 */
export function isPointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}
