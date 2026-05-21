import { useState } from 'react';
import { SessionList } from './components/SessionList';
import { GraphCanvas } from './components/GraphCanvas';
import { useSession } from './api/hooks';
import type { SessionMeta } from './parse/types';

type Selected = { projectId: string; sessionId: string } | null;

export default function App() {
  const [selected, setSelected] = useState<Selected>(null);
  const { data: session, isLoading, error } = useSession(
    selected?.projectId ?? null,
    selected?.sessionId ?? null
  );

  return (
    <div style={styles.shell}>
      <SessionList selected={selected} onSelect={(s: SessionMeta) => setSelected({ projectId: s.projectId, sessionId: s.sessionId })} />
      <main style={styles.main}>
        {!selected && <div style={styles.empty}>SELECT A SESSION</div>}
        {selected && isLoading && <div style={styles.empty}>LOADING…</div>}
        {selected && error && <div style={styles.error}>error: {(error as Error).message}</div>}
        {session && <GraphCanvas session={session} />}
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
};
