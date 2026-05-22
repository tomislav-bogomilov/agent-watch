import { useEffect, useMemo, useState } from 'react';
import { SessionList } from './components/SessionList';
import { GraphCanvas } from './components/GraphCanvas';
import { NowPlaying } from './components/NowPlaying';
import { PlaybackControls } from './components/PlaybackControls';
import { DetailPanel } from './components/DetailPanel';
import { FilterToggles, type Filters } from './components/FilterToggles';
import { Legend } from './components/Legend';
import { useSession } from './api/hooks';
import { usePlayback } from './playback/usePlayback';
import type { Milestone, SessionMeta } from './parse/types';

type Selected = { projectId: string; sessionId: string } | null;

function collectSubagentIds(root: Milestone): Set<string> {
  const ids = new Set<string>();
  function walk(node: Milestone, inSub: boolean): void {
    if (inSub) ids.add(node.id);
    if (node.kind === 'subagent_spawn' && node.children.length >= 1) {
      walk(node.children[0], true);
      if (node.children[1]) walk(node.children[1], inSub);
      return;
    }
    for (const c of node.children) walk(c, inSub);
  }
  walk(root, false);
  return ids;
}

export default function App() {
  const [selected, setSelected] = useState<Selected>(null);
  const { data: session, isLoading, error } = useSession(
    selected?.projectId ?? null,
    selected?.sessionId ?? null
  );
  const { state: playback, controls } = usePlayback(session?.root ?? null);
  const subagentIds = useMemo(
    () => (session ? collectSubagentIds(session.root) : new Set<string>()),
    [session]
  );

  const currentMilestone = playback.order[playback.index] ?? null;
  const inSubagent = currentMilestone ? subagentIds.has(currentMilestone.id) : false;

  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filters, setFilters] = useState<Filters>({ hidePruned: false, hideSubagents: false, successOnly: false });
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  useEffect(() => { setPinnedId(null); }, [selected]);
  const pinnedMilestone = useMemo(() => {
    if (!session || !pinnedId) return null;
    return playback.order.find((m) => m.id === pinnedId) ?? null;
  }, [session, pinnedId, playback.order]);
  const needsConfirm = !!session && session.totalMilestones > 1000 && !confirmedIds.has(session.id);

  return (
    <div style={styles.shell}>
      <SessionList
        selected={selected}
        onSelect={(s: SessionMeta) => setSelected({ projectId: s.projectId, sessionId: s.sessionId })}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
      />
      <main style={{
        ...styles.main,
        paddingRight: pinnedMilestone ? 420 : 0,
        transition: 'padding-right 240ms ease',
      }}>
        {!selected && <div style={styles.empty}>SELECT A SESSION</div>}
        {selected && isLoading && <div style={styles.empty}>LOADING…</div>}
        {selected && error && <div style={styles.error}>error: {(error as Error).message}</div>}
        {session && needsConfirm && (
          <div style={styles.overflow} data-testid="overflow-confirm">
            <div style={styles.overflowMsg}>
              LARGE SESSION — {session.totalMilestones} MILESTONES
            </div>
            <div style={styles.overflowSub}>Rendering may take a moment.</div>
            <button
              style={styles.overflowBtn}
              data-testid="load-anyway"
              onClick={() => setConfirmedIds((s) => new Set(s).add(session.id))}
            >
              LOAD ANYWAY
            </button>
          </div>
        )}
        {session && !needsConfirm && (
          <>
            <div style={styles.sessionHeader} data-testid="session-header">
              <div style={styles.sessionTitle}>SESSION {session.id.slice(0, 8)}</div>
              <div style={styles.sessionCwd}>{session.cwd}</div>
            </div>
            <GraphCanvas session={session} playback={playback} subagentIds={subagentIds} pinnedId={pinnedId} onPin={setPinnedId} filters={filters} />
            <FilterToggles value={filters} onChange={setFilters} />
            <Legend />
            <NowPlaying current={currentMilestone} edgeProgress={playback.edgeProgress} inSubagent={inSubagent} speed={playback.speed} />
            <PlaybackControls state={playback} controls={controls} />
          </>
        )}
        <DetailPanel milestone={pinnedMilestone} onClose={() => setPinnedId(null)} />
      </main>
    </div>
  );
}

const styles = {
  shell: { display: 'flex', height: '100%' },
  main: { flex: 1, position: 'relative' as const, overflow: 'hidden' as const },
  empty: {
    position: 'absolute' as const, inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-dim)', letterSpacing: 4,
  },
  error: { padding: 24, color: 'var(--node-failed)' },
  sessionHeader: {
    position: 'absolute' as const,
    top: 16,
    left: 24,
    zIndex: 5,
    pointerEvents: 'none' as const,
  },
  sessionTitle: {
    fontSize: 11,
    letterSpacing: 3,
    color: 'var(--edge-trail)',
    fontFamily: 'ui-monospace, monospace',
  },
  sessionCwd: {
    fontSize: 11,
    color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
    marginTop: 2,
  },
  overflow: {
    position: 'absolute' as const, inset: 0,
    display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-dim)', gap: 12,
  },
  overflowMsg: {
    letterSpacing: 4, fontSize: 13, color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
  },
  overflowSub: {
    fontSize: 11, color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
  },
  overflowBtn: {
    background: 'transparent', border: '1px solid var(--edge-trail)',
    color: 'var(--edge-trail)', padding: '8px 18px', cursor: 'pointer',
    fontFamily: 'ui-monospace, monospace', letterSpacing: 3, fontSize: 11,
    boxShadow: '0 0 12px rgba(0, 229, 255, 0.25)',
  },
};
