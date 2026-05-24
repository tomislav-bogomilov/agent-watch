import { hierarchy, tree as d3tree } from 'd3';
import type { Milestone } from '../parse/types';

export type LaidOutNode = {
  id: string;
  milestone: Milestone;
  x: number;
  y: number;
  depth: number;
};

export type LaidOutEdge = {
  sourceId: string;
  targetId: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
};

export type LayoutResult = {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
};

const NODE_X_SPACING = 140;
const NODE_Y_SPACING = 110;
const LRU_CAP = 16;

// Reference cache: same root identity always hits.
const refCache = new WeakMap<Milestone, { fingerprint: string; result: LayoutResult }>();

// Fingerprint cache: bounded LRU keyed by structural hash. Map iteration order
// is insertion order; deleting and re-inserting moves an entry to the tail.
const fpCache = new Map<string, LayoutResult>();

function fingerprint(root: Milestone): string {
  const parts: string[] = [];
  function walk(n: Milestone, parentId: string): void {
    parts.push(`${n.id}|${n.kind}|${parentId}|${n.children.length}`);
    for (const c of n.children) walk(c, n.id);
  }
  walk(root, '');
  return parts.join(';');
}

function rememberFp(fp: string, result: LayoutResult): void {
  if (fpCache.has(fp)) fpCache.delete(fp); // move to tail
  fpCache.set(fp, result);
  while (fpCache.size > LRU_CAP) {
    const oldestKey = fpCache.keys().next().value;
    if (oldestKey === undefined) break;
    fpCache.delete(oldestKey);
  }
}

function computeLayout(root: Milestone): LayoutResult {
  const h = hierarchy<Milestone>(root, (d) => d.children);
  const layout = d3tree<Milestone>().nodeSize([NODE_X_SPACING, NODE_Y_SPACING]);
  const laid = layout(h);

  const nodes: LaidOutNode[] = [];
  const edges: LaidOutEdge[] = [];
  let minX = Infinity, maxX = -Infinity, maxY = -Infinity;

  laid.each((d) => {
    nodes.push({ id: d.data.id, milestone: d.data, x: d.x, y: d.y, depth: d.depth });
    if (d.x < minX) minX = d.x;
    if (d.x > maxX) maxX = d.x;
    if (d.y > maxY) maxY = d.y;
  });

  laid.eachBefore((d) => {
    if (!d.parent) return;
    edges.push({
      sourceId: d.parent.data.id,
      targetId: d.data.id,
      sourceX: d.parent.x,
      sourceY: d.parent.y,
      targetX: d.x,
      targetY: d.y,
    });
  });

  const xShift = -minX + 60;
  for (const n of nodes) n.x += xShift;
  for (const e of edges) {
    e.sourceX += xShift;
    e.targetX += xShift;
  }

  return {
    nodes,
    edges,
    width: (maxX - minX) + 120,
    height: maxY + 120,
  };
}

export function layoutTree(root: Milestone): LayoutResult {
  // 1. Reference cache hit?
  const ref = refCache.get(root);
  if (ref) return ref.result;

  // 2. Fingerprint match?
  const fp = fingerprint(root);
  const cached = fpCache.get(fp);
  if (cached) {
    refCache.set(root, { fingerprint: fp, result: cached });
    rememberFp(fp, cached); // bump to tail
    return cached;
  }

  // 3. Miss — compute, cache, return.
  const result = computeLayout(root);
  refCache.set(root, { fingerprint: fp, result });
  rememberFp(fp, result);
  return result;
}

/** Test-only escape hatch. Do not call from production code. */
export function _resetLayoutCacheForTests(): void {
  fpCache.clear();
  // WeakMap can't be iterated; rely on tests building fresh roots.
}
