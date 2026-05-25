import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DailyUsageChart } from '../../../src/tokens/DailyUsageChart';
import type { TokenUsageRow } from '../../../src/api/client';

const rows: TokenUsageRow[] = [
  { projectId: 'p1', modelId: 'opus', isSubagent: false, day: '2026-05-20', input: 100, output: 50, cached: 200 },
  { projectId: 'p1', modelId: 'opus', isSubagent: false, day: '2026-05-22', input: 10, output: 5, cached: 0 },
  { projectId: 'p1', modelId: 'sonnet', isSubagent: false, day: '2026-05-21', input: 7, output: 3, cached: 0 },
];

describe('DailyUsageChart', () => {
  it('renders one <rect> per (day, modelKey) for non-empty data', () => {
    render(
      <DailyUsageChart
        rows={rows}
        projectId="all"
        preset="all"
        today="2026-05-22"
        metric="total"
      />
    );
    // 3 days × 2 model keys = 6 stack rects (zero-height ones still rendered)
    const rects = document.querySelectorAll('svg [data-role="bar"]');
    expect(rects.length).toBe(6);
  });

  it('renders "NO USAGE IN RANGE" when no rows match the filter', () => {
    render(
      <DailyUsageChart
        rows={[]}
        projectId="all"
        preset="all"
        today="2026-05-22"
        metric="total"
      />
    );
    expect(screen.getByText(/NO USAGE IN RANGE/i)).toBeDefined();
  });
});
