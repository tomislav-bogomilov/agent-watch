import type { Milestone, Session } from './types';

function collectAllIds(node: Milestone, into: Set<string>): void {
  into.add(node.id);
  for (const c of node.children) collectAllIds(c, into);
}

export function sliceSession(session: Session, promptId: string): Session | null {
  // Walk the primary children[0] chain from the root looking for the prompt.
  let cursor: Milestone | null = session.root;
  while (cursor && cursor.id !== promptId) {
    cursor = cursor.children[0] ?? null;
  }
  if (!cursor) return null;

  // Collect the slice: from `cursor` forward, stop BEFORE the next user_followup.
  const slice: Milestone[] = [];
  let walker: Milestone | null = cursor;
  while (walker) {
    if (walker !== cursor && walker.kind === 'user_followup') break;
    slice.push(walker);
    walker = walker.children[0] ?? null;
  }

  // Rebuild as a fresh chain. Clone each node shallowly; rewrite children[0]
  // to point at the next slice node. Preserve children[1] (subagent branch)
  // by reference when present.
  const rebuilt: Milestone[] = slice.map((node) => ({ ...node, children: [...node.children] }));
  for (let i = 0; i < rebuilt.length; i++) {
    const original = slice[i];
    const next = rebuilt[i + 1];
    if (next) {
      // Replace the primary child with the rebuilt next node; keep subagent
      // branch (children[1]) by reference if present on the original.
      const secondary = original.children[1];
      rebuilt[i].children = secondary ? [next, secondary] : [next];
    } else {
      // Last node in the slice has no successor — drop the primary child
      // (it pointed at user_followup or beyond), keep subagent branch only.
      const secondary = original.children[1];
      rebuilt[i].children = secondary ? [secondary] : [];
    }
  }

  // Derive stats. totalMilestones counts the slice chain plus any subagent
  // descendants attached via children[1]. successPath is the intersection
  // of the original with all ids reachable from the rebuilt root.
  const allIds = new Set<string>();
  collectAllIds(rebuilt[0], allIds);

  const successPath = new Set<string>();
  for (const id of session.successPath) {
    if (allIds.has(id)) successPath.add(id);
  }

  return {
    id: session.id,
    cwd: session.cwd,
    startedAt: session.startedAt,
    root: rebuilt[0],
    successPath,
    totalMilestones: allIds.size,
  };
}
