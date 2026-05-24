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
    render(<LivePanes session={session} subagentMtimes={{}} onToggleLive={() => {}} />);
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
    }} onToggleLive={() => {}} />);
    expect(screen.getAllByTestId('live-pane')).toHaveLength(3);
    const grid = screen.getByTestId('live-panes-grid');
    expect(grid.getAttribute('data-n')).toBe('3');
  });

  it('transitions sub-agent pane to closing after 30s of stable mtime, then closed after 30s more', () => {
    const session = makeSession([m('a')], [
      { id: 'agent-aaaa1111', lastUpdatedAt: '2026-05-24T12:00:00Z', root: m('s1') },
    ]);
    const { rerender } = render(
      <LivePanes session={session} subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }} onToggleLive={() => {}} />
    );
    expect(screen.queryByTestId('countdown-chip')).toBeNull();

    // Advance 31s — should enter closing
    act(() => { vi.advanceTimersByTime(31_000); });
    rerender(<LivePanes session={session} subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }} onToggleLive={() => {}} />);
    expect(screen.getByTestId('countdown-chip')).toBeTruthy();

    // Advance another 31s — pane should be gone (now fullscreen MAIN, no LivePane wrapper)
    act(() => { vi.advanceTimersByTime(31_000); });
    rerender(<LivePanes session={session} subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }} onToggleLive={() => {}} />);
    expect(screen.queryByTestId('live-pane')).toBeNull();
    expect(screen.getByTestId('live-panes-grid').getAttribute('data-n')).toBe('1');
  });

  it('hides historical sub-agents whose file mtime is older than 30s at session open', () => {
    const session = makeSession([m('a')], [
      { id: 'agent-aaaa1111', lastUpdatedAt: '2026-05-24T12:00:00Z', root: m('s1') }, // fresh
      { id: 'agent-bbbb2222', lastUpdatedAt: '2026-05-24T11:00:00Z', root: m('s2') }, // 1h old
    ]);
    render(<LivePanes session={session} subagentMtimes={{
      'agent-aaaa1111': '2026-05-24T12:00:00Z',
      'agent-bbbb2222': '2026-05-24T11:00:00Z',
    }} onToggleLive={() => {}} />);
    // MAIN + 1 fresh sub-agent = N=2
    expect(screen.getAllByTestId('live-pane')).toHaveLength(2);
    expect(screen.getByTestId('live-panes-grid').getAttribute('data-n')).toBe('2');
  });

  it('hides 35s-stale sub-agents at session open (no transient closing pane in the 30-60s band)', () => {
    const session = makeSession([m('a')], [
      { id: 'agent-aaaa1111', lastUpdatedAt: '2026-05-24T11:59:25Z', root: m('s1') }, // 35s old
    ]);
    render(<LivePanes session={session} subagentMtimes={{
      'agent-aaaa1111': '2026-05-24T11:59:25Z',
    }} onToggleLive={() => {}} />);
    // Advance through one tick so the statusMap effect runs and any
    // transient 'closing' pane would appear if the guard were wrong.
    act(() => { vi.advanceTimersByTime(1_500); });
    expect(screen.queryByTestId('live-pane')).toBeNull();
    expect(screen.getByTestId('live-panes-grid').getAttribute('data-n')).toBe('1');
  });
});
