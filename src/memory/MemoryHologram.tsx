import type { MemoryRecord } from '../api/client';

const TYPE_COLOR: Record<string, string> = {
  feedback: '#ff9d00', project: '#00e5ff', reference: '#b06cff', user: '#4dffa6',
};

function scopeLabel(memory: MemoryRecord): string {
  if (memory.scope.kind === 'global') return 'GLOBAL';
  return (memory.scope.cwd.replace(/\\/g, '/').split('/').filter(Boolean).slice(-1)[0] ?? memory.scopeKey).toUpperCase();
}

function ageDays(mtimeMs: number, now: number): number {
  return Math.max(0, Math.floor((now - mtimeMs) / 86_400_000));
}

type Props = {
  memory: MemoryRecord;
  backlinks: string[];
  canJump: boolean;
  now: number;
  onClose: () => void;
  onNavigate: (name: string) => void;
  onJumpToSession: (sessionId: string) => void;
};

/** A TRON-styled "hologram" glance for a memory node in the graph: a little
 *  content (name, type/scope, description) plus relational insights
 *  (links out/in, age, flags) and a jump-to-origin-session affordance. */
export function MemoryHologram({ memory, backlinks, canJump, now, onClose, onNavigate, onJumpToSession }: Props) {
  const color = TYPE_COLOR[memory.type ?? ''] ?? 'var(--text-dim)';
  const orphan = memory.links.length === 0 && backlinks.length === 0;

  return (
    <div style={styles.panel} data-testid="memory-hologram" onClick={(e) => e.stopPropagation()}>
      <div style={styles.header}>
        <span style={styles.label}>// MEMORY</span>
        <button style={styles.close} data-testid="hologram-close" aria-label="close" onClick={onClose}>×</button>
      </div>

      <div style={{ ...styles.name, color }}>{memory.name}</div>
      <div style={styles.meta}>
        <span style={{ ...styles.badge, color, borderColor: color }}>{memory.type ?? 'unknown'}</span>
        <span style={styles.scope}>{scopeLabel(memory)}</span>
      </div>

      {memory.description && <div style={styles.desc}>{memory.description}</div>}

      <div style={styles.divider} />

      <div style={styles.stats}>
        <span title="outgoing links">→{memory.links.length}</span>
        <span title="backlinks">←{backlinks.length}</span>
        <span title="age (days since last change)">◷{ageDays(memory.mtimeMs, now)}d</span>
        {orphan && <span style={styles.warn} title="no links in or out">⚠ orphan</span>}
        <span style={memory.inIndex ? styles.ok : styles.warn} title="presence in MEMORY.md">
          {memory.inIndex ? '✓ indexed' : '☷ no-index'}
        </span>
        {memory.parseError && <span style={styles.warn} title={memory.parseError}>✗ parse</span>}
      </div>

      {memory.links.length > 0 && (
        <div style={styles.links}>
          {memory.links.slice(0, 4).map((l) => (
            <button key={l} style={styles.linkChip} data-testid={`hologram-link-${l}`}
              onClick={() => onNavigate(l)}>→ {l}</button>
          ))}
        </div>
      )}

      {memory.originSessionId && (
        <button
          style={{ ...styles.jump, ...(canJump ? null : styles.jumpDisabled) }}
          data-testid="hologram-jump"
          data-disabled={canJump ? 'false' : 'true'}
          disabled={!canJump}
          title={canJump ? 'open the session that created this memory' : 'origin session not found'}
          onClick={() => { if (canJump) onJumpToSession(memory.originSessionId!); }}
        >⏱ jump to origin session →</button>
      )}
    </div>
  );
}

const styles = {
  panel: {
    position: 'absolute' as const,
    top: 14,
    right: 14,
    width: 290,
    maxWidth: 'calc(100% - 28px)',
    background: 'rgba(5,18,24,0.92)',
    border: '1px solid var(--edge-trail)',
    boxShadow: '0 0 18px rgba(0,229,255,0.35), inset 0 0 24px rgba(0,229,255,0.06)',
    clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
    padding: '10px 12px 12px',
    fontFamily: 'ui-monospace, monospace',
    zIndex: 8,
    backdropFilter: 'blur(2px)',
  },
  header: { display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  label: { fontSize: 9, letterSpacing: 2, color: 'var(--edge-trail)', opacity: 0.85 },
  close: {
    background: 'transparent', border: 'none', color: 'var(--edge-trail)',
    fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: '0 2px',
  },
  name: { fontSize: 13, letterSpacing: 0.5, marginTop: 4, wordBreak: 'break-word' as const },
  meta: { display: 'flex' as const, alignItems: 'center' as const, gap: 8, marginTop: 4 },
  badge: { fontSize: 8, padding: '1px 6px', borderRadius: 8, borderWidth: 1, borderStyle: 'solid' as const, textTransform: 'uppercase' as const },
  scope: { fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)' },
  desc: {
    fontSize: 11, lineHeight: 1.45, color: 'var(--text)', marginTop: 8,
    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' as const,
  },
  divider: { height: 1, background: 'rgba(0,229,255,0.25)', margin: '10px 0 8px' },
  stats: {
    display: 'flex' as const, flexWrap: 'wrap' as const, gap: 10, alignItems: 'center' as const,
    fontSize: 10, color: 'var(--text)',
  },
  ok: { color: '#4dffa6' },
  warn: { color: '#ffcf6b' },
  links: { display: 'flex' as const, flexWrap: 'wrap' as const, gap: 4, marginTop: 8 },
  linkChip: {
    background: 'transparent', border: '1px solid rgba(0,229,255,0.45)', color: 'var(--edge-trail)',
    borderRadius: 10, fontSize: 9, padding: '2px 8px', cursor: 'pointer', fontFamily: 'ui-monospace, monospace',
  },
  jump: {
    display: 'block', width: '100%', marginTop: 10, background: 'rgba(77,255,166,0.08)',
    border: '1px solid #4dffa6', color: '#4dffa6', borderRadius: 3, padding: '5px 8px',
    cursor: 'pointer', fontSize: 10, letterSpacing: 1, fontFamily: 'ui-monospace, monospace',
  },
  jumpDisabled: {
    background: 'transparent', border: '1px solid var(--edge-idle)', color: 'var(--text-dim)',
    cursor: 'not-allowed' as const, opacity: 0.6,
  },
};
