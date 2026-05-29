import { useState } from 'react';
import type { MemoryRecord } from '../api/client';
import { useUpdateMemory, useDeleteMemory } from '../api/hooks';
import { renderBody } from './renderBody';
import { MemoryEditor, type EditorValue } from './MemoryEditor';

const TYPE_COLOR: Record<string, string> = {
  feedback: '#ff9d00', project: '#00e5ff', reference: '#b06cff', user: '#4dffa6',
};

type Props = {
  memory: MemoryRecord;
  knownNames: Set<string>;
  backlinks: string[];
  onNavigate: (name: string) => void;
  onJumpToSession: (sessionId: string) => void;
  knownSessionIds: Set<string>;
};

export function MemoryDetail({ memory, knownNames, backlinks, onNavigate, onJumpToSession, knownSessionIds }: Props) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateMemory();
  const del = useDeleteMemory();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(v: EditorValue) {
    await update.mutateAsync({ scopeKey: memory.scopeKey, name: memory.name, description: v.description, type: v.type, body: v.body });
    setEditing(false);
  }

  if (editing) {
    return (
      <MemoryEditor
        mode="edit"
        initial={{ name: memory.name, description: memory.description, type: memory.type ?? 'project', body: memory.body }}
        knownNames={[...knownNames]}
        onSave={save}
        onCancel={() => setEditing(false)}
        pending={update.isPending}
      />
    );
  }

  return (
    <div style={styles.wrap} data-testid="memory-detail">
      <div style={styles.actions}>
        <button data-testid="memory-edit" style={styles.act} onClick={() => setEditing(true)}>✎ edit</button>
        <button data-testid="memory-delete" style={{ ...styles.act, ...styles.del }} onClick={() => setConfirmDelete(true)}>🗑 delete</button>
      </div>
      <div style={styles.title}>{memory.name}</div>
      <div style={styles.meta}>
        <span style={{ ...styles.badge, color: TYPE_COLOR[memory.type ?? ''] ?? 'var(--text-dim)', borderColor: TYPE_COLOR[memory.type ?? ''] ?? 'var(--edge-idle)' }}>{memory.type ?? 'unknown'}</span>
        {memory.scope.kind === 'global' ? ' global' : ` ${memory.scope.cwd}`}
        {memory.originSessionId && ` · origin ${memory.originSessionId.slice(0, 8)}`}
      </div>
      {memory.parseError && <div style={styles.warn}>⚠ frontmatter parse issue: {memory.parseError}</div>}
      <div style={styles.body}>{renderBody(memory.body, knownNames, onNavigate)}</div>

      <div style={styles.conn}>
        <div style={styles.sec}>CONNECTIONS</div>
        {memory.links.map((l) => (
          <button key={l} data-testid={`conn-out-${l}`} style={styles.pill} onClick={() => onNavigate(l)}>→ {l}</button>
        ))}
        {backlinks.map((b) => (
          <button key={b} data-testid={`conn-back-${b}`} style={styles.pill} onClick={() => onNavigate(b)}>← {b}</button>
        ))}
        {memory.links.length === 0 && backlinks.length === 0 && <span style={styles.dim}>no links</span>}
        {memory.originSessionId && (() => {
          const canJump = knownSessionIds.has(memory.originSessionId);
          return (
            <button
              data-testid="conn-session"
              style={{ ...styles.pill, ...(canJump ? styles.sessionPill : styles.sessionPillDisabled) }}
              disabled={!canJump}
              data-disabled={!canJump ? 'true' : undefined}
              title={canJump ? undefined : 'origin session not found'}
              onClick={canJump ? () => onJumpToSession(memory.originSessionId!) : undefined}
            >⏱ jump to origin session →</button>
          );
        })()}
      </div>

      {confirmDelete && (
        <div style={styles.confirm} data-testid="delete-confirm">
          {backlinks.length > 0 && (
            <div style={styles.warn}>⚠ {backlinks.length} backlink(s) will break: {backlinks.join(', ')}</div>
          )}
          <div>Delete <strong>{memory.name}</strong>?</div>
          <div style={styles.actions}>
            <button data-testid="delete-confirm-yes" style={{ ...styles.act, ...styles.del }} disabled={del.isPending}
              onClick={() => del.mutate({ scopeKey: memory.scopeKey, name: memory.name })}>
              {del.isPending ? 'DELETING…' : 'CONFIRM DELETE'}
            </button>
            <button style={styles.act} onClick={() => setConfirmDelete(false)}>cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { padding: 16 },
  actions: { display: 'flex' as const, gap: 6, float: 'right' as const },
  act: { background: 'transparent', border: '1px solid rgba(0,229,255,0.4)', color: 'var(--text)', borderRadius: 3, padding: '3px 9px', cursor: 'pointer', fontSize: 11 },
  del: { borderColor: 'var(--node-failed)', color: 'var(--node-failed)' },
  title: { fontSize: 16, color: 'var(--edge-trail)', letterSpacing: 1, fontFamily: 'ui-monospace, monospace' },
  meta: { color: 'var(--text-dim)', fontSize: 11, margin: '4px 0 12px' },
  badge: { fontSize: 9, padding: '1px 6px', borderRadius: 8, border: '1px solid', marginRight: 6, textTransform: 'uppercase' as const },
  body: { color: 'var(--text)', lineHeight: 1.5, fontSize: 13 },
  conn: { marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(0,229,255,0.2)' },
  sec: { fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 6 },
  pill: { display: 'inline-block', fontSize: 10, padding: '3px 8px', borderRadius: 10, border: '1px solid rgba(0,229,255,0.4)', color: 'var(--edge-trail)', background: 'transparent', margin: '2px 4px 2px 0', cursor: 'pointer' },
  sessionPill: { borderColor: '#4dffa6', color: '#4dffa6' },
  sessionPillDisabled: { borderColor: 'rgba(77,255,166,0.25)', color: 'rgba(77,255,166,0.35)', cursor: 'not-allowed' as const },
  dim: { color: 'var(--text-dim)', fontSize: 11 },
  warn: { color: 'var(--node-failed)', fontSize: 11, margin: '4px 0' },
  confirm: { marginTop: 14, padding: 12, border: '1px solid var(--node-failed)', borderRadius: 3, color: 'var(--text)', fontSize: 12 },
};
