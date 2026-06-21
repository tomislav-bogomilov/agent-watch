import type { NarrativeBlock } from './types';

export interface BlockDiff { added: Set<string>; changed: Set<string> }

export function diffBlocks(prev: NarrativeBlock[], next: NarrativeBlock[]): BlockDiff {
  const prevById = new Map(prev.map((b) => [b.id, b]));
  const added = new Set<string>();
  const changed = new Set<string>();
  for (const b of next) {
    const old = prevById.get(b.id);
    if (!old) { added.add(b.id); continue; }
    if (old.title !== b.title || old.summary !== b.summary || old.status !== b.status) changed.add(b.id);
  }
  return { added, changed };
}
