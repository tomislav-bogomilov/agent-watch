import { useMemo } from 'react';
import type { ModelSummary } from './aggregate';
import { modelKey } from './aggregate';
import { colorFor } from './palette';
import { formatTokens } from '../util/formatTokens';

type Props = { summaries: ModelSummary[] };

export function OverallSpendList({ summaries }: Props) {
  const maxTotal = useMemo(
    () => summaries.reduce((m, s) => Math.max(m, s.total), 0),
    [summaries],
  );
  const keys = useMemo(
    () => summaries.map((s) => modelKey(s.modelId, s.isSubagent)),
    [summaries],
  );

  if (summaries.length === 0) {
    return <div style={styles.empty}>NO USAGE IN RANGE</div>;
  }

  return (
    <div style={styles.list}>
      {summaries.map((s) => {
        const k = modelKey(s.modelId, s.isSubagent);
        const widthPct = maxTotal > 0 ? (s.total / maxTotal) * 100 : 0;
        const inputPct = s.total > 0 ? (s.input / s.total) * widthPct : 0;
        const outputPct = s.total > 0 ? (s.output / s.total) * widthPct : 0;
        const cachedPct = s.total > 0 ? (s.cached / s.total) * widthPct : 0;
        return (
          <div key={k} data-testid={`model-row-${k}`} style={styles.row}>
            <div style={styles.rowTop}>
              <span style={styles.modelName}>
                {s.modelId}
                {s.isSubagent && <span style={styles.subTag}> · subagent</span>}
              </span>
              <span style={styles.breakdown}>
                IN {formatTokens(s.input)} · OUT {formatTokens(s.output)} · CACHED {formatTokens(s.cached)}
              </span>
              <span style={styles.total}>{formatTokens(s.total)}</span>
            </div>
            <div style={styles.barTrack} aria-hidden>
              <div style={{ ...styles.barSeg, width: `${inputPct}%`,  background: colorFor(k, keys) }} />
              <div style={{ ...styles.barSeg, width: `${outputPct}%`, background: colorFor(k, keys), opacity: 0.65 }} />
              <div style={{ ...styles.barSeg, width: `${cachedPct}%`, background: colorFor(k, keys), opacity: 0.35 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  list: { display: 'flex' as const, flexDirection: 'column' as const, gap: 10, padding: 12, overflowY: 'auto' as const },
  row: { display: 'flex' as const, flexDirection: 'column' as const, gap: 4 },
  rowTop: {
    display: 'flex' as const,
    alignItems: 'baseline' as const,
    gap: 12,
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
  },
  modelName: { color: 'var(--text)', letterSpacing: 1, flexShrink: 0 },
  subTag: { color: 'var(--text-dim)' },
  breakdown: { color: 'var(--text-dim)', flex: 1, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const },
  total: { color: 'var(--edge-trail)', flexShrink: 0 },
  barTrack: {
    display: 'flex' as const,
    height: 8,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(110,224,238,0.18)',
  },
  barSeg: { height: '100%' },
  empty: {
    padding: 24,
    color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
    letterSpacing: 3,
    fontSize: 11,
    textAlign: 'center' as const,
  },
};
