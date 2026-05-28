import type { LaidOutNode } from './layout';

export type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

const NODE_W = 116;
const NODE_H = 32;
const OBSTACLE_MARGIN = 8;
const DISTANCES = [24, 48, 96, 192];
const DIRECTIONS: Array<'NE' | 'NW' | 'SE' | 'SW' | 'E' | 'W' | 'N' | 'S'> =
  ['NE', 'NW', 'SE', 'SW', 'E', 'W', 'N', 'S'];

function nodeBBox(n: LaidOutNode): Rect {
  return {
    x: n.x - NODE_W / 2 - OBSTACLE_MARGIN,
    y: n.y - NODE_H / 2 - OBSTACLE_MARGIN,
    w: NODE_W + 2 * OBSTACLE_MARGIN,
    h: NODE_H + 2 * OBSTACLE_MARGIN,
  };
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function intersectionArea(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function rectInside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h;
}

function slotFor(
  selected: LaidOutNode,
  dir: typeof DIRECTIONS[number],
  d: number,
  panel: { w: number; h: number },
): Rect {
  const sx = selected.x;
  const sy = selected.y;
  const hw = NODE_W / 2;
  const hh = NODE_H / 2;
  switch (dir) {
    case 'NE': return { x: sx + hw + d, y: sy - hh - d - panel.h, w: panel.w, h: panel.h };
    case 'NW': return { x: sx - hw - d - panel.w, y: sy - hh - d - panel.h, w: panel.w, h: panel.h };
    case 'SE': return { x: sx + hw + d, y: sy + hh + d, w: panel.w, h: panel.h };
    case 'SW': return { x: sx - hw - d - panel.w, y: sy + hh + d, w: panel.w, h: panel.h };
    case 'E':  return { x: sx + hw + d, y: sy - panel.h / 2, w: panel.w, h: panel.h };
    case 'W':  return { x: sx - hw - d - panel.w, y: sy - panel.h / 2, w: panel.w, h: panel.h };
    case 'N':  return { x: sx - panel.w / 2, y: sy - hh - d - panel.h, w: panel.w, h: panel.h };
    case 'S':  return { x: sx - panel.w / 2, y: sy + hh + d, w: panel.w, h: panel.h };
  }
}

function segmentHitsRect(p1: Point, p2: Point, r: Rect): boolean {
  if (p1.y === p2.y) {
    if (p1.y <= r.y || p1.y >= r.y + r.h) return false;
    const lo = Math.min(p1.x, p2.x);
    const hi = Math.max(p1.x, p2.x);
    return !(hi <= r.x || lo >= r.x + r.w);
  }
  if (p1.x === p2.x) {
    if (p1.x <= r.x || p1.x >= r.x + r.w) return false;
    const lo = Math.min(p1.y, p2.y);
    const hi = Math.max(p1.y, p2.y);
    return !(hi <= r.y || lo >= r.y + r.h);
  }
  return false;
}

function pathHitsObstacle(points: Point[], obstacles: Rect[]): boolean {
  for (let i = 0; i + 1 < points.length; i++) {
    for (const o of obstacles) {
      if (segmentHitsRect(points[i], points[i + 1], o)) return true;
    }
  }
  return false;
}

function toPathD(points: Point[]): string {
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) d += ` L ${points[i].x},${points[i].y}`;
  return d;
}

function buildConnectorPath(selected: LaidOutNode, panelRect: Rect, obstacles: Rect[]): string {
  const cx = selected.x;
  const cy = selected.y;
  const nodeEdges: Record<'L' | 'R' | 'T' | 'B', Point> = {
    L: { x: cx - NODE_W / 2, y: cy },
    R: { x: cx + NODE_W / 2, y: cy },
    T: { x: cx, y: cy - NODE_H / 2 },
    B: { x: cx, y: cy + NODE_H / 2 },
  };
  const panelEdges: Record<'L' | 'R' | 'T' | 'B', Point> = {
    L: { x: panelRect.x,                  y: panelRect.y + panelRect.h / 2 },
    R: { x: panelRect.x + panelRect.w,    y: panelRect.y + panelRect.h / 2 },
    T: { x: panelRect.x + panelRect.w / 2, y: panelRect.y                  },
    B: { x: panelRect.x + panelRect.w / 2, y: panelRect.y + panelRect.h    },
  };

  // Pair each node edge with the panel edge that gives the most natural
  // route (exit direction matches the relative position of the panel).
  const panelIsRight  = panelRect.x       >  cx + NODE_W / 2;
  const panelIsLeft   = panelRect.x + panelRect.w < cx - NODE_W / 2;
  const panelIsBelow  = panelRect.y       >  cy + NODE_H / 2;
  const panelIsAbove  = panelRect.y + panelRect.h < cy - NODE_H / 2;

  // Build candidate (nodeStart, panelEnter, bendFirstAxis) tuples in priority
  // order — natural exits first, then fallbacks.
  const candidates: Array<{ start: Point; enter: Point; horizontalFirst: boolean }> = [];
  const push = (start: Point, enter: Point, horizontalFirst: boolean) =>
    candidates.push({ start, enter, horizontalFirst });

  if (panelIsRight)  { push(nodeEdges.R, panelEdges.L, true);  push(nodeEdges.R, panelEdges.T, true);  push(nodeEdges.R, panelEdges.B, true);  }
  if (panelIsLeft)   { push(nodeEdges.L, panelEdges.R, true);  push(nodeEdges.L, panelEdges.T, true);  push(nodeEdges.L, panelEdges.B, true);  }
  if (panelIsBelow)  { push(nodeEdges.B, panelEdges.T, false); push(nodeEdges.B, panelEdges.L, false); push(nodeEdges.B, panelEdges.R, false); }
  if (panelIsAbove)  { push(nodeEdges.T, panelEdges.B, false); push(nodeEdges.T, panelEdges.L, false); push(nodeEdges.T, panelEdges.R, false); }
  // Catch-all (diagonal where neither side wholly clears): every node edge × every panel edge.
  for (const ne of ['L', 'R', 'T', 'B'] as const) {
    for (const pe of ['L', 'R', 'T', 'B'] as const) {
      push(nodeEdges[ne], panelEdges[pe], ne === 'L' || ne === 'R');
      push(nodeEdges[ne], panelEdges[pe], ne === 'T' || ne === 'B');
    }
  }

  function pointsFor(start: Point, enter: Point, horizontalFirst: boolean): Point[] {
    if (start.x === enter.x || start.y === enter.y) {
      return [start, enter];
    }
    const bend1 = horizontalFirst ? { x: enter.x, y: start.y } : { x: start.x, y: enter.y };
    return [start, bend1, enter];
  }

  for (const c of candidates) {
    const pts = pointsFor(c.start, c.enter, c.horizontalFirst);
    if (!pathHitsObstacle(pts, obstacles)) return toPathD(pts);
  }
  // Worst case: return the natural-direction path even if it crosses something.
  const first = candidates[0];
  return toPathD(pointsFor(first.start, first.enter, first.horizontalFirst));
}

export function layoutHologram(
  selected: LaidOutNode,
  obstacles: LaidOutNode[],
  visibleRect: Rect,
  panelSize: { w: number; h: number },
): { panelRect: Rect; connectorPath: string } {
  const obstacleRects = obstacles
    .filter((n) => n.id !== selected.id)
    .map(nodeBBox);

  for (const d of DISTANCES) {
    for (const dir of DIRECTIONS) {
      const slot = slotFor(selected, dir, d, panelSize);
      if (!rectInside(slot, visibleRect)) continue;
      if (obstacleRects.some((o) => rectsIntersect(slot, o))) continue;
      return { panelRect: slot, connectorPath: buildConnectorPath(selected, slot, obstacleRects) };
    }
  }

  let best: Rect | null = null;
  let bestScore = Infinity;
  for (const dir of DIRECTIONS) {
    const slot = slotFor(selected, dir, DISTANCES[0], panelSize);
    const overlap = obstacleRects.reduce((sum, o) => sum + intersectionArea(slot, o), 0);
    if (overlap < bestScore) { bestScore = overlap; best = slot; }
  }
  const fallback = best!;
  return { panelRect: fallback, connectorPath: buildConnectorPath(selected, fallback, obstacleRects) };
}
