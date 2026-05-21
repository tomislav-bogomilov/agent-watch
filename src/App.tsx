import { useMemo, useState } from 'react';
import { SessionList } from './components/SessionList';
import { GraphCanvas } from './components/GraphCanvas';
import { NowPlaying } from './components/NowPlaying';
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
  const { state: playback } = usePlayback(session?.root ?? null);
  const subagentIds = useMemo(
    () => (session ? collectSubagentIds(session.root) : new Set<string>()),
    [session]
  );

  const currentMilestone = playback.order[playback.index] ?? null;
  const inSubagent = currentMilestone ? subagentIds.has(currentMilestone.id) : false;

  return (
    <div style={styles.shell}>
      <SessionList
        selected={selected}
        onSelect={(s: SessionMeta) => setSelected({ projectId: s.projectId, sessionId: s.sessionId })}
      />
      <main style={styles.main}>
        {!selected && <div style={styles.empty}>SELECT A SESSION</div>}
        {selected && isLoading && <div style={styles.empty}>LOADING…</div>}
        {selected && error && <div style={styles.error}>error: {(error as Error).message}</div>}
        {session && (
          <>
            <div style={styles.sessionHeader} data-testid="session-header">
              <div style={styles.sessionTitle}>SESSION {session.id.slice(0, 8)}</div>
              <div style={styles.sessionCwd}>{session.cwd}</div>
            </div>
            <GraphCanvas session={session} playback={playback} subagentIds={subagentIds} />
            <NowPlaying current={currentMilestone} edgeProgress={playback.edgeProgress} inSubagent={inSubagent} />
          </>
        )}
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
};
