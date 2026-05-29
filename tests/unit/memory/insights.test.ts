// tests/unit/memory/insights.test.ts
import { describe, it, expect } from 'vitest';
import { deriveInsights, STALE_DAYS } from '../../../src/memory/insights';
import type { MemoryRecord } from '../../../src/api/client';

function rec(p: Partial<MemoryRecord> & { name: string }): MemoryRecord {
  return {
    scopeKey: 'C--demo', scope: { kind: 'project', projectId: 'C--demo', cwd: 'C:/demo' },
    name: p.name, description: p.description ?? '', type: p.type ?? 'project',
    originSessionId: p.originSessionId ?? null, links: p.links ?? [], body: p.body ?? '',
    mtimeMs: p.mtimeMs ?? Date.now(), inIndex: p.inIndex ?? true, parseError: p.parseError,
  };
}

describe('deriveInsights', () => {
  const now = Date.parse('2026-05-29T00:00:00Z');
  it('computes backlinks, orphans, broken links, composition, staleness', () => {
    const memories = [
      rec({ name: 'a', links: ['b', 'ghost'], type: 'feedback' }),
      rec({ name: 'b', links: [], type: 'project' }),
      rec({ name: 'lonely', links: [], type: 'reference', inIndex: false,
        mtimeMs: now - (STALE_DAYS + 5) * 86400_000 }),
    ];
    const ins = deriveInsights(memories, now);
    expect(ins.backlinks.get('b')).toEqual(['a']);
    expect(ins.orphans.map((m) => m.name)).toContain('lonely');
    expect(ins.orphans.map((m) => m.name)).not.toContain('a');
    expect(ins.brokenLinks).toEqual([{ from: 'a', to: 'ghost' }]);
    expect(ins.composition.byType.feedback).toBe(1);
    expect(ins.stale.map((m) => m.name)).toEqual(['lonely']);
    expect(ins.missingFromIndex.map((m) => m.name)).toEqual(['lonely']);
  });
});
