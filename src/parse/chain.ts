import type { RawEvent } from './types';

export function buildChain(events: RawEvent[]): RawEvent[] {
  if (events.length === 0) return [];

  const byUuid = new Map<string, RawEvent>();
  for (const ev of events) byUuid.set(ev.uuid, ev);

  const childrenByParent = new Map<string | null, RawEvent[]>();
  for (const ev of events) {
    const parent = ev.parentUuid && byUuid.has(ev.parentUuid) ? ev.parentUuid : null;
    const list = childrenByParent.get(parent) ?? [];
    list.push(ev);
    childrenByParent.set(parent, list);
  }

  const chain: RawEvent[] = [];
  const visited = new Set<string>();
  function walk(node: RawEvent): void {
    if (visited.has(node.uuid)) return;
    visited.add(node.uuid);
    chain.push(node);
    const kids = childrenByParent.get(node.uuid) ?? [];
    for (const k of kids) walk(k);
  }

  // Walk roots first in source order to preserve parent→child ordering.
  const roots = childrenByParent.get(null) ?? [];
  for (const r of roots) walk(r);
  // Then sweep anything still unvisited (real-world JSONLs may have
  // disconnected components after noise filtering — without this sweep
  // we'd lose them).
  for (const ev of events) walk(ev);
  return chain;
}
