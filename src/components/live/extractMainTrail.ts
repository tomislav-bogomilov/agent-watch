import type { Milestone } from '../../parse/types';

/**
 * DFS the main agent's trail, excluding the inner content of any sub-agent.
 *
 * Per the existing convention in `src/App.tsx` (`collectSubagentIds`) and
 * `src/parse/subagents.ts:attachSubagents`, a `subagent_spawn` milestone has:
 *   - children[0]  → the sub-agent's inner root (skip this whole subtree)
 *   - children[1+] → the main agent's continuation
 *
 * The `subagent_spawn` itself stays in the main trail as a single node.
 */
export function extractMainTrail(root: Milestone): Milestone[] {
  const out: Milestone[] = [];
  function walk(node: Milestone): void {
    out.push(node);
    if (node.kind === 'subagent_spawn') {
      for (let i = 1; i < node.children.length; i++) walk(node.children[i]);
    } else {
      for (const c of node.children) walk(c);
    }
  }
  walk(root);
  return out;
}
