import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LivePane } from '../../../src/components/live/LivePane';
import type { Milestone } from '../../../src/parse/types';

function m(id: string, label: string, summary = '', children: Milestone[] = []): Milestone {
  return { id, kind: 'tool_call', label, summary, timestamp: '2026-05-24T12:00:00Z', failed: false, raw: null, children };
}

describe('LivePane', () => {
  it('renders the pane header label', () => {
    const root = m('a', 'Read App.tsx', 'first');
    render(<LivePane kind="main" label="MAIN" root={root} cwd="/c" paneId="p1" />);
    expect(screen.getByTestId('live-pane').textContent).toContain('MAIN');
  });

  it('renders a GraphCanvas SVG (not the old linear button row)', () => {
    const root = m('a', 'Read App.tsx', 'first', [m('b', 'Grep', 'newest')]);
    const { container } = render(<LivePane kind="main" label="MAIN" root={root} cwd="/c" paneId="p1" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders the countdown chip when status indicates closing', () => {
    const root = m('a', 'x');
    const onFreeze = vi.fn();
    render(
      <LivePane
        kind="subagent" label="SUBAGENT abc12345"
        root={root} cwd="/c" paneId="p2"
        closingSeconds={24} frozen={false} onToggleFreeze={onFreeze}
      />
    );
    expect(screen.getByTestId('countdown-chip')).toBeTruthy();
  });

  it('truncates a long summary string in the header with ellipsis styles', () => {
    const longSummary = 'A'.repeat(65); // 65 chars — well over the threshold
    const root = m('root', 'Some Tool', longSummary);
    render(
      <LivePane
        kind="main"
        label="MAIN"
        root={root}
        cwd="/c"
        paneId="p-trunc"
        borderless={false}
      />
    );
    // The pane header is inside data-testid="live-pane"
    const pane = screen.getByTestId('live-pane');
    // Find the span whose textContent matches the long summary
    const summarySpan = Array.from(pane.querySelectorAll<HTMLElement>('span')).find(
      (s) => s.textContent === longSummary
    );
    // jsdom has no layout engine — we can only verify the style properties are
    // present. Visual truncation should be confirmed in a browser / Playwright test.
    expect(summarySpan).toBeTruthy();
    expect(summarySpan!.style.whiteSpace).toBe('nowrap');
    expect(summarySpan!.style.overflow).toBe('hidden');
    expect(summarySpan!.style.textOverflow).toBe('ellipsis');
    expect(summarySpan!.style.minWidth).toBe('0');
  });
});
