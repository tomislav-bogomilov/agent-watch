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
});
