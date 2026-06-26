import { describe, it, expect } from 'vitest';
import { stackDataByType } from '../../../src/tokens/aggregate';
import { TOKEN_TYPE_KEYS, tokenTypeLabel, tokenTypeColor } from '../../../src/tokens/tokenType';
import type { TokenUsageRow } from '../../../src/api/client';

function row(over: Partial<TokenUsageRow>): TokenUsageRow {
  return { projectId: 'P', modelId: 'opus', isSubagent: false, day: '2026-06-01',
    input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, ...over };
}

describe('stackDataByType', () => {
  it('sums each token type per day, folding cacheWrite5m+1h into cacheWrite', () => {
    const rows = [
      row({ day: '2026-06-01', input: 10, output: 5, cacheRead: 100, cacheWrite5m: 2, cacheWrite1h: 3 }),
      row({ day: '2026-06-01', input: 1, modelId: 'sonnet' }),
    ];
    const out = stackDataByType(rows, ['2026-06-01', '2026-06-02']);
    expect(out.map((d) => d.day)).toEqual(['2026-06-01', '2026-06-02']);
    expect(out[0].values).toEqual({ input: 11, output: 5, cacheRead: 100, cacheWrite: 5 });
    expect(out[1].values).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  it('exposes the four token-type keys with labels and colors', () => {
    expect([...TOKEN_TYPE_KEYS]).toEqual(['input', 'output', 'cacheRead', 'cacheWrite']);
    expect(tokenTypeLabel('cacheRead')).toBe('Cache Read');
    expect(tokenTypeColor('input')).toBe('#00E5FF');
    expect(tokenTypeColor('output')).toBe('#7FFFD4');
    expect(tokenTypeColor('cacheRead')).toBe('#B47FF6');
    expect(tokenTypeColor('cacheWrite')).toBe('#FF7A1A');
    expect(tokenTypeColor('nope')).toBe('#9CA3AF');
    expect(tokenTypeLabel('nope')).toBe('nope');
  });
});
