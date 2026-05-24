import type { Milestone } from '../../parse/types';

/**
 * Build the root milestone for a sub-agent pane: the spawn node itself, with
 * its children replaced by [sub-agent-inner-root]. The spawn's children[1+]
 * (the main agent's continuation) is dropped here — that lives in MAIN.
 *
 * Returns null when the spawn has no inner subtree attached yet (partial
 * mid-write parse) so the caller can skip rendering the pane until the next
 * refetch.
 */
export function extractSubagentPaneRoot(spawn: Milestone): Milestone | null {
  if (spawn.kind !== 'subagent_spawn') return null;
  const inner = spawn.children[0];
  if (!inner) return null;
  return { ...spawn, children: [inner] };
}
