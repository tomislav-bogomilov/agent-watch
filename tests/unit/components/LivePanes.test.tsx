import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LivePanes } from '../../../src/components/live/LivePanes';
import type { Session, Milestone } from '../../../src/parse/types';

function m(id: string, kind: Milestone['kind'] = 'tool_call', children: Milestone[] = []): Milestone {
  return { id, kind, label: id, summary: '', timestamp: '', failed: false, raw: null, children };
}

function makeSession(mainTrail: Milestone[], subagentTrails: { id: string; lastUpdatedAt: string; root: Milestone }[]): Session {
  // Splice each sub-agent as a subagent_spawn off the last main node, with its root as children[0].
  let main: Milestone;
  if (mainTrail.length === 1) main = mainTrail[0];
  else {
    const reversed = [...mainTrail].reverse();
    main = reversed.reduce((acc, node, i) => {
      if (i === 0) return node;
      acc.children = [];
      const wrap: Milestone = { ...node, children: [acc] };
      return wrap;
    }, reversed[0]);
  }
  // Attach sub-agents as spawn nodes off the leaf
  let leaf = main;
  while (leaf.children.length > 0) leaf = leaf.children[0];
  for (const sa of subagentTrails) {
    leaf.children.push({ id: `spawn-${sa.id}`, kind: 'subagent_spawn', label: 'spawn',
      summary: '', timestamp: '', failed: false, raw: null,
      children: [sa.root] });
  }
  return {
    id: 'test-session', cwd: '/c',
    startedAt: '2026-05-24T12:00:00Z',
    root: main,
    successPath: new Set(),
    totalMilestones: 0,
    subagentMtimes: {},
  };
}

describe('LivePanes', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-05-24T12:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders just MAIN fullscreen when there are no sub-agents (N=1)', () => {
    const session = makeSession([m('a')], []);
    render(<LivePanes session={session} subagentMtimes={{}} />);
    // At N=1, no LivePane wrapper — directly a fullscreen grid container.
    expect(screen.queryByTestId('live-pane')).toBeNull();
    const grid = screen.getByTestId('live-panes-grid');
    expect(grid.getAttribute('data-n')).toBe('1');
    expect(grid.getAttribute('data-fullscreen')).toBe('true');
  });

  it('renders MAIN + 2 subagents in 2-col grid (N=3, last spans)', () => {
    const session = makeSession([m('a')], [
      { id: 'agent-aaaa1111', lastUpdatedAt: '2026-05-24T12:00:00Z', root: m('s1') },
      { id: 'agent-bbbb2222', lastUpdatedAt: '2026-05-24T12:00:00Z', root: m('s2') },
    ]);
    render(<LivePanes session={session} subagentMtimes={{
      'agent-aaaa1111': '2026-05-24T12:00:00Z',
      'agent-bbbb2222': '2026-05-24T12:00:00Z',
    }} />);
    expect(screen.getAllByTestId('live-pane')).toHaveLength(3);
    const grid = screen.getByTestId('live-panes-grid');
    expect(grid.getAttribute('data-n')).toBe('3');
  });

  it('transitions sub-agent pane to closing after 60s of stable mtime, then closed after 30s more', () => {
    const session = makeSession([m('a')], [
      { id: 'agent-aaaa1111', lastUpdatedAt: '2026-05-24T12:00:00Z', root: m('s1') },
    ]);
    const { rerender } = render(
      <LivePanes session={session} subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }} />
    );
    expect(screen.queryByTestId('countdown-chip')).toBeNull();

    // Advance 61s — should enter closing
    act(() => { vi.advanceTimersByTime(61_000); });
    rerender(<LivePanes session={session} subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }} />);
    expect(screen.getByTestId('countdown-chip')).toBeTruthy();

    // Advance another 31s — pane should be gone (now fullscreen MAIN, no LivePane wrapper)
    act(() => { vi.advanceTimersByTime(31_000); });
    rerender(<LivePanes session={session} subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }} />);
    expect(screen.queryByTestId('live-pane')).toBeNull();
    expect(screen.getByTestId('live-panes-grid').getAttribute('data-n')).toBe('1');
  });
});
