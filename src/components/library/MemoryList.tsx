import { useMemo } from 'react';
import { useMemoryList } from '../../api/hooks';
import type { MemoryRecord } from '../../api/client';

const TYPE_COLOR: Record<string, string> = {
  feedback: '#ff9d00', project: '#00e5ff', reference: '#b06cff', user: '#4dffa6',
};

type Props = {
  query: string;
  selectedKey: string | null; // `${scopeKey}/${name}`
  onSelect: (scopeKey: string, name: string) => void;
  onCreate: (scopeKey: string) => void;
};

export function MemoryList({ query, selectedKey, onSelect, onCreate }: Props) {
  const { data, isLoading, error } = useMemoryList();

  const groups = useMemo(() => {
    const memories = (data?.memories ?? []).filter((m) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
    });
    const map = new Map<string, { label: string; items: MemoryRecord[] }>();
    for (const m of memories) {
      const label = m.scope.kind === 'global' ? 'GLOBAL'
        : (m.scope.cwd.replace(/\\/g, '/').split('/').filter(Boolean).slice(-1)[0] ?? m.scopeKey).toUpperCase();
      if (!map.has(m.scopeKey)) map.set(m.scopeKey, { label, items: [] });
      map.get(m.scopeKey)!.items.push(m);
    }
    return [...map.entries()].map(([scopeKey, g]) => ({ scopeKey, ...g }));
  }, [data, query]);

  return (
    <div data-testid="memory-list">
      <button data-testid="memory-create" style={styles.create}
        onClick={() => onCreate(groups[0]?.scopeKey ?? 'global')}>+ NEW MEMORY</button>
      {isLoading && <div style={styles.muted}>scanning…</div>}
      {error && <div style={styles.error}>error: {(error as Error).message}</div>}
      {!isLoading && !error && groups.length === 0 && <div style={styles.muted}>(no memories)</div>}
      {groups.map((g) => (
        <div key={g.scopeKey} style={styles.group}>
          <div style={styles.groupHeader}>{g.label} <span style={styles.count}>({g.items.length})</span></div>
          {g.items.map((m) => {
            const key = `${m.scopeKey}/${m.name}`;
            return (
              <div
                key={key}
                data-testid={`memory-item-${m.scopeKey}-${m.name}`}
                onClick={() => onSelect(m.scopeKey, m.name)}
                style={{ ...styles.item, ...(selectedKey === key ? styles.itemSel : null) }}
              >
                <span style={{ ...styles.badge, color: TYPE_COLOR[m.type ?? ''] ?? 'var(--text-dim)',
                  borderColor: TYPE_COLOR[m.type ?? ''] ?? 'var(--edge-idle)' }}>{m.type ?? '?'}</span>
                <span style={styles.name}>{m.name}</span>
                {m.parseError && <span style={styles.warn} title={m.parseError}>⚠</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const styles = {
  create: { margin: '0 12px 8px', width: 'calc(100% - 24px)', background: 'rgba(0,229,255,0.08)', border: '1px solid var(--edge-trail)', color: 'var(--edge-trail)', padding: '5px', cursor: 'pointer', fontSize: 10, letterSpacing: 2, fontFamily: 'ui-monospace, monospace' },
  group: { marginBottom: 8 },
  groupHeader: { padding: '6px 12px 2px', fontSize: 10, letterSpacing: 2, color: 'var(--edge-trail)', fontFamily: 'ui-monospace, monospace' },
  count: { color: 'var(--text-dim)' },
  item: { display: 'flex' as const, alignItems: 'center' as const, gap: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11 },
  itemSel: { background: 'rgba(255,157,0,0.08)', borderLeft: '2px solid #ff9d00' },
  badge: { fontSize: 8, padding: '1px 5px', borderRadius: 8, border: '1px solid', textTransform: 'uppercase' as const },
  name: { color: 'var(--text)', fontFamily: 'ui-monospace, monospace', overflow: 'hidden' as const, textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  warn: { color: 'var(--node-failed)', marginLeft: 'auto' as const },
  muted: { padding: '0 12px', color: 'var(--text-dim)', fontSize: 12 },
  error: { padding: '0 12px', color: 'var(--node-failed)', fontSize: 12 },
};
