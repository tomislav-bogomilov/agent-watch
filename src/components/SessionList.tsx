import { useMemo, useState } from 'react';
import { useSessionList } from '../api/hooks';
import type { SessionMeta } from '../parse/types';

type Props = {
  selected: { projectId: string; sessionId: string } | null;
  onSelect: (s: SessionMeta) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

function projectKey(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.slice(-2).join('/');
}

export function SessionList({ selected, onSelect, collapsed, onToggleCollapsed }: Props) {
  const { data, isLoading, error } = useSessionList();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    if (!data) return [] as Array<{ key: string; items: SessionMeta[] }>;
    const filtered = query
      ? data.filter((s) => s.cwd.toLowerCase().includes(query.toLowerCase()))
      : data;
    const map = new Map<string, SessionMeta[]>();
    for (const s of filtered) {
      const k = projectKey(s.cwd);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
  }, [data, query]);

  if (collapsed) {
    return (
      <aside style={{ ...styles.aside, width: 40, padding: '12px 0' }} data-testid="session-list">
        <button
          onClick={onToggleCollapsed}
          style={styles.collapseBtn}
          aria-label="expand sessions"
          data-testid="sidebar-toggle"
          title="expand (\)"
        >»</button>
      </aside>
    );
  }

  return (
    <aside style={styles.aside} data-testid="session-list">
      <div style={styles.header}>
        <h2 style={styles.title}>SESSIONS</h2>
        <button
          onClick={onToggleCollapsed}
          style={styles.collapseBtn}
          aria-label="collapse sessions"
          data-testid="sidebar-toggle"
          title="collapse (\)"
        >«</button>
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="filter…"
        style={styles.filter}
        data-testid="session-filter"
      />
      {isLoading && <div style={styles.muted}>scanning…</div>}
      {error && <div style={styles.error}>error: {(error as Error).message}</div>}
      {data && data.length === 0 && <div style={styles.muted}>(none)</div>}
      <div style={styles.scroll}>
        {groups.map((g) => (
          <div key={g.key} style={styles.group}>
            <div style={styles.groupHeader}>
              {g.key} <span style={styles.groupCount}>({g.items.length})</span>
            </div>
            <ul style={styles.list}>
              {g.items.map((s) => {
                const isSelected = selected?.projectId === s.projectId && selected?.sessionId === s.sessionId;
                return (
                  <li
                    key={`${s.projectId}/${s.sessionId}`}
                    onClick={() => onSelect(s)}
                    style={{ ...styles.item, ...(isSelected ? styles.itemSelected : {}) }}
                  >
                    <div style={styles.itemCwd}>{s.cwd}</div>
                    <div style={styles.itemMeta}>
                      {new Date(s.startedAt).toLocaleString()} · {Math.round(s.sizeBytes / 1024)}KB
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}

const styles = {
  aside: {
    width: 280,
    height: '100%',
    borderRight: '1px solid var(--grid)',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    padding: '12px 0',
    transition: 'width 200ms ease',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px 6px',
  },
  title: {
    margin: 0,
    fontSize: 11,
    letterSpacing: 3,
    color: 'var(--text-dim)',
    fontWeight: 400,
  },
  collapseBtn: {
    background: 'transparent',
    border: '1px solid var(--edge-idle)',
    color: 'var(--text)',
    cursor: 'pointer',
    padding: '0 8px',
    fontSize: 12,
    fontFamily: 'ui-monospace, monospace',
  },
  filter: {
    margin: '0 12px 8px',
    padding: '4px 6px',
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid var(--edge-idle)',
    color: 'var(--text)',
    fontSize: 11,
    fontFamily: 'ui-monospace, monospace',
  },
  scroll: { overflowY: 'auto' as const, flex: 1 },
  group: { marginBottom: 8 },
  groupHeader: {
    padding: '6px 12px 2px',
    fontSize: 10,
    letterSpacing: 2,
    color: 'var(--edge-trail)',
    fontFamily: 'ui-monospace, monospace',
  },
  groupCount: { color: 'var(--text-dim)' },
  list: { listStyle: 'none', padding: 0, margin: 0 },
  item: {
    padding: '8px 12px',
    cursor: 'pointer',
    borderLeft: '2px solid transparent',
  },
  itemSelected: {
    borderLeftColor: 'var(--edge-trail)',
    background: 'rgba(0, 229, 255, 0.04)',
  },
  itemCwd: {
    fontSize: 11,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontFamily: 'ui-monospace, monospace',
  },
  itemMeta: {
    fontSize: 10,
    color: 'var(--text-dim)',
    marginTop: 2,
    fontFamily: 'ui-monospace, monospace',
  },
  muted: { padding: '0 12px', color: 'var(--text-dim)', fontSize: 12 },
  error: { padding: '0 12px', color: 'var(--node-failed)', fontSize: 12 },
};
