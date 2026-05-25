import { useEffect, useMemo, useRef, useState } from 'react';
import { usePromptList, useSessionList } from '../../api/hooks';
import type { PromptMeta, SessionMeta } from '../../parse/types';
import { ResizeHandle } from '../ResizeHandle';
import { PromptsList } from './PromptsList';
import { SessionsList } from './SessionsList';

export type LibraryMode = 'sessions' | 'prompts';

export type Selection =
  | { kind: 'session'; projectId: string; sessionId: string }
  | { kind: 'prompt'; projectId: string; sessionId: string; promptId: string };

type Props = {
  selected: Selection | null;
  onSelect: (s: Selection) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  width: number;
  onResize: (delta: number) => void;
  mode: LibraryMode;
  onModeChange: (m: LibraryMode) => void;
};

const STORAGE_EXPANDED = 'tg.projects.expanded';
const STORAGE_ORDER = 'tg.projects.order';
const STORAGE_TITLES = 'tg.session.titles';

function projectKey(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.slice(-2).join('/');
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

export function LibraryPanel({ selected, onSelect, collapsed, onToggleCollapsed, width, onResize, mode, onModeChange }: Props) {
  const sessionsQuery = useSessionList();
  const promptsQuery = usePromptList();

  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(readJson<string[]>(STORAGE_EXPANDED, [])));
  const [order, setOrder] = useState<string[]>(() => readJson<string[]>(STORAGE_ORDER, []));
  const [titles, setTitles] = useState<Record<string, string>>(() => readJson<Record<string, string>>(STORAGE_TITLES, {}));
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const expandedInit = useRef<Set<LibraryMode>>(new Set());

  function onRename(sessionId: string, title: string): void {
    setTitles((prev) => {
      const nextTitles = { ...prev };
      if (!title) delete nextTitles[sessionId];
      else nextTitles[sessionId] = title;
      writeJson(STORAGE_TITLES, nextTitles);
      return nextTitles;
    });
  }

  const sessionsByProject = useMemo(() => {
    if (!sessionsQuery.data) return new Map<string, SessionMeta[]>();
    const filtered = query
      ? sessionsQuery.data.filter((s) => {
          const q = query.toLowerCase();
          const t = (titles[s.sessionId] ?? s.title ?? '').toLowerCase();
          return s.cwd.toLowerCase().includes(q) || t.includes(q);
        })
      : sessionsQuery.data;
    const map = new Map<string, SessionMeta[]>();
    for (const s of filtered) {
      const k = projectKey(s.cwd);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return map;
  }, [sessionsQuery.data, query, titles]);

  const promptsByProject = useMemo(() => {
    if (!promptsQuery.data || !sessionsQuery.data) return new Map<string, PromptMeta[]>();
    // Map projectId -> cwd from the sessions response (the prompt response
    // only carries projectId; cwd lives on SessionMeta).
    const cwdByProject = new Map<string, string>();
    for (const s of sessionsQuery.data) cwdByProject.set(s.projectId, s.cwd);
    const filtered = query
      ? promptsQuery.data.filter((p) => {
          const q = query.toLowerCase();
          const cwd = (cwdByProject.get(p.projectId) ?? '').toLowerCase();
          return cwd.includes(q) || p.text.toLowerCase().includes(q);
        })
      : promptsQuery.data;
    const map = new Map<string, PromptMeta[]>();
    for (const p of filtered) {
      const cwd = cwdByProject.get(p.projectId);
      if (!cwd) continue; // session not yet loaded; skip
      const k = projectKey(cwd);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    // Within each project, newest-first (server already sorted globally,
    // but bucketing preserves order so this is essentially a no-op).
    for (const arr of map.values()) {
      arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }
    return map;
  }, [promptsQuery.data, sessionsQuery.data, query]);

  const groups = useMemo(() => {
    const source: Map<string, SessionMeta[] | PromptMeta[]> =
      mode === 'sessions' ? sessionsByProject : promptsByProject;
    const arr = Array.from(source.entries()).map(([key, items]) => ({ key, items }));
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
  }, [mode, sessionsByProject, promptsByProject, order]);

  // One-time cleanup: remove the spike's persisted variant key from any user
  // who tried the A/B/C selector during the brainstorm phase. Safe no-op once
  // the key is gone.
  useEffect(() => {
    try { localStorage.removeItem('tg.spike.itemStyle'); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (expandedInit.current.has(mode)) return;
    const haveData = mode === 'sessions' ? !!sessionsQuery.data : !!promptsQuery.data;
    if (!haveData || groups.length === 0) return;
    expandedInit.current.add(mode);
    // First visit to this mode in the current session: if the user has no
    // persisted expansion preferences at all, expand every group. Once any
    // persisted state exists we respect it — including for modes the user
    // hasn't opened yet.
    if (expanded.size === 0 && readJson<string[]>(STORAGE_EXPANDED, []).length === 0) {
      setExpanded(new Set(groups.map((g) => g.key)));
    }
  }, [mode, sessionsQuery.data, promptsQuery.data, groups, expanded.size]);

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

  if (collapsed) {
    return (
      <aside style={{ ...styles.aside, width: 40, padding: '12px 0' }} data-testid="session-list">
        <button
          onClick={onToggleCollapsed}
          style={styles.collapseBtn}
          aria-label="expand sidebar"
          data-testid="sidebar-toggle"
          title="expand (\)"
        >»</button>
      </aside>
    );
  }

  const selectedSessionId = selected?.kind === 'session' ? selected.sessionId : null;
  const selectedPromptId = selected?.kind === 'prompt' ? selected.promptId : null;
  const isLoading = mode === 'sessions' ? sessionsQuery.isLoading : promptsQuery.isLoading;
  const error = mode === 'sessions' ? sessionsQuery.error : promptsQuery.error;
  const hasData = mode === 'sessions' ? !!sessionsQuery.data : !!promptsQuery.data;

  return (
    <aside style={{ ...styles.aside, width }} data-testid="session-list">
      <ResizeHandle side="right" onResize={onResize} testId="sidebar-resize" />
      <div style={styles.header}>
        <span style={styles.dropdownWrap}>
          <select
            value={mode}
            onChange={(e) => onModeChange(e.target.value as LibraryMode)}
            style={styles.dropdown}
            data-testid="library-mode"
            aria-label="library mode"
          >
            <option value="sessions">SESSIONS</option>
            <option value="prompts">PROMPTS</option>
          </select>
        </span>
        <button
          type="button"
          data-testid="tokens-link"
          onClick={() => {
            window.location.hash = window.location.hash === '#/tokens' ? '' : '#/tokens';
          }}
          style={{
            ...styles.tokensLink,
            ...(typeof window !== 'undefined' && window.location.hash === '#/tokens' ? styles.tokensLinkOn : null),
          }}
          aria-label="tokens"
          title="token usage"
        >TOKENS</button>
        <button
          onClick={onToggleCollapsed}
          style={styles.collapseBtn}
          aria-label="collapse sidebar"
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
      {hasData && groups.length === 0 && <div style={styles.muted}>(none)</div>}
      <div className="tg-library-scroll" style={styles.scroll}>
        {groups.map((g) => {
          const isOpen = expanded.has(g.key);
          const isDragOver = dragOverKey === g.key && dragKey !== null && dragKey !== g.key;
          return (
            <div
              key={g.key}
              data-project-key={g.key}
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
              {isOpen && mode === 'sessions' && (
                <SessionsList
                  items={g.items as SessionMeta[]}
                  selectedSessionId={selectedSessionId}
                  titles={titles}
                  onSelect={(s) => onSelect({ kind: 'session', projectId: s.projectId, sessionId: s.sessionId })}
                  onRename={onRename}
                />
              )}
              {isOpen && mode === 'prompts' && (
                <PromptsList
                  items={g.items as unknown as PromptMeta[]}
                  sessionTitles={titles}
                  selectedPromptId={selectedPromptId}
                  onSelect={(p) => onSelect({ kind: 'prompt', projectId: p.projectId, sessionId: p.sessionId, promptId: p.promptId })}
                />
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
    gap: 6,
  },
  dropdownWrap: { position: 'relative' as const, display: 'inline-block' },
  dropdown: {
    appearance: 'none' as const,
    background: 'transparent',
    border: '1px solid var(--edge-trail)',
    color: 'var(--edge-trail)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    letterSpacing: 3,
    padding: '4px 22px 4px 8px',
    cursor: 'pointer',
    backgroundImage: 'linear-gradient(45deg, transparent 50%, var(--edge-trail) 50%), linear-gradient(135deg, var(--edge-trail) 50%, transparent 50%)',
    backgroundPosition: 'calc(100% - 11px) 50%, calc(100% - 7px) 50%',
    backgroundSize: '4px 4px',
    backgroundRepeat: 'no-repeat',
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
  muted: { padding: '0 12px', color: 'var(--text-dim)', fontSize: 12 },
  error: { padding: '0 12px', color: 'var(--node-failed)', fontSize: 12 },
  tokensLink: {
    background: 'transparent',
    border: '1px solid var(--edge-idle)',
    color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 10,
    letterSpacing: 2,
    padding: '4px 8px',
    cursor: 'pointer' as const,
  },
  tokensLinkOn: {
    borderColor: 'var(--edge-trail)',
    color: 'var(--edge-trail)',
    background: 'rgba(0,229,255,0.10)',
  },
};
