import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { LivePanes } from '../../../src/components/live/LivePanes';
import type { Session, Milestone } from '../../../src/parse/types';

// LivePanes now fetches /api/control/state via react-query; jsdom can't satisfy
// the network call, so stub fetch with a quiescent control snapshot.
vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
  installed: false,
  control: { all: false, main: false, agents: {}, held: [], pendingNotes: [] },
}), { status: 200, headers: { 'content-type': 'application/json' } })));

// Wrap renders in a QueryClientProvider so the control hooks have a client.
function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

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

  it('renders one borderless MAIN LivePane when there are no sub-agents (N=1)', () => {
    const session = makeSession([m('a')], []);
    renderWithClient(<LivePanes session={session} projectId="C--test" subagentMtimes={{}} onToggleLive={() => {}} />);
    // N=1 uses a single borderless LivePane (keeps detail panel + click-to-pin).
    expect(screen.getAllByTestId('live-pane')).toHaveLength(1);
    expect(screen.getByTestId('live-pane-detail')).toBeTruthy();
    const grid = screen.getByTestId('live-panes-grid');
    expect(grid.getAttribute('data-n')).toBe('1');
    expect(grid.getAttribute('data-fullscreen')).toBe('true');
  });

  it('renders MAIN + 2 subagents in 2-col grid (N=3, last spans)', () => {
    const session = makeSession([m('a')], [
      { id: 'agent-aaaa1111', lastUpdatedAt: '2026-05-24T12:00:00Z', root: m('s1') },
      { id: 'agent-bbbb2222', lastUpdatedAt: '2026-05-24T12:00:00Z', root: m('s2') },
    ]);
    renderWithClient(<LivePanes session={session} projectId="C--test" subagentMtimes={{
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
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <LivePanes session={session} projectId="C--test" subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }} onToggleLive={() => {}} />
      </QueryClientProvider>
    );
    expect(screen.queryByTestId('countdown-chip')).toBeNull();

    // Advance 31s — should enter closing
    act(() => { vi.advanceTimersByTime(31_000); });
    rerender(
      <QueryClientProvider client={qc}>
        <LivePanes session={session} projectId="C--test" subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }} onToggleLive={() => {}} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('countdown-chip')).toBeTruthy();

    // Advance another 31s — sub-agent pane should be gone (only the borderless MAIN remains)
    act(() => { vi.advanceTimersByTime(31_000); });
    rerender(
      <QueryClientProvider client={qc}>
        <LivePanes session={session} projectId="C--test" subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }} onToggleLive={() => {}} />
      </QueryClientProvider>
    );
    expect(screen.getAllByTestId('live-pane')).toHaveLength(1);
    expect(screen.getByTestId('live-panes-grid').getAttribute('data-n')).toBe('1');
    expect(screen.getByTestId('live-panes-grid').getAttribute('data-fullscreen')).toBe('true');
  });

  it('hides historical sub-agents whose file mtime is older than 30s at session open', () => {
    const session = makeSession([m('a')], [
      { id: 'agent-aaaa1111', lastUpdatedAt: '2026-05-24T12:00:00Z', root: m('s1') }, // fresh
      { id: 'agent-bbbb2222', lastUpdatedAt: '2026-05-24T11:00:00Z', root: m('s2') }, // 1h old
    ]);
    renderWithClient(<LivePanes session={session} projectId="C--test" subagentMtimes={{
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
    renderWithClient(<LivePanes session={session} projectId="C--test" subagentMtimes={{
      'agent-aaaa1111': '2026-05-24T11:59:25Z',
    }} onToggleLive={() => {}} />);
    // Advance through one tick so the statusMap effect runs and any
    // transient 'closing' pane would appear if the guard were wrong.
    act(() => { vi.advanceTimersByTime(1_500); });
    // Only the borderless MAIN pane remains; the stale sub-agent never appears.
    expect(screen.getAllByTestId('live-pane')).toHaveLength(1);
    expect(screen.getByTestId('live-panes-grid').getAttribute('data-n')).toBe('1');
  });

  it('preserves the MAIN <svg> DOM identity when N flips between 1 and 2+', () => {
    const session = makeSession([m('a')], [
      { id: 'agent-aaaa1111', lastUpdatedAt: '2026-05-24T12:00:00Z', root: m('s1') },
    ]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender, container } = render(
      <QueryClientProvider client={qc}>
        <LivePanes
          session={session}
          projectId="C--test"
          subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }}
          onToggleLive={() => {}}
        />
      </QueryClientProvider>
    );
    // N=2: capture the MAIN pane's <svg>
    const mainPaneN2 = container.querySelector('[data-testid="live-pane"]');
    const svgN2 = mainPaneN2!.querySelector('svg');
    expect(svgN2).not.toBeNull();

    // Advance 61s so the lone subagent closes -> N=1
    act(() => { vi.advanceTimersByTime(61_000); });
    rerender(
      <QueryClientProvider client={qc}>
        <LivePanes
          session={session}
          projectId="C--test"
          subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }}
          onToggleLive={() => {}}
        />
      </QueryClientProvider>
    );
    const mainPaneN1 = container.querySelector('[data-testid="live-pane"]');
    const svgN1 = mainPaneN1!.querySelector('svg');
    // Same DOM node — no remount.
    expect(svgN1).toBe(svgN2);
  });
});
