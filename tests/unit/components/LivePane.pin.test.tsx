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

// Each LIVE poll yields a fresh tree (structuralSharing:false). We rebuild the
// whole tree with one extra node appended at the DFS tail to mimic a new
// milestone streaming in.
describe('LivePane detail pin/live behaviour', () => {
  it('follows the newest node when nothing is pinned', () => {
    const root1 = m('a', 'Read', 'first', [m('b', 'Grep', 'second')]);
    const { rerender } = render(
      <LivePane kind="main" label="MAIN" root={root1} cwd="/c" paneId="p1" projectId="p" sessionId="s" />
    );
    expect(screen.getByTestId('live-pane-detail').textContent).toContain('second');

    const root2 = m('a', 'Read', 'first', [m('b', 'Grep', 'second', [m('c', 'Bash', 'third')])]);
    rerender(<LivePane kind="main" label="MAIN" root={root2} cwd="/c" paneId="p1" projectId="p" sessionId="s" />);
    expect(screen.getByTestId('live-pane-detail').textContent).toContain('third');
  });

  it('shows no unpin control until a node is clicked', () => {
    const root = m('a', 'Read', 'first', [m('b', 'Grep', 'second')]);
    render(<LivePane kind="main" label="MAIN" root={root} cwd="/c" paneId="p1" projectId="p" sessionId="s" />);
    expect(screen.queryByTestId('live-pane-unpin')).toBeNull();
  });

  it('pins the detail to a clicked node and surfaces an escapable PINNED control', () => {
    const root1 = m('a', 'Read', 'first', [m('b', 'Grep', 'second')]);
    const { container, rerender } = render(
      <LivePane kind="main" label="MAIN" root={root1} cwd="/c" paneId="p1" projectId="p" sessionId="s" />
    );
    // 'b' is the newest, so it survives the 1x1 jsdom viewport cull. Click to pin.
    fireEvent.click(container.querySelector('[data-id="b"]')!);

    const unpin = screen.getByTestId('live-pane-unpin');
    expect(unpin.textContent).toContain('PINNED');

    // A new node streams in; the detail stays on the pinned node (intended).
    const root2 = m('a', 'Read', 'first', [m('b', 'Grep', 'second', [m('c', 'Bash', 'third')])]);
    rerender(<LivePane kind="main" label="MAIN" root={root2} cwd="/c" paneId="p1" projectId="p" sessionId="s" />);
    const detail = screen.getByTestId('live-pane-detail').textContent ?? '';
    expect(detail).toContain('second');
    expect(detail).not.toContain('third');

    // Escape hatch: clicking the PINNED control returns the detail to live.
    fireEvent.click(screen.getByTestId('live-pane-unpin'));
    expect(screen.getByTestId('live-pane-detail').textContent).toContain('third');
    expect(screen.queryByTestId('live-pane-unpin')).toBeNull();
  });
});
