import type { Milestone } from '../parse/types';
import { ResizeHandle } from './ResizeHandle';

type Props = {
  milestone: Milestone | null;
  onClose: () => void;
  width: number;
  onResize: (delta: number) => void;
};

export function DetailPanel({ milestone, onClose, width, onResize }: Props) {
  if (!milestone) return null;
  return (
    <aside data-testid="detail-panel" style={{ ...styles.panel, width }}>
      <ResizeHandle side="left" onResize={onResize} testId="detail-resize" />
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
      {milestone.usage && (
        <div data-testid="detail-context" style={styles.contextBlock}>
          <div style={styles.contextHead}>CONTEXT</div>
          <ContextRow label="total" value={milestone.contextSize ?? 0} bright />
          <ContextRow label="  input" value={milestone.usage.input} />
          <ContextRow label="  cache read" value={milestone.usage.cacheRead} />
          <ContextRow label="  cache write" value={milestone.usage.cacheCreation} />
          <ContextRow label="  output" value={milestone.usage.output} />
        </div>
      )}
      {milestone.detail && (
        <pre style={styles.detail}>{milestone.detail}</pre>
      )}
    </aside>
  );
}

function ContextRow({ label, value, bright }: { label: string; value: number; bright?: boolean }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto', fontSize: 11,
      color: bright ? 'var(--text)' : 'var(--text-dim)',
      fontFamily: 'ui-monospace, monospace',
    }}>
      <span>{label}</span>
      <span style={{ color: 'var(--text)' }}>{value.toLocaleString('en-US')}</span>
    </div>
  );
}

const styles = {
  panel: {
    position: 'absolute' as const,
    top: 0, right: 0, bottom: 0,
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
  contextBlock: {
    margin: '0 0 12px 0',
    padding: '6px 10px',
    border: '1px solid var(--grid)',
    background: 'rgba(15,38,50,0.4)',
  },
  contextHead: {
    fontSize: 10, letterSpacing: 3,
    color: 'var(--edge-trail)', marginBottom: 4,
  },
};
