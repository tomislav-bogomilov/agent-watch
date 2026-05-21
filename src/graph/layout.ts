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

export function layoutTree(root: Milestone): LayoutResult {
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

  // Normalize x so minX = 0
  const xShift = -minX + 60; // 60px left padding
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
