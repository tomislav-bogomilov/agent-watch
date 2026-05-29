// src/memory/insights.ts
import type { MemoryRecord, MemoryType } from '../api/client';

export const STALE_DAYS = 14;

export type Insights = {
  backlinks: Map<string, string[]>;
  orphans: MemoryRecord[];
  brokenLinks: { from: string; to: string }[];
  missingFromIndex: MemoryRecord[];
  parseErrors: MemoryRecord[];
  stale: MemoryRecord[];
  composition: { byType: Record<MemoryType, number>; byScope: Record<string, number>; total: number };
  provenance: { bySession: { sessionId: string; count: number }[] };
};

export function deriveInsights(memories: MemoryRecord[], now: number): Insights {
  const names = new Set(memories.map((m) => m.name));
  const backlinks = new Map<string, string[]>();
  const brokenLinks: { from: string; to: string }[] = [];

  for (const m of memories) {
    for (const target of m.links) {
      if (names.has(target)) {
        backlinks.set(target, [...(backlinks.get(target) ?? []), m.name]);
      } else {
        brokenLinks.push({ from: m.name, to: target });
      }
    }
  }

  const orphans = memories.filter((m) => m.links.length === 0 && (backlinks.get(m.name)?.length ?? 0) === 0);
  const missingFromIndex = memories.filter((m) => !m.inIndex);
  const parseErrors = memories.filter((m) => m.parseError);
  const staleCutoff = now - STALE_DAYS * 86400_000;
  const stale = memories.filter((m) => m.mtimeMs < staleCutoff).sort((a, b) => a.mtimeMs - b.mtimeMs);

  const byType: Record<MemoryType, number> = { user: 0, feedback: 0, project: 0, reference: 0 };
  const byScope: Record<string, number> = {};
  for (const m of memories) {
    if (m.type) byType[m.type] += 1;
    byScope[m.scopeKey] = (byScope[m.scopeKey] ?? 0) + 1;
  }

  const sessionCounts = new Map<string, number>();
  for (const m of memories) {
    if (m.originSessionId) sessionCounts.set(m.originSessionId, (sessionCounts.get(m.originSessionId) ?? 0) + 1);
  }
  const bySession = [...sessionCounts.entries()]
    .map(([sessionId, count]) => ({ sessionId, count }))
    .sort((a, b) => b.count - a.count);

  return {
    backlinks, orphans, brokenLinks, missingFromIndex, parseErrors, stale,
    composition: { byType, byScope, total: memories.length },
    provenance: { bySession },
  };
}
