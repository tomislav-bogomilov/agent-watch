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

  const roots = childrenByParent.get(null) ?? [];
  if (roots.length === 0) return [];
  const root = roots[0];

  const chain: RawEvent[] = [];
  const visited = new Set<string>();
  function walk(node: RawEvent): void {
    if (visited.has(node.uuid)) return;
    visited.add(node.uuid);
    chain.push(node);
    const kids = childrenByParent.get(node.uuid) ?? [];
    for (const k of kids) walk(k);
  }
  walk(root);
  return chain;
}
