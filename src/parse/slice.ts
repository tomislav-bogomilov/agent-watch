import type { Milestone, Session } from './types';

function collectAllIds(node: Milestone, into: Set<string>): void {
  into.add(node.id);
  for (const c of node.children) collectAllIds(c, into);
}

// Per the convention established by `attachSubagents` and used throughout the
// app (see `extractMainTrail.ts`), at a `subagent_spawn` the sub-agent inner
// subtree lives at children[0] and the main continuation at children[1].
// Every other node carries its main next at children[0].
function mainNext(node: Milestone): Milestone | null {
  if (node.kind === 'subagent_spawn') return node.children[1] ?? null;
  return node.children[0] ?? null;
}

export function sliceSession(session: Session, promptId: string): Session | null {
  let cursor: Milestone | null = session.root;
  while (cursor && cursor.id !== promptId) {
    cursor = mainNext(cursor);
  }
  if (!cursor) return null;

  // Collect the slice along the main trail, stopping BEFORE the next
  // user_followup (which marks a new prompt boundary).
  const slice: Milestone[] = [];
  let walker: Milestone | null = cursor;
  while (walker) {
    if (walker !== cursor && walker.kind === 'user_followup') break;
    slice.push(walker);
    walker = mainNext(walker);
  }

  // Rebuild as a fresh chain. Clone each node shallowly so we can rewrite
  // children without mutating the source tree. At subagent_spawn nodes keep
  // children[0] (the sub-agent inner) by reference and place the rebuilt
  // next at children[1]; at other nodes the rebuilt next goes at children[0].
  const rebuilt: Milestone[] = slice.map((node) => ({ ...node, children: [...node.children] }));
  for (let i = 0; i < rebuilt.length; i++) {
    const original = slice[i];
    const next = rebuilt[i + 1] ?? null;
    if (original.kind === 'subagent_spawn') {
      const sub = original.children[0];
      if (sub && next) rebuilt[i].children = [sub, next];
      else if (sub) rebuilt[i].children = [sub];
      else if (next) rebuilt[i].children = [next];
      else rebuilt[i].children = [];
    } else {
      rebuilt[i].children = next ? [next] : [];
    }
  }

  // Derive stats. totalMilestones counts everything reachable from the rebuilt
  // root — main chain plus any preserved sub-agent subtrees. successPath is
  // the intersection of the original with the slice's reachable ids.
  const allIds = new Set<string>();
  collectAllIds(rebuilt[0], allIds);

  const successPath = new Set<string>();
  for (const id of session.successPath) {
    if (allIds.has(id)) successPath.add(id);
  }

  return {
    provider: session.provider,
    id: session.id,
    cwd: session.cwd,
    startedAt: session.startedAt,
    root: rebuilt[0],
    successPath,
    totalMilestones: allIds.size,
    subagentMtimes: session.subagentMtimes,
  };
}
