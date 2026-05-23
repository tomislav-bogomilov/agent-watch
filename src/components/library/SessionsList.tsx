import { useState } from 'react';
import type { SessionMeta } from '../../parse/types';
import { ItemShell } from './ItemShell';

type Props = {
  items: SessionMeta[];
  selectedSessionId: string | null;
  titles: Record<string, string>;
  onSelect: (s: SessionMeta) => void;
  onRename: (sessionId: string, title: string) => void;
};

function basename(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

export function SessionsList({ items, selectedSessionId, titles, onSelect, onRename }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  function startEdit(s: SessionMeta, e: React.MouseEvent): void {
    e.stopPropagation();
    setEditingId(s.sessionId);
    setDraftTitle(titles[s.sessionId] ?? s.title ?? basename(s.cwd));
  }

  function commitEdit(s: SessionMeta): void {
    onRename(s.sessionId, draftTitle.trim());
    setEditingId(null);
  }

  return (
    <ul style={styles.list}>
      {items.map((s) => {
        const isSelected = selectedSessionId === s.sessionId;
        const displayTitle = titles[s.sessionId] ?? s.title ?? basename(s.cwd);
        const isEditing = editingId === s.sessionId;
        return (
          <ItemShell
            key={`${s.projectId}/${s.sessionId}`}
            selected={isSelected}
            onClick={() => { if (!isEditing) onSelect(s); }}
            testId={`session-item-${s.sessionId}`}
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
            <div style={styles.itemMeta}>
              {new Date(s.startedAt).toLocaleString()} · {Math.round(s.sizeBytes / 1024)}KB
            </div>
          </ItemShell>
        );
      })}
    </ul>
  );
}

const styles = {
  list: { listStyle: 'none', padding: 0, margin: 0 },
  itemTitle: {
    fontSize: 12,
    color: 'var(--text)',
    overflow: 'hidden' as const,
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
};
