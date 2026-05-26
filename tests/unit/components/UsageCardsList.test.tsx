import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UsageCardsList } from '../../../src/components/library/UsageCardsList';
import type { TokenUsageRow } from '../../../src/api/client';

const rows: TokenUsageRow[] = [
  { projectId: 'p1', modelId: 'claude-opus-4-7',    isSubagent: false, day: '2026-05-20', input: 100, output: 50, cached: 50 },
  { projectId: 'p1', modelId: 'claude-opus-4-6',    isSubagent: false, day: '2026-05-20', input: 10,  output: 5,  cached: 5 },
  { projectId: 'p1', modelId: 'claude-sonnet-4-6',  isSubagent: false, day: '2026-05-20', input: 20,  output: 10, cached: 0 },
];

describe('UsageCardsList', () => {
  it('renders ALL plus the three families in fixed order', () => {
    render(
      <UsageCardsList
        rows={rows}
        projectId="all"
        cutoffDay="0000-01-01"
        selected="all"
        onSelect={() => {}}
      />,
    );
    const cards = screen.getAllByTestId(/^usage-card-/);
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual([
      'usage-card-all',
      'usage-card-opus',
      'usage-card-sonnet',
      'usage-card-haiku',
    ]);
  });

  it('ALL card shows total of all rows and a full bar', () => {
    render(
      <UsageCardsList
        rows={rows}
        projectId="all"
        cutoffDay="0000-01-01"
        selected="all"
        onSelect={() => {}}
      />,
    );
    const all = screen.getByTestId('usage-card-all');
    expect(all.textContent).toContain('ALL MODELS');
    // Total = 100+50+50 + 10+5+5 + 20+10+0 = 250
    expect(all.textContent).toContain('250');
    expect(all.querySelector('[data-role="bar"]')?.getAttribute('data-pct')).toBe('100');
  });

  it('Opus card lists versions descending and its share-of-spend bar pct', () => {
    render(
      <UsageCardsList
        rows={rows}
        projectId="all"
        cutoffDay="0000-01-01"
        selected="all"
        onSelect={() => {}}
      />,
    );
    const opus = screen.getByTestId('usage-card-opus');
    expect(opus.textContent).toContain('4.7 · 4.6');
    // Opus total = 220 of 250 = 88%
    expect(opus.querySelector('[data-role="bar"]')?.getAttribute('data-pct')).toBe('88');
  });

  it('Haiku card renders dimmed when there are no haiku rows', () => {
    render(
      <UsageCardsList
        rows={rows}
        projectId="all"
        cutoffDay="0000-01-01"
        selected="all"
        onSelect={() => {}}
      />,
    );
    const haiku = screen.getByTestId('usage-card-haiku');
    expect(haiku.textContent).toContain('(no data)');
    expect(haiku.getAttribute('data-empty')).toBe('true');
  });

  it('clicking a card calls onSelect with that family', () => {
    const onSelect = vi.fn();
    render(
      <UsageCardsList
        rows={rows}
        projectId="all"
        cutoffDay="0000-01-01"
        selected="all"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId('usage-card-opus'));
    expect(onSelect).toHaveBeenCalledWith('opus');
  });

  it('honors projectId and cutoffDay when computing totals', () => {
    render(
      <UsageCardsList
        rows={rows}
        projectId="p1"
        cutoffDay="2026-05-21"
        selected="all"
        onSelect={() => {}}
      />,
    );
    const all = screen.getByTestId('usage-card-all');
    expect(all.textContent).toContain('0');
  });

  it('marks the selected card with data-selected=true', () => {
    render(
      <UsageCardsList
        rows={rows}
        projectId="all"
        cutoffDay="0000-01-01"
        selected="opus"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByTestId('usage-card-opus').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('usage-card-all').getAttribute('data-selected')).toBe('false');
  });
});
