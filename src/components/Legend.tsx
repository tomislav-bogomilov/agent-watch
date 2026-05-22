import { useState } from 'react';

type RowProps = { swatchFill: string; stroke: string; label: string; dashed?: boolean };

function Row({ swatchFill, stroke, label, dashed }: RowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
      <div
        style={{
          width: 22,
          height: 10,
          background: swatchFill,
          border: `1px ${dashed ? 'dashed' : 'solid'} ${stroke}`,
        }}
      />
      <span>{label}</span>
    </div>
  );
}

export function Legend() {
  const [open, setOpen] = useState(true);
  return (
    <div data-testid="legend" style={styles.box}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={styles.header}
        aria-label="toggle legend"
        data-testid="legend-toggle"
        title="toggle legend (?)"
      >
        LEGEND {open ? '▾' : '▸'}
      </button>
      {open && (
        <div style={styles.body}>
          <Row swatchFill="var(--node-idle)" stroke="var(--edge-idle)" label="idle" />
          <Row swatchFill="var(--node-active)" stroke="var(--node-active)" label="active" />
          <Row swatchFill="var(--node-idle)" stroke="var(--node-success)" label="success" />
          <Row swatchFill="var(--node-idle)" stroke="var(--node-failed)" label="failed" />
          <Row swatchFill="var(--node-pruned)" stroke="var(--node-pruned)" label="pruned (dimmed)" />
          <Row swatchFill="transparent" stroke="var(--subagent-accent)" label="subagent" dashed />
        </div>
      )}
    </div>
  );
}

const styles = {
  box: {
    position: 'absolute' as const,
    left: 12,
    bottom: 12,
    zIndex: 6,
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid var(--edge-idle)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    color: 'var(--text)',
  },
  header: {
    width: '100%',
    padding: '4px 10px',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid var(--edge-idle)',
    color: 'var(--edge-trail)',
    letterSpacing: 2,
    fontSize: 10,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
  },
  body: { padding: '6px 10px' },
};
