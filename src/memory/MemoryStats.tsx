import type { Insights } from './insights';
import type { MemoryType } from '../api/client';

const TYPE_COLOR: Record<MemoryType, string> = {
  feedback: '#ff9d00', project: '#00e5ff', reference: '#b06cff', user: '#4dffa6',
};
const TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference'];

export function MemoryStats({ insights }: { insights: Insights }) {
  const { composition, brokenLinks, orphans, missingFromIndex, parseErrors, stale, provenance } = insights;
  const max = Math.max(1, ...TYPES.map((t) => composition.byType[t]));

  return (
    <div style={styles.grid} data-testid="memory-stats">
      <div style={styles.box}>
        <div style={styles.h}>COMPOSITION</div>
        <div data-testid="stats-total" style={styles.big}>{composition.total} memories</div>
        {TYPES.map((t) => (
          <div key={t} style={styles.row}>
            <div style={{ ...styles.bar, width: `${(composition.byType[t] / max) * 100}%`, background: TYPE_COLOR[t] }} />
            <span data-testid={`stats-type-${t}`} style={styles.rowLabel}>{t} · {composition.byType[t]}</span>
          </div>
        ))}
        <div style={styles.dim}>{Object.entries(composition.byScope).map(([k, v]) => `${k === 'global' ? 'global' : k}: ${v}`).join(' · ')}</div>
      </div>

      <div style={styles.box}>
        <div style={styles.h}>HEALTH</div>
        <div data-testid="stats-orphans" style={styles.warn}>⚠ {orphans.length} orphans</div>
        <div data-testid="stats-broken" style={styles.warn}>⛓ {brokenLinks.length} broken links</div>
        <div data-testid="stats-missing" style={styles.warn}>☷ {missingFromIndex.length} missing from index</div>
        <div data-testid="stats-parse" style={styles.warn}>✗ {parseErrors.length} parse errors</div>
      </div>

      <div style={styles.box}>
        <div style={styles.h}>STALE (&gt;14d)</div>
        {stale.length === 0 && <div style={styles.dim}>none</div>}
        {stale.slice(0, 8).map((m) => (
          <div key={m.name} style={styles.stale}>{m.name}</div>
        ))}
      </div>

      <div style={styles.box}>
        <div style={styles.h}>PROVENANCE</div>
        {provenance.bySession.length === 0 && <div style={styles.dim}>no origin sessions</div>}
        {provenance.bySession.slice(0, 6).map((s) => (
          <div key={s.sessionId} style={styles.row}>{s.sessionId.slice(0, 8)} · {s.count}</div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  grid: { display: 'grid' as const, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, padding: 16 },
  box: { border: '1px solid rgba(0,229,255,0.22)', borderRadius: 3, padding: 12, background: 'rgba(0,229,255,0.04)' },
  h: { fontSize: 9, letterSpacing: 1, color: 'var(--edge-trail)', marginBottom: 8, textTransform: 'uppercase' as const },
  big: { color: 'var(--text)', fontSize: 14, marginBottom: 8 },
  row: { display: 'flex' as const, alignItems: 'center' as const, gap: 8, margin: '4px 0', color: 'var(--text)', fontSize: 11 },
  bar: { height: 9, borderRadius: 2, minWidth: 2 },
  rowLabel: { whiteSpace: 'nowrap' as const },
  dim: { color: 'var(--text-dim)', fontSize: 10, marginTop: 6 },
  warn: { color: '#ffcf6b', fontSize: 12, margin: '3px 0' },
  stale: { color: '#ffcf6b', fontSize: 11, margin: '2px 0' },
};
