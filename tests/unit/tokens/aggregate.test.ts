import { describe, it, expect } from 'vitest';
import {
  presetCutoff,
  filterRows,
  densifyDays,
  modelKeysSorted,
  modelKey,
  stackData,
  summariesPerModel,
  cachedOf,
} from '../../../src/tokens/aggregate';
import type { TokenUsageRow } from '../../../src/api/client';

const rows: TokenUsageRow[] = [
  { projectId: 'p1', modelId: 'opus', isSubagent: false, day: '2026-05-20', input: 100, output: 50, cacheRead: 200, cacheWrite5m: 0, cacheWrite1h: 0 },
  { projectId: 'p1', modelId: 'opus', isSubagent: false, day: '2026-05-22', input: 10, output: 5, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
  { projectId: 'p2', modelId: 'sonnet', isSubagent: false, day: '2026-05-21', input: 7, output: 3, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
  { projectId: 'p1', modelId: 'opus', isSubagent: true, day: '2026-05-21', input: 2, output: 1, cacheRead: 10, cacheWrite5m: 0, cacheWrite1h: 0 },
];

describe('presetCutoff', () => {
  it('all → 0000-01-01', () => {
    expect(presetCutoff('all', '2026-05-25')).toBe('0000-01-01');
  });
  it('7d → today - 7 UTC days', () => {
    expect(presetCutoff('7d', '2026-05-25')).toBe('2026-05-18');
  });
  it('30d → today - 30 UTC days', () => {
    expect(presetCutoff('30d', '2026-05-25')).toBe('2026-04-25');
  });
  it('90d → today - 90 UTC days', () => {
    expect(presetCutoff('90d', '2026-05-25')).toBe('2026-02-24');
  });
});

describe('filterRows', () => {
  it('filters by projectId when not "all"', () => {
    const out = filterRows(rows, 'p1', '0000-01-01');
    expect(out).toHaveLength(3);
    expect(out.every((r) => r.projectId === 'p1')).toBe(true);
  });
  it('keeps all projects for "all"', () => {
    const out = filterRows(rows, 'all', '0000-01-01');
    expect(out).toHaveLength(4);
  });
  it('drops rows with day < cutoffDay', () => {
    const out = filterRows(rows, 'all', '2026-05-21');
    expect(out).toHaveLength(3); // 2026-05-20 row dropped
  });
});

describe('densifyDays', () => {
  it('returns a continuous day list with no gaps', () => {
    const days = densifyDays('2026-05-20', '2026-05-22');
    expect(days).toEqual(['2026-05-20', '2026-05-21', '2026-05-22']);
  });
  it('handles single-day ranges', () => {
    expect(densifyDays('2026-05-20', '2026-05-20')).toEqual(['2026-05-20']);
  });
  it('returns empty when from > to', () => {
    expect(densifyDays('2026-05-22', '2026-05-20')).toEqual([]);
  });
});

describe('modelKey + modelKeysSorted', () => {
  it('modelKey appends |sub for subagents', () => {
    expect(modelKey('opus', false)).toBe('opus');
    expect(modelKey('opus', true)).toBe('opus|sub');
  });
  it('sorts keys by total tokens descending', () => {
    // opus main total = 100+50+200 + 10+5+0 = 365
    // opus sub total  = 2+1+10 = 13
    // sonnet total    = 7+3+0 = 10
    const keys = modelKeysSorted(rows);
    expect(keys).toEqual(['opus', 'opus|sub', 'sonnet']);
  });
});

describe('stackData', () => {
  it('produces dense day rows with zeros for missing keys/days', () => {
    const days = ['2026-05-20', '2026-05-21', '2026-05-22'];
    const keys = ['opus', 'opus|sub', 'sonnet'];
    const out = stackData(rows, days, keys, 'total');
    expect(out).toHaveLength(3);
    // 2026-05-20: only opus has 100+50+200 = 350
    expect(out[0]).toEqual({ day: '2026-05-20', values: { opus: 350, 'opus|sub': 0, sonnet: 0 } });
    // 2026-05-21: opus|sub = 13, sonnet = 10
    expect(out[1]).toEqual({ day: '2026-05-21', values: { opus: 0, 'opus|sub': 13, sonnet: 10 } });
    // 2026-05-22: opus = 15
    expect(out[2]).toEqual({ day: '2026-05-22', values: { opus: 15, 'opus|sub': 0, sonnet: 0 } });
  });
  it('extracts individual metric buckets when metric != "total"', () => {
    const out = stackData(rows, ['2026-05-20'], ['opus'], 'cached');
    expect(out[0].values.opus).toBe(200);
  });
});

describe('summariesPerModel', () => {
  it('returns one entry per (modelId, isSubagent) sorted desc by total', () => {
    const out = summariesPerModel(rows);
    expect(out).toEqual([
      { modelId: 'opus', isSubagent: false, input: 110, output: 55, cached: 200, total: 365 },
      { modelId: 'opus', isSubagent: true,  input: 2,   output: 1,  cached: 10,  total: 13 },
      { modelId: 'sonnet', isSubagent: false, input: 7, output: 3,  cached: 0,   total: 10 },
    ]);
  });
});

describe('cachedOf', () => {
  it('sums cacheRead + cacheWrite5m + cacheWrite1h', () => {
    expect(cachedOf({
      projectId: 'p', modelId: 'm', isSubagent: false, day: '2026-06-01',
      input: 0, output: 0, cacheRead: 100, cacheWrite5m: 30, cacheWrite1h: 20,
    })).toBe(150);
  });
});
