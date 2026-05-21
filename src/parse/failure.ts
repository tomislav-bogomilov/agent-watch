import type { Milestone } from './types';

export function isTainted(node: Milestone): boolean {
  if (node.failed) return true;
  for (const c of node.children) {
    if (isTainted(c)) return true;
  }
  return false;
}

/**
 * Success path = root → final completion, skipping any tainted branch.
 * For a node with 2 children (subagent_spawn), prefer the non-tainted main
 * branch; if both are non-tainted (typical success case), include both.
 * For a node with 1 child, just follow.
 * If the node itself failed, contribute nothing.
 */
export function computeSuccessPath(root: Milestone): Set<string> {
  const path = new Set<string>();
  function walk(node: Milestone): void {
    if (node.failed) return;
    path.add(node.id);
    if (node.children.length === 0) return;
    if (node.children.length === 1) {
      if (!isTainted(node.children[0])) walk(node.children[0]);
      return;
    }
    // two children: [subagent_root, next_main]
    const [sub, next] = node.children;
    if (!isTainted(sub)) walk(sub);
    if (!isTainted(next)) walk(next);
  }
  walk(root);
  return path;
}

export function countMilestones(node: Milestone): number {
  let total = 1;
  for (const c of node.children) total += countMilestones(c);
  return total;
}
