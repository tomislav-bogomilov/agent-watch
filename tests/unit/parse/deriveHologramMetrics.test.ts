import { describe, it, expect } from 'vitest';
import { deriveHologramMetrics } from '../../../src/parse/deriveHologramMetrics';
import type { Milestone, Session } from '../../../src/parse/types';

function ms(over: Partial<Milestone>): Milestone {
  return {
    id: 'm', kind: 'assistant_turn', label: '', summary: '',
    timestamp: '2026-01-01T00:00:00Z', failed: false,
    raw: {}, children: [], ...over,
  } as Milestone;
}

function sessionWith(root: Milestone): Session {
  return {
    id: 's', cwd: '/x', startedAt: root.timestamp, root,
    successPath: new Set(), totalMilestones: 1, subagentMtimes: {},
  };
}

describe('deriveHologramMetrics', () => {
  it('returns nulls when usage and timestamps are missing', () => {
    const cur = ms({ timestamp: '' });
    const out = deriveHologramMetrics(cur, null, sessionWith(cur));
    expect(out.latencyMs).toBeNull();
    expect(out.idleGapMs).toBeNull();
    expect(out.tokens).toBeNull();
    expect(out.cacheEfficiency).toBeNull();
    expect(out.contextSize).toBeNull();
    expect(out.contextDeltaSincePrev).toBeNull();
  });

  it('computes idleGapMs from timestamps when prev exists', () => {
    const prev = ms({ id: 'p', timestamp: '2026-01-01T00:00:00Z' });
    const cur  = ms({ id: 'c', timestamp: '2026-01-01T00:00:04Z' });
    const out = deriveHologramMetrics(cur, prev, sessionWith(cur));
    expect(out.idleGapMs).toBe(4000);
  });

  it('computes contextDeltaSincePrev from contextSize when both have it', () => {
    const prev = ms({ id: 'p', contextSize: 60000 });
    const cur  = ms({ id: 'c', contextSize: 64200 });
    const out = deriveHologramMetrics(cur, prev, sessionWith(cur));
    expect(out.contextDeltaSincePrev).toBe(4200);
  });

  it('computes cacheEfficiency = cacheRead / (cacheRead + input + cacheCreation)', () => {
    const cur = ms({
      usage: { input: 3000, cacheRead: 58000, cacheCreation: 2000, output: 1000 },
    });
    const out = deriveHologramMetrics(cur, null, sessionWith(cur));
    expect(out.cacheEfficiency).toBeCloseTo(58000 / 63000, 4);
    expect(out.cacheReads).toBe(58000);
    expect(out.cacheMisses).toBe(5000);
  });

  it('returns tokens object intact from milestone.usage', () => {
    const cur = ms({ usage: { input: 1, cacheRead: 2, cacheCreation: 3, output: 4 } });
    const out = deriveHologramMetrics(cur, null, sessionWith(cur));
    expect(out.tokens).toEqual({ input: 1, cacheRead: 2, cacheCreation: 3, output: 4 });
  });

  it('computes latencyMedianMs from all assistant_turn milestones in the session', () => {
    const root = ms({
      id: 'root', kind: 'root_prompt', timestamp: '2026-01-01T00:00:00Z',
      children: [
        ms({
          id: 't1', kind: 'assistant_turn', timestamp: '2026-01-01T00:00:02Z',
          children: [
            ms({
              id: 't2', kind: 'assistant_turn', timestamp: '2026-01-01T00:00:05Z',
              children: [
                ms({ id: 't3', kind: 'assistant_turn', timestamp: '2026-01-01T00:00:10Z' }),
              ],
            }),
          ],
        }),
      ],
    });
    const cur = root.children[0];
    const out = deriveHologramMetrics(cur, root, sessionWith(root));
    expect(out.latencyMedianMs).toBe(3000);
    expect(out.latencyMs).toBe(2000);
  });
});
