import { useState } from 'react';
import { SessionList } from './components/SessionList';
import type { SessionMeta } from './parse/types';

type Selected = { projectId: string; sessionId: string } | null;

export default function App() {
  const [selected, setSelected] = useState<Selected>(null);

  function handleSelect(s: SessionMeta) {
    setSelected({ projectId: s.projectId, sessionId: s.sessionId });
  }

  return (
    <div style={styles.shell}>
      <SessionList selected={selected} onSelect={handleSelect} />
      <main style={styles.main}>
        {!selected && <div style={styles.empty}>SELECT A SESSION</div>}
        {selected && <div style={styles.empty}>SESSION {selected.sessionId.slice(0, 8)} (graph not yet rendered)</div>}
      </main>
    </div>
  );
}

const styles = {
  shell: { display: 'flex', height: '100%' },
  main: { flex: 1, position: 'relative' as const },
  empty: {
    position: 'absolute' as const, inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-dim)', letterSpacing: 4,
  },
};
