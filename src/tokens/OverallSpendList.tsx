import { useMemo } from 'react';
import type { ModelSummary } from './aggregate';
import { modelKey } from './aggregate';
import { colorFor } from './palette';
import { formatTokens } from '../util/formatTokens';
import { modelLabel } from './modelLabel';
import { formatUsd, type CostSummary } from './cost';

type Props = { summaries: ModelSummary[]; costs: CostSummary };

export function OverallSpendList({ summaries, costs }: Props) {
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

  const grand = summaries.reduce(
    (acc, s) => ({
      input: acc.input + s.input,
      output: acc.output + s.output,
      cached: acc.cached + s.cached,
      total: acc.total + s.total,
    }),
    { input: 0, output: 0, cached: 0, total: 0 },
  );

  return (
    <div style={styles.list}>
      <div
        data-testid="model-row-all"
        style={{ ...styles.row, borderBottom: '1px solid rgba(110,224,238,0.25)', paddingBottom: 10 }}
      >
        <div style={styles.rowTop}>
          <span style={styles.grandLabel}>ALL MODELS</span>
          <span style={styles.breakdown}>
            IN {formatTokens(grand.input)} · OUT {formatTokens(grand.output)} · CACHED {formatTokens(grand.cached)}
          </span>
          <span style={styles.total}>{formatTokens(grand.total)}</span>
          <span data-testid="model-cost-all" style={styles.costChip}>≈ {formatUsd(costs.total.total)}</span>
        </div>
        <div style={styles.barTrack} aria-hidden>
          <div style={{ ...styles.barSeg, width: '100%', background: 'var(--edge-trail)', opacity: 0.5 }} />
        </div>
      </div>
      {summaries.map((s) => {
        const k = modelKey(s.modelId, s.isSubagent);
        const cost = costs.byModel.get(k);
        const widthPct = maxTotal > 0 ? (s.total / maxTotal) * 100 : 0;
        const inputPct = s.total > 0 ? (s.input / s.total) * widthPct : 0;
        const outputPct = s.total > 0 ? (s.output / s.total) * widthPct : 0;
        const cachedPct = s.total > 0 ? (s.cached / s.total) * widthPct : 0;
        return (
          <div key={k} data-testid={`model-row-${k}`} style={styles.row}>
            <div style={styles.rowTop}>
              <span style={styles.modelName}>
                {modelLabel(s.modelId)}
                {s.isSubagent && <span style={styles.subTag}> · subagent</span>}
              </span>
              <span style={styles.breakdown}>
                IN {formatTokens(s.input)} · OUT {formatTokens(s.output)} · CACHED {formatTokens(s.cached)}
              </span>
              <span style={styles.total}>{formatTokens(s.total)}</span>
              {cost && (
                <span data-testid={`model-cost-${k}`} style={styles.costChip}>≈ {formatUsd(cost.total)}</span>
              )}
            </div>
            <div style={styles.barTrack} aria-hidden>
              <div style={{ ...styles.barSeg, width: `${inputPct}%`,  background: colorFor(k, keys) }} />
              <div style={{ ...styles.barSeg, width: `${outputPct}%`, background: colorFor(k, keys), opacity: 0.65 }} />
              <div style={{ ...styles.barSeg, width: `${cachedPct}%`, background: colorFor(k, keys), opacity: 0.35 }} />
            </div>
            {cost && (
              <div data-testid={`model-cost-breakdown-${k}`} style={styles.costLine}>
                in {formatUsd(cost.input)} · out {formatUsd(cost.output)} · cache r {formatUsd(cost.cacheRead)} · cache w {formatUsd(cost.cacheWrite)}
              </div>
            )}
          </div>
        );
      })}
      {costs.unpricedTokens > 0 && (
        <div data-testid="unpriced-warning" style={styles.unpriced}>
          ⚠ {formatTokens(costs.unpricedTokens)} TOKENS FROM {costs.unpricedModels.length} UNPRICED MODEL{costs.unpricedModels.length === 1 ? '' : 'S'} EXCLUDED
        </div>
      )}
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
  grandLabel: { color: 'var(--edge-trail)', letterSpacing: 1, flexShrink: 0, fontFamily: 'ui-monospace, monospace' },
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
  costChip: {
    color: 'var(--edge-trail)',
    border: '1px solid rgba(0,229,255,0.4)',
    borderRadius: 2,
    padding: '1px 6px',
    flexShrink: 0,
    fontSize: 10,
  },
  costLine: {
    color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 9,
    letterSpacing: 1,
  },
  unpriced: {
    color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 10,
    letterSpacing: 1,
    paddingTop: 4,
  },
};
