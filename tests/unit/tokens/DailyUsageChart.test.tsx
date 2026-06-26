import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DailyUsageChart } from '../../../src/tokens/DailyUsageChart';
import type { TokenUsageRow } from '../../../src/api/client';

const rows: TokenUsageRow[] = [
  { projectId: 'p1', modelId: 'opus', isSubagent: false, day: '2026-05-20', input: 100, output: 50, cacheRead: 200, cacheWrite5m: 0, cacheWrite1h: 0 },
  { projectId: 'p1', modelId: 'opus', isSubagent: false, day: '2026-05-22', input: 10, output: 5, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
  { projectId: 'p1', modelId: 'sonnet', isSubagent: false, day: '2026-05-21', input: 7, output: 3, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
];

function chart(metric: 'total' | 'input') {
  return (
    <DailyUsageChart rows={rows} projectId="all" preset="all" today="2026-05-22" metric={metric} family="all" />
  );
}

describe('DailyUsageChart', () => {
  it('TOTAL stacks by token type: 3 days x 4 types = 12 bars + token-type legend', () => {
    render(chart('total'));
    expect(document.querySelectorAll('svg [data-role="bar"]').length).toBe(12);
    expect(screen.getByTestId('legend-chip-input')).toBeTruthy();
    expect(screen.getByTestId('legend-chip-output')).toBeTruthy();
    expect(screen.getByTestId('legend-chip-cacheRead')).toBeTruthy();
    expect(screen.getByTestId('legend-chip-cacheWrite')).toBeTruthy();
  });

  it('non-total metrics still stack by model: 3 days x 2 models = 6 bars', () => {
    render(chart('input'));
    expect(document.querySelectorAll('svg [data-role="bar"]').length).toBe(6);
    expect(screen.getByTestId('legend-chip-opus')).toBeTruthy();
    expect(screen.getByTestId('legend-chip-sonnet')).toBeTruthy();
  });

  it('renders "NO USAGE IN RANGE" when no rows match the filter', () => {
    render(<DailyUsageChart rows={[]} projectId="all" preset="all" today="2026-05-22" metric="total" family="all" />);
    expect(screen.getByText(/NO USAGE IN RANGE/i)).toBeDefined();
  });
});
