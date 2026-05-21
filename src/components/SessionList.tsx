import { useSessionList } from '../api/hooks';
import type { SessionMeta } from '../parse/types';

type Props = {
  selected: { projectId: string; sessionId: string } | null;
  onSelect: (s: SessionMeta) => void;
};

export function SessionList({ selected, onSelect }: Props) {
  const { data, isLoading, error } = useSessionList();

  return (
    <aside style={styles.aside}>
      <h2 style={styles.title}>SESSIONS</h2>
      {isLoading && <div style={styles.muted}>scanning…</div>}
      {error && <div style={styles.error}>error: {(error as Error).message}</div>}
      {data && data.length === 0 && <div style={styles.muted}>(none)</div>}
      <ul style={styles.list}>
        {data?.map((s) => {
          const isSelected = selected?.projectId === s.projectId && selected?.sessionId === s.sessionId;
          return (
            <li
              key={`${s.projectId}/${s.sessionId}`}
              onClick={() => onSelect(s)}
              style={{
                ...styles.item,
                ...(isSelected ? styles.itemSelected : {}),
              }}
            >
              <div style={styles.itemCwd}>{s.cwd}</div>
              <div style={styles.itemMeta}>
                {new Date(s.startedAt).toLocaleString()} · {Math.round(s.sizeBytes / 1024)}KB
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

const styles = {
  aside: {
    width: 280,
    height: '100%',
    borderRight: '1px solid var(--grid)',
    overflowY: 'auto' as const,
    padding: '16px 0',
  },
  title: {
    margin: 0,
    padding: '0 16px 12px',
    fontSize: 11,
    letterSpacing: 3,
    color: 'var(--text-dim)',
    fontWeight: 400,
  },
  list: { listStyle: 'none', padding: 0, margin: 0 },
  item: {
    padding: '10px 16px',
    cursor: 'pointer',
    borderLeft: '2px solid transparent',
  },
  itemSelected: {
    borderLeftColor: 'var(--edge-trail)',
    background: 'rgba(0, 229, 255, 0.04)',
  },
  itemCwd: {
    fontSize: 12,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  itemMeta: { fontSize: 10, color: 'var(--text-dim)', marginTop: 2 },
  muted: { padding: '0 16px', color: 'var(--text-dim)', fontSize: 12 },
  error: { padding: '0 16px', color: 'var(--node-failed)', fontSize: 12 },
};
