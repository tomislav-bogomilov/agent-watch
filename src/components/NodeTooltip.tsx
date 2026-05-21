import type { Milestone } from '../parse/types';

type Props = { milestone: Milestone; x: number; y: number };

export function NodeTooltip({ milestone, x, y }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x + 12,
        top: y + 12,
        maxWidth: 480,
        background: 'rgba(5,8,13,0.95)',
        border: '1px solid var(--edge-idle)',
        padding: '8px 12px',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 12,
        color: 'var(--text)',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <div style={{ color: 'var(--edge-trail)', marginBottom: 4 }}>{milestone.label}</div>
      <div style={{ marginBottom: 4 }}>{milestone.summary}</div>
      {milestone.result && (
        <div style={{ color: milestone.failed ? 'var(--node-failed)' : 'var(--text-dim)', marginBottom: 4 }}>
          {milestone.result}
        </div>
      )}
      {milestone.detail && (
        <pre style={{
          color: 'var(--text-dim)', whiteSpace: 'pre-wrap',
          margin: 0, maxHeight: 260, overflow: 'auto', fontSize: 11,
        }}>
          {milestone.detail.slice(0, 1200)}
        </pre>
      )}
    </div>
  );
}
