import type { Milestone } from '../parse/types';

type Props = { milestone: Milestone | null; onClose: () => void };

export function DetailPanel({ milestone, onClose }: Props) {
  if (!milestone) return null;
  return (
    <aside data-testid="detail-panel" style={styles.panel}>
      <header style={styles.header}>
        <div style={styles.kind}>{milestone.kind.toUpperCase().replace(/_/g, ' ')}</div>
        <button
          onClick={onClose}
          aria-label="close detail panel"
          style={styles.close}
          data-testid="detail-close"
          title="close (Esc)"
        >×</button>
      </header>
      <div style={styles.label}>{milestone.label}</div>
      <div style={styles.summary}>{milestone.summary}</div>
      {milestone.result && (
        <div style={{ ...styles.result, color: milestone.failed ? 'var(--node-failed)' : 'var(--text-dim)' }}>
          {milestone.result}
        </div>
      )}
      {milestone.detail && (
        <pre style={styles.detail}>{milestone.detail}</pre>
      )}
    </aside>
  );
}

const styles = {
  panel: {
    position: 'absolute' as const,
    top: 0, right: 0, bottom: 0,
    width: 420,
    background: 'rgba(5,8,13,0.95)',
    borderLeft: '1px solid var(--edge-idle)',
    boxShadow: '-12px 0 24px rgba(0,0,0,0.4)',
    padding: '16px 18px',
    fontFamily: 'ui-monospace, monospace',
    color: 'var(--text)',
    overflowY: 'auto' as const,
    zIndex: 8,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  kind: { fontSize: 10, letterSpacing: 3, color: 'var(--edge-trail)' },
  close: {
    background: 'transparent', border: '1px solid var(--edge-idle)',
    color: 'var(--text)', cursor: 'pointer',
    padding: '0 8px', fontSize: 14, lineHeight: 1.4,
  },
  label: { fontSize: 13, color: 'var(--edge-trail)', marginBottom: 6 },
  summary: { fontSize: 12, color: 'var(--text)', marginBottom: 8 },
  result: { fontSize: 11, marginBottom: 12, whiteSpace: 'pre-wrap' as const },
  detail: {
    fontSize: 11, color: 'var(--text-dim)',
    whiteSpace: 'pre-wrap' as const, margin: 0,
    background: 'rgba(15,38,50,0.4)', padding: '8px 10px',
    border: '1px solid var(--grid)',
  },
};
