import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessionList } from '../api/hooks';
import type { SessionMeta } from '../parse/types';
import { ResizeHandle } from './ResizeHandle';

type Props = {
  selected: { projectId: string; sessionId: string } | null;
  onSelect: (s: SessionMeta) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  width: number;
  onResize: (delta: number) => void;
};

const STORAGE_EXPANDED = 'tg.projects.expanded';
const STORAGE_ORDER = 'tg.projects.order';
const STORAGE_TITLES = 'tg.session.titles';

function projectKey(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.slice(-2).join('/');
}

function basename(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function reorderArray<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function SessionList({ selected, onSelect, collapsed, onToggleCollapsed, width, onResize }: Props) {
  const { data, isLoading, error } = useSessionList();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(readJson<string[]>(STORAGE_EXPANDED, [])));
  const [order, setOrder] = useState<string[]>(() => readJson<string[]>(STORAGE_ORDER, []));
  const [titles, setTitles] = useState<Record<string, string>>(() => readJson<Record<string, string>>(STORAGE_TITLES, {}));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const expandedInit = useRef(false);

  const groups = useMemo(() => {
    if (!data) return [] as Array<{ key: string; items: SessionMeta[] }>;
    const filtered = query
      ? data.filter((s) => {
          const q = query.toLowerCase();
          const t = (titles[s.sessionId] ?? s.title ?? '').toLowerCase();
          return s.cwd.toLowerCase().includes(q) || t.includes(q);
        })
      : data;
    const map = new Map<string, SessionMeta[]>();
    for (const s of filtered) {
      const k = projectKey(s.cwd);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    const arr = Array.from(map.entries()).map(([key, items]) => ({ key, items }));
    const idx = new Map(order.map((k, i) => [k, i]));
    arr.sort((a, b) => {
      const ia = idx.get(a.key);
      const ib = idx.get(b.key);
      if (ia != null && ib != null) return ia - ib;
      if (ia != null) return -1;
      if (ib != null) return 1;
      return a.key.localeCompare(b.key);
    });
    return arr;
  }, [data, query, order, titles]);

  // Expand all groups on first data load if user has no persisted state.
  useEffect(() => {
    if (expandedInit.current) return;
    if (!data || data.length === 0) return;
    expandedInit.current = true;
    if (expanded.size === 0 && readJson<string[]>(STORAGE_EXPANDED, []).length === 0) {
      const all = new Set(groups.map((g) => g.key));
      setExpanded(all);
    }
  }, [data, groups, expanded.size]);

  function toggleExpanded(key: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      writeJson(STORAGE_EXPANDED, Array.from(next));
      return next;
    });
  }

  function moveGroup(fromKey: string, toKey: string): void {
    const keys = groups.map((g) => g.key);
    const from = keys.indexOf(fromKey);
    const to = keys.indexOf(toKey);
    if (from < 0 || to < 0 || from === to) return;
    const nextKeys = reorderArray(keys, from, to);
    setOrder(nextKeys);
    writeJson(STORAGE_ORDER, nextKeys);
  }

  function startEdit(s: SessionMeta, e: React.MouseEvent): void {
    e.stopPropagation();
    setEditingId(s.sessionId);
    setDraftTitle(titles[s.sessionId] ?? s.title ?? basename(s.cwd));
  }

  function commitEdit(s: SessionMeta): void {
    const trimmed = draftTitle.trim();
    setTitles((prev) => {
      const next = { ...prev };
      if (!trimmed) delete next[s.sessionId];
      else next[s.sessionId] = trimmed;
      writeJson(STORAGE_TITLES, next);
      return next;
    });
    setEditingId(null);
  }

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
    <aside style={{ ...styles.aside, width }} data-testid="session-list">
      <ResizeHandle side="right" onResize={onResize} testId="sidebar-resize" />
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
        {groups.map((g) => {
          const isOpen = expanded.has(g.key);
          const isDragOver = dragOverKey === g.key && dragKey !== null && dragKey !== g.key;
          return (
            <div
              key={g.key}
              style={{ ...styles.group, ...(isDragOver ? styles.groupDragOver : {}) }}
              onDragOver={(e) => { if (dragKey) { e.preventDefault(); setDragOverKey(g.key); } }}
              onDragLeave={() => { if (dragOverKey === g.key) setDragOverKey(null); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragKey && dragKey !== g.key) moveGroup(dragKey, g.key);
                setDragKey(null);
                setDragOverKey(null);
              }}
            >
              <div
                style={styles.groupHeader}
                draggable
                data-testid={`project-header-${g.key}`}
                onDragStart={(e) => { setDragKey(g.key); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => { setDragKey(null); setDragOverKey(null); }}
                onClick={() => toggleExpanded(g.key)}
                title="drag to reorder · click to collapse"
              >
                <span style={styles.grip} aria-hidden>⋮⋮</span>
                <span style={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
                <span style={styles.groupName}>{g.key}</span>
                <span style={styles.groupCount}>({g.items.length})</span>
              </div>
              {isOpen && (
                <ul style={styles.list}>
                  {g.items.map((s) => {
                    const isSelected = selected?.projectId === s.projectId && selected?.sessionId === s.sessionId;
                    const displayTitle = titles[s.sessionId] ?? s.title ?? basename(s.cwd);
                    const isEditing = editingId === s.sessionId;
                    return (
                      <li
                        key={`${s.projectId}/${s.sessionId}`}
                        onClick={() => { if (!isEditing) onSelect(s); }}
                        style={{ ...styles.item, ...(isSelected ? styles.itemSelected : {}) }}
                        data-testid={`session-item-${s.sessionId}`}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            value={draftTitle}
                            onChange={(e) => setDraftTitle(e.currentTarget.value)}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={() => commitEdit(s)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); commitEdit(s); }
                              else if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                            }}
                            style={styles.editInput}
                            data-testid={`session-rename-${s.sessionId}`}
                          />
                        ) : (
                          <div
                            style={styles.itemTitle}
                            onDoubleClick={(e) => startEdit(s, e)}
                            title={displayTitle}
                          >
                            {displayTitle}
                          </div>
                        )}
                        <div style={styles.itemCwd} title={s.cwd}>{s.cwd}</div>
                        <div style={styles.itemMeta}>
                          {new Date(s.startedAt).toLocaleString()} · {Math.round(s.sizeBytes / 1024)}KB
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

const styles = {
  aside: {
    height: '100%',
    borderRight: '1px solid var(--grid)',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    padding: '12px 0',
    position: 'relative' as const,
    flexShrink: 0,
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
  group: { marginBottom: 8, borderTop: '1px solid transparent' },
  groupDragOver: { borderTop: '1px solid var(--edge-trail)' },
  groupHeader: {
    padding: '6px 12px 2px',
    fontSize: 10,
    letterSpacing: 2,
    color: 'var(--edge-trail)',
    fontFamily: 'ui-monospace, monospace',
    cursor: 'grab',
    display: 'flex' as const,
    alignItems: 'center',
    gap: 6,
    userSelect: 'none' as const,
  },
  grip: { color: 'var(--text-dim)', cursor: 'grab' },
  chevron: { width: 10, display: 'inline-block', color: 'var(--text-dim)' },
  groupName: { flex: 1, overflow: 'hidden' as const, textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
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
  itemTitle: {
    fontSize: 12,
    color: 'var(--text)',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontFamily: 'ui-monospace, monospace',
  },
  itemCwd: {
    fontSize: 10,
    color: 'var(--text-dim)',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontFamily: 'ui-monospace, monospace',
    marginTop: 2,
  },
  itemMeta: {
    fontSize: 10,
    color: 'var(--text-dim)',
    marginTop: 2,
    fontFamily: 'ui-monospace, monospace',
  },
  editInput: {
    width: '100%',
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid var(--edge-trail)',
    color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12,
    padding: '2px 4px',
    boxSizing: 'border-box' as const,
  },
  muted: { padding: '0 12px', color: 'var(--text-dim)', fontSize: 12 },
  error: { padding: '0 12px', color: 'var(--node-failed)', fontSize: 12 },
};
