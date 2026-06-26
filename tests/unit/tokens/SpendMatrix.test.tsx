import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpendMatrix } from '../../../src/tokens/SpendMatrix';
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
  row({ day: '2026-05-10', input: 1_000_000 }),                               // opus may  $5
  row({ day: '2026-06-02', output: 200_000 }),                                // opus june $5
  row({ day: '2026-06-03', modelId: 'claude-sonnet-4-6', input: 1_000_000 }),  // sonnet june $3
];

describe('SpendMatrix', () => {
  it('renders stat cards with breakdown sub-lines', () => {
    render(<SpendMatrix rows={ROWS} prices={{}} bundled={BUNDLED} todayMonth="2026-06" />);
    expect(screen.getByTestId('spend-card-alltime').textContent).toContain('$13.00');
    expect(screen.getByTestId('spend-card-thismonth').textContent).toContain('$8.00');
    expect(screen.getByTestId('spend-card-avg').textContent).toContain('$6.50'); // 13 / 2 months
    expect(screen.getByTestId('spend-card-top').textContent).toContain('Opus 4.8');
  });

  it('renders a month x model grid with totals', () => {
    render(<SpendMatrix rows={ROWS} prices={{}} bundled={BUNDLED} todayMonth="2026-06" />);
    expect(screen.getByTestId('spend-cell-claude-opus-4-8-2026-05').textContent).toBe('$5.00');
    expect(screen.getByTestId('spend-cell-claude-opus-4-8-2026-06').textContent).toBe('$5.00');
    expect(screen.getByTestId('spend-cell-claude-sonnet-4-6-2026-05').textContent).toBe('—');
    expect(screen.getByTestId('spend-cell-claude-sonnet-4-6-2026-06').textContent).toBe('$3.00');
  });

  it('pins a breakdown line when a cell is clicked', () => {
    render(<SpendMatrix rows={ROWS} prices={{}} bundled={BUNDLED} todayMonth="2026-06" />);
    expect(screen.queryByTestId('spend-cell-pin')).toBeNull();
    fireEvent.click(screen.getByTestId('spend-cell-claude-opus-4-8-2026-06'));
    const pin = screen.getByTestId('spend-cell-pin');
    expect(pin.textContent).toContain('2026-06');
    expect(pin.textContent).toContain('out $5.00');
    // clicking again unpins
    fireEvent.click(screen.getByTestId('spend-cell-claude-opus-4-8-2026-06'));
    expect(screen.queryByTestId('spend-cell-pin')).toBeNull();
  });

  it('shows an empty state when nothing is priced', () => {
    render(<SpendMatrix rows={[]} prices={{}} bundled={BUNDLED} todayMonth="2026-06" />);
    expect(screen.getByText('NO PRICED USAGE IN RANGE')).toBeTruthy();
  });

  it('renders a glass mini-bar scaled to the cell value', () => {
    render(<SpendMatrix rows={ROWS} prices={{}} bundled={BUNDLED} todayMonth="2026-06" />);
    const cell = screen.getByTestId('spend-cell-claude-opus-4-8-2026-05'); // $5 — the max cell -> full width
    const bar = cell.querySelector('[data-role="matrix-bar"]') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.style.width).toBe('100%');
    // value text is still exactly the $ figure
    expect(cell.textContent).toBe('$5.00');
    // a smaller cell gets a narrower bar
    const small = screen.getByTestId('spend-cell-claude-sonnet-4-6-2026-06'); // $3 of max $5 = 60%
    const smallBar = small.querySelector('[data-role="matrix-bar"]') as HTMLElement;
    expect(smallBar.style.width).toBe('60%');
  });
});
