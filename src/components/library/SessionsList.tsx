import { useState } from 'react';
import type { SessionMeta } from '../../parse/types';
import { ItemShell } from './ItemShell';
import { LiveTag } from './LiveTag';
import { isLiveMeta } from '../../api/hooks';
import { sessionKey } from '../../session-identity';

type Props = {
  items: SessionMeta[];
  selectedSessionKey: string | null;
  titles: Record<string, string>;
  onSelect: (s: SessionMeta) => void;
  onRename: (session: SessionMeta, title: string) => void;
};

function basename(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

export function sessionDisplayTitle(session: SessionMeta, titles: Record<string, string>): string {
  return titles[sessionKey(session)]
    ?? (session.provider === 'claude' ? titles[session.sessionId] : undefined)
    ?? session.title
    ?? basename(session.cwd);
}

export function SessionsList({ items, selectedSessionKey, titles, onSelect, onRename }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  function startEdit(s: SessionMeta, e: React.MouseEvent): void {
    e.stopPropagation();
    setEditingId(sessionKey(s));
    setDraftTitle(sessionDisplayTitle(s, titles));
  }

  function commitEdit(s: SessionMeta): void {
    onRename(s, draftTitle.trim());
    setEditingId(null);
  }

  return (
    <ul style={styles.list}>
      {items.map((s) => {
        const identity = sessionKey(s);
        const isSelected = selectedSessionKey === identity;
        const displayTitle = sessionDisplayTitle(s, titles);
        const isEditing = editingId === identity;
        return (
          <ItemShell
            key={identity}
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
              <span style={styles.providerBadge} data-testid={`provider-badge-${identity}`}>{s.provider.toUpperCase()}</span>
              <span>{new Date(s.startedAt).toLocaleString()} · {Math.round(s.sizeBytes / 1024)}KB</span>
              {isLiveMeta(s) && <LiveTag />}
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
    fontSize: 10,
    color: 'var(--text)',
    display: '-webkit-box' as const,
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden' as const,
    whiteSpace: 'normal' as const,
    lineHeight: 1.35,
    wordBreak: 'break-word' as const,
    fontFamily: 'ui-monospace, monospace',
  },
  itemMeta: {
    fontSize: 10,
    color: 'var(--text-dim)',
    marginTop: 2,
    fontFamily: 'ui-monospace, monospace',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  providerBadge: {
    color: 'var(--edge-trail)',
    letterSpacing: 1,
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
