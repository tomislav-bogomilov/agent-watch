import { describe, it, expect } from 'vitest';
import type { PriceTable, TokenUsageRow } from '../../../src/api/client';
import {
  normalizeModelId, priceFor, costOfRow, costSummary, costByMonth,
  modelKeysByCost, formatUsd,
} from '../../../src/tokens/cost';

const BUNDLED: PriceTable = {
  currency: 'USD', source: 'test',
  perMTok: {
    'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
    'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2 },
  },
};

const MAY_SNAPSHOT: PriceTable = {
  month: '2026-05', currency: 'USD', source: 'test-snapshot',
  perMTok: {
    'claude-opus-4-8': { input: 4, output: 20, cacheRead: 0.4, cacheWrite5m: 5, cacheWrite1h: 8 },
  },
};

function row(over: Partial<TokenUsageRow>): TokenUsageRow {
  return {
    projectId: 'P', modelId: 'claude-opus-4-8', isSubagent: false, day: '2026-06-01',
    input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0,
    ...over,
  };
}

describe('normalizeModelId', () => {
  it('strips a trailing -YYYYMMDD date suffix', () => {
    expect(normalizeModelId('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5');
  });
  it('leaves plain ids untouched', () => {
    expect(normalizeModelId('claude-opus-4-8')).toBe('claude-opus-4-8');
    expect(normalizeModelId('claude-fake')).toBe('claude-fake');
  });
});

describe('priceFor', () => {
  it('prefers the month snapshot', () => {
    expect(priceFor('claude-opus-4-8', '2026-05', { '2026-05': MAY_SNAPSHOT }, BUNDLED)!.input).toBe(4);
  });
  it('falls back to bundled when the month has no snapshot', () => {
    expect(priceFor('claude-opus-4-8', '2026-01', { '2026-05': MAY_SNAPSHOT }, BUNDLED)!.input).toBe(5);
  });
  it('falls back per-model when the snapshot lacks the model', () => {
    expect(priceFor('claude-haiku-4-5-20251001', '2026-05', { '2026-05': MAY_SNAPSHOT }, BUNDLED)!.input).toBe(1);
  });
  it('returns null for unknown models', () => {
    expect(priceFor('claude-fake', '2026-05', {}, BUNDLED)).toBeNull();
  });
  it('treats snapshot entries with missing/non-finite fields as a miss (bundled fallback)', () => {
    const partial: PriceTable = {
      month: '2026-05', currency: 'USD', source: 'hand-edit',
      perMTok: { 'claude-opus-4-8': { input: 4, output: 20 } as never },
    };
    expect(priceFor('claude-opus-4-8', '2026-05', { '2026-05': partial }, BUNDLED)!.input).toBe(5);
  });
});

describe('costOfRow', () => {
  it('applies all five token fields at their own prices', () => {
    const c = costOfRow(row({
      input: 1_000_000, output: 200_000, cacheRead: 10_000_000,
      cacheWrite5m: 1_000_000, cacheWrite1h: 500_000,
    }), {}, BUNDLED)!;
    expect(c.input).toBeCloseTo(5, 10);        // 1M x $5/M
    expect(c.output).toBeCloseTo(5, 10);       // 0.2M x $25/M
    expect(c.cacheRead).toBeCloseTo(5, 10);    // 10M x $0.5/M
    expect(c.cacheWrite).toBeCloseTo(11.25, 10); // 1M x $6.25/M + 0.5M x $10/M
    expect(c.total).toBeCloseTo(26.25, 10);
  });
  it('prices by the row month', () => {
    const c = costOfRow(row({ day: '2026-05-10', input: 1_000_000 }), { '2026-05': MAY_SNAPSHOT }, BUNDLED)!;
    expect(c.input).toBeCloseTo(4, 10);
  });
  it('returns null for unpriced models', () => {
    expect(costOfRow(row({ modelId: 'claude-fake', input: 5 }), {}, BUNDLED)).toBeNull();
  });
  it('returns null when token fields are non-finite (hand-edited history)', () => {
    expect(costOfRow(row({ input: Number.NaN, output: 5 }), {}, BUNDLED)).toBeNull();
  });
});

describe('costSummary', () => {
  it('totals priced rows by modelKey and accumulates unpriced tokens separately', () => {
    const rows = [
      row({ input: 1_000_000 }),
      row({ isSubagent: true, output: 200_000 }),
      row({ modelId: 'claude-fake', input: 7, output: 3, cacheRead: 5, cacheWrite5m: 2, cacheWrite1h: 1 }),
    ];
    const s = costSummary(rows, {}, BUNDLED);
    expect(s.total.total).toBeCloseTo(10, 10); // $5 input + $5 output
    expect(s.byModel.get('claude-opus-4-8')!.total).toBeCloseTo(5, 10);
    expect(s.byModel.get('claude-opus-4-8|sub')!.total).toBeCloseTo(5, 10);
    expect(s.unpricedTokens).toBe(18);
    expect(s.unpricedModels).toEqual(['claude-fake']);
  });
  it('keeps all aggregates finite when a row carries non-finite tokens', () => {
    const rows = [
      row({ input: 1_000_000 }),
      row({ day: '2026-06-02', input: Number.NaN }),
    ];
    const s = costSummary(rows, {}, BUNDLED);
    expect(Number.isFinite(s.total.total)).toBe(true);
    expect(s.total.total).toBeCloseTo(5, 10);
    expect(Number.isFinite(s.unpricedTokens)).toBe(true);
    expect(s.unpricedModels).toEqual(['claude-opus-4-8']);
  });
});

describe('costByMonth', () => {
  it('groups by month ascending with per-model splits', () => {
    const rows = [
      row({ day: '2026-06-02', input: 1_000_000 }),
      row({ day: '2026-05-10', output: 200_000 }),
      row({ day: '2026-05-20', modelId: 'claude-haiku-4-5-20251001', output: 1_000_000 }),
    ];
    const months = costByMonth(rows, {}, BUNDLED);
    expect(months.map((m) => m.month)).toEqual(['2026-05', '2026-06']);
    expect(months[0].total.total).toBeCloseTo(10, 10); // $5 opus output + $5 haiku output
    expect(months[0].byModel.get('claude-haiku-4-5-20251001')!.total).toBeCloseTo(5, 10);
    expect(months[1].total.total).toBeCloseTo(5, 10);
  });
});

describe('modelKeysByCost', () => {
  it('sorts keys by all-time cost descending', () => {
    const rows = [
      row({ day: '2026-05-10', input: 1_000_000 }),                                  // opus $5
      row({ day: '2026-06-10', modelId: 'claude-haiku-4-5', output: 10_000_000 }),    // haiku $50
    ];
    expect(modelKeysByCost(costByMonth(rows, {}, BUNDLED))).toEqual(['claude-haiku-4-5', 'claude-opus-4-8']);
  });
});

describe('formatUsd', () => {
  it('formats two decimals', () => {
    expect(formatUsd(26.25)).toBe('$26.25');
    expect(formatUsd(0)).toBe('$0.00');
  });
  it('floors tiny non-zero values to <$0.01', () => {
    expect(formatUsd(0.004)).toBe('<$0.01');
    expect(formatUsd(0.005)).toBe('$0.01');
  });
});
