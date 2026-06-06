import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpendBars } from '../../../src/tokens/SpendBars';
import type { PriceTable, TokenUsageRow } from '../../../src/api/client';

const BUNDLED: PriceTable = {
  currency: 'USD', source: 'test',
  perMTok: {
    'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
    'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 },
  },
};

function row(over: Partial<TokenUsageRow>): TokenUsageRow {
  return {
    projectId: 'P', modelId: 'claude-opus-4-8', isSubagent: false, day: '2026-06-01',
    input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0,
    ...over,
  };
}

const ROWS: TokenUsageRow[] = [
  row({ day: '2026-05-10', input: 1_000_000 }),                              // opus may  $5
  row({ day: '2026-06-02', output: 200_000 }),                               // opus june $5
  row({ day: '2026-06-03', modelId: 'claude-sonnet-4-6', input: 1_000_000 }), // sonnet june $3
];

describe('SpendBars', () => {
  it('renders the summary chip strip', () => {
    render(<SpendBars rows={ROWS} prices={{}} bundled={BUNDLED} />);
    expect(screen.getByTestId('spend-chip-total').textContent).toContain('$13.00');
    expect(screen.getByTestId('spend-chip-input').textContent).toContain('$8.00');
    expect(screen.getByTestId('spend-chip-output').textContent).toContain('$5.00');
    expect(screen.getByTestId('spend-chip-cacheread').textContent).toContain('$0.00');
    expect(screen.getByTestId('spend-chip-cachewrite').textContent).toContain('$0.00');
  });

  it('renders one stacked bar segment per priced model-month', () => {
    const { container } = render(<SpendBars rows={ROWS} prices={{}} bundled={BUNDLED} />);
    // 2026-05: opus only; 2026-06: opus + sonnet = 3 segments
    expect(container.querySelectorAll('[data-role="spend-bar"]')).toHaveLength(3);
  });

  it('renders the ledger newest-month-first and expands per-model detail on click', () => {
    render(<SpendBars rows={ROWS} prices={{}} bundled={BUNDLED} />);
    const months = screen.getAllByTestId(/^spend-month-row-/);
    expect(months[0].getAttribute('data-testid')).toBe('spend-month-row-2026-06');
    expect(screen.queryByTestId('spend-month-detail-2026-06-claude-opus-4-8')).toBeNull();
    fireEvent.click(screen.getByTestId('spend-month-row-2026-06'));
    expect(screen.getByTestId('spend-month-detail-2026-06-claude-opus-4-8')).toBeTruthy();
    expect(screen.getByTestId('spend-month-detail-2026-06-claude-sonnet-4-6')).toBeTruthy();
  });

  it('shows an empty state when nothing is priced', () => {
    render(<SpendBars rows={[row({ modelId: 'claude-fake', input: 5 })]} prices={{}} bundled={BUNDLED} />);
    expect(screen.getByText('NO PRICED USAGE IN RANGE')).toBeTruthy();
  });

  it('labels each bar segment with a month/model/$ tooltip', () => {
    const { container } = render(<SpendBars rows={ROWS} prices={{}} bundled={BUNDLED} />);
    const titles = Array.from(container.querySelectorAll('[data-role="spend-bar"] title')).map((t) => t.textContent);
    expect(titles).toContain('2026-05 · Opus 4.8: $5.00');
    expect(titles).toContain('2026-06 · Sonnet 4.6: $3.00');
  });
});
