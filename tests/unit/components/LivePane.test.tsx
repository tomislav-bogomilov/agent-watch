import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LivePane } from '../../../src/components/live/LivePane';
import type { Milestone } from '../../../src/parse/types';

vi.mock('../../../src/api/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/hooks')>()),
  useNarrative: () => ({ data: undefined, dataUpdatedAt: 0 }),
  useStartNarrative: () => ({ mutate: vi.fn(), isPending: false }),
  useTickNarrative: () => ({ mutate: vi.fn() }),
  useRefreshNarrative: () => ({ mutate: vi.fn() }),
}));

function m(id: string, label: string, summary = '', children: Milestone[] = []): Milestone {
  return { id, kind: 'tool_call', label, summary, timestamp: '2026-05-24T12:00:00Z', failed: false, raw: null, children };
}

describe('LivePane', () => {
  it('renders the pane header label', () => {
    const root = m('a', 'Read App.tsx', 'first');
    render(<LivePane kind="main" label="MAIN" root={root} cwd="/c" paneId="p1" projectId="p" sessionId="s" />);
    expect(screen.getByTestId('live-pane').textContent).toContain('MAIN');
  });

  it('renders a GraphCanvas SVG (not the old linear button row)', () => {
    const root = m('a', 'Read App.tsx', 'first', [m('b', 'Grep', 'newest')]);
    const { container } = render(<LivePane kind="main" label="MAIN" root={root} cwd="/c" paneId="p1" projectId="p" sessionId="s" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders the countdown chip when status indicates closing', () => {
    const root = m('a', 'x');
    const onFreeze = vi.fn();
    render(
      <LivePane
        kind="subagent" label="SUBAGENT abc12345"
        root={root} cwd="/c" paneId="p2" projectId="p" sessionId="s"
        closingSeconds={24} frozen={false} onToggleFreeze={onFreeze}
      />
    );
    expect(screen.getByTestId('countdown-chip')).toBeTruthy();
  });

  it('shows no paused banner when the agent is running', () => {
    render(<LivePane kind="main" label="MAIN" root={m('a', 'x')} cwd="/c" paneId="p-run" projectId="p" sessionId="s" />);
    expect(screen.queryByTestId('live-pane-paused-banner')).toBeNull();
  });

  it('shows a PAUSE PENDING banner when paused but not yet caught at a tool call', () => {
    render(<LivePane kind="main" label="MAIN" root={m('a', 'x')} cwd="/c" paneId="p-pend" projectId="p" sessionId="s" agentPaused agentHeld={false} />);
    const banner = screen.getByTestId('live-pane-paused-banner');
    expect(banner.getAttribute('data-phase')).toBe('pending');
    expect(banner.textContent).toContain('PAUSE PENDING');
  });

  it('shows a PAUSED BY CLAUDEWATCH banner once a tool call is actually held', () => {
    render(<LivePane kind="subagent" label="SUBAGENT a1" root={m('a', 'x')} cwd="/c" paneId="p-held" projectId="p" sessionId="s" agentPaused agentHeld />);
    const banner = screen.getByTestId('live-pane-paused-banner');
    expect(banner.getAttribute('data-phase')).toBe('held');
    expect(banner.textContent).toContain('PAUSED BY CLAUDEWATCH');
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
        projectId="p"
        sessionId="s"
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

  it('renders Details and Logical Steps tabs; Details is active by default', () => {
    const root = m('a', 'Read App.tsx', 'first', [m('b', 'Grep', 'newest')]);
    render(<LivePane kind="main" label="MAIN" root={root} cwd="/c" paneId="p1" projectId="p" sessionId="s" />);
    expect(screen.getByTestId('pane-tab-details')).toBeTruthy();
    expect(screen.getByTestId('pane-tab-narrative')).toBeTruthy();
    // Default Details tab shows the selected (newest) node's label.
    expect(screen.getByTestId('live-pane-detail').textContent).toContain('Grep');
  });

  it('switching to the Logical Steps tab shows the per-pane enable prompt', () => {
    const root = m('a', 'Read App.tsx', 'first', [m('b', 'Grep', 'newest')]);
    render(<LivePane kind="main" label="MAIN" root={root} cwd="/c" paneId="p1" projectId="p" sessionId="s" />);
    fireEvent.click(screen.getByTestId('pane-tab-narrative'));
    expect(screen.getByTestId('narr-enable')).toBeTruthy();
  });
});
