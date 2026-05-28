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

function buildConnectorPath(selected: LaidOutNode, panelRect: Rect): string {
  const cx = selected.x;
  const cy = selected.y;
  const edges = {
    left:   { mid: { x: panelRect.x, y: panelRect.y + panelRect.h / 2 },                side: 'L' as const },
    right:  { mid: { x: panelRect.x + panelRect.w, y: panelRect.y + panelRect.h / 2 },  side: 'R' as const },
    top:    { mid: { x: panelRect.x + panelRect.w / 2, y: panelRect.y },                side: 'T' as const },
    bottom: { mid: { x: panelRect.x + panelRect.w / 2, y: panelRect.y + panelRect.h },  side: 'B' as const },
  };
  let bestKey: keyof typeof edges = 'left';
  let bestDist = Infinity;
  for (const k of Object.keys(edges) as Array<keyof typeof edges>) {
    const m = edges[k].mid;
    const d = (m.x - cx) ** 2 + (m.y - cy) ** 2;
    if (d < bestDist) { bestDist = d; bestKey = k; }
  }
  const panelEnter = edges[bestKey].mid;
  const nodeEdges: Record<'L' | 'R' | 'T' | 'B', Point> = {
    L: { x: cx - NODE_W / 2, y: cy },
    R: { x: cx + NODE_W / 2, y: cy },
    T: { x: cx, y: cy - NODE_H / 2 },
    B: { x: cx, y: cy + NODE_H / 2 },
  };
  let nodeStart: Point = nodeEdges.R;
  let nodeBest = Infinity;
  for (const k of ['L','R','T','B'] as const) {
    const p = nodeEdges[k];
    const d = (p.x - panelEnter.x) ** 2 + (p.y - panelEnter.y) ** 2;
    if (d < nodeBest) { nodeBest = d; nodeStart = p; }
  }
  const midX = (nodeStart.x + panelEnter.x) / 2;
  const midY = (nodeStart.y + panelEnter.y) / 2;

  const horizontalFirst = nodeStart === nodeEdges.L || nodeStart === nodeEdges.R;
  const bend1: Point = horizontalFirst
    ? { x: midX, y: nodeStart.y }
    : { x: nodeStart.x, y: midY };
  const bend2: Point = horizontalFirst
    ? { x: midX, y: panelEnter.y }
    : { x: panelEnter.x, y: midY };

  if (nodeStart.x === panelEnter.x || nodeStart.y === panelEnter.y) {
    return `M ${nodeStart.x},${nodeStart.y} L ${panelEnter.x},${panelEnter.y}`;
  }
  return `M ${nodeStart.x},${nodeStart.y} L ${bend1.x},${bend1.y} L ${bend2.x},${bend2.y} L ${panelEnter.x},${panelEnter.y}`;
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
      return { panelRect: slot, connectorPath: buildConnectorPath(selected, slot) };
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
  return { panelRect: fallback, connectorPath: buildConnectorPath(selected, fallback) };
}
