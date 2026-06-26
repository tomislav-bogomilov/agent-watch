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

  it('TOTAL mode legend chips display token-type labels and distinct swatch colors', () => {
    render(chart('total'));

    // Verify token-type LABELS render on the chips
    expect(screen.getByTestId('legend-chip-input').textContent).toContain('Input');
    expect(screen.getByTestId('legend-chip-output').textContent).toContain('Output');
    expect(screen.getByTestId('legend-chip-cacheRead').textContent).toContain('Cache Read');
    expect(screen.getByTestId('legend-chip-cacheWrite').textContent).toContain('Cache Write');

    // Verify the four chip swatches have DISTINCT background colors
    const swatchColors = ['input', 'output', 'cacheRead', 'cacheWrite'].map((k) => {
      const chip = screen.getByTestId(`legend-chip-${k}`);
      const swatch = chip.querySelector('span[aria-hidden]');
      // In jsdom, inline style "background: color" is read via .style.background, not .style.backgroundColor
      return swatch?.style.background || '';
    });

    const uniqueColors = new Set(swatchColors.filter((c) => c.length > 0));
    expect(uniqueColors.size).toBe(4);
  });
});
