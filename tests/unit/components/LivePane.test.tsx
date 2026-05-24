import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LivePane } from '../../../src/components/live/LivePane';
import type { Milestone } from '../../../src/parse/types';

function m(id: string, label: string, summary = ''): Milestone {
  return {
    id, kind: 'tool_call', label, summary,
    timestamp: '2026-05-24T12:00:00Z', failed: false, raw: null, children: [],
  };
}

describe('LivePane', () => {
  it('renders the pane header label', () => {
    render(<LivePane kind="main" label="MAIN" milestones={[m('a', 'Read App.tsx')]} />);
    expect(screen.getByTestId('live-pane').textContent).toContain('MAIN');
  });

  it('shows the newest milestone in the detail panel by default', () => {
    const ms = [m('a', 'Read App.tsx', 'first'), m('b', 'Grep node', 'newest')];
    render(<LivePane kind="main" label="MAIN" milestones={ms} />);
    expect(screen.getByTestId('live-pane-detail').textContent).toContain('newest');
  });

  it('pins a clicked node, holding even when new milestones arrive', () => {
    const ms = [m('a', 'Read App.tsx', 'first'), m('b', 'Grep node', 'second')];
    const { rerender } = render(<LivePane kind="main" label="MAIN" milestones={ms} />);
    // Click the first node to pin it
    fireEvent.click(screen.getByTestId('live-pane-node-a'));
    expect(screen.getByTestId('live-pane-detail').textContent).toContain('first');
    // Add a newer milestone — pin should still hold
    rerender(
      <LivePane kind="main" label="MAIN" milestones={[...ms, m('c', 'Edit App.tsx', 'newest')]} />
    );
    expect(screen.getByTestId('live-pane-detail').textContent).toContain('first');
  });

  it('renders the countdown chip when status indicates closing', () => {
    const onFreeze = vi.fn();
    render(
      <LivePane
        kind="subagent" label="SUBAGENT abc12345"
        milestones={[m('a', 'x')]}
        closingSeconds={24}
        frozen={false}
        onToggleFreeze={onFreeze}
      />
    );
    expect(screen.getByTestId('countdown-chip')).toBeTruthy();
  });
});
