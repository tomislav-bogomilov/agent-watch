import { useMemo, useState } from 'react';
import { useTokenUsage } from '../api/hooks';
import {
  presetCutoff,
  filterRows,
  summariesPerModel,
  type RangePreset,
  type Metric,
} from './aggregate';
import { familyOf } from './family';
import { OverallSpendList } from './OverallSpendList';
import { costSummary } from './cost';
import { DailyUsageChart } from './DailyUsageChart';
import { formatPath } from '../util/formatPath';
import type { Family } from './family';

type Props = {
  family: Family;
  preset: RangePreset;
  onPresetChange: (p: RangePreset) => void;
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TokensPage({ family, preset, onPresetChange }: Props) {
  const [projectId, setProjectId] = useState<string | 'all'>('all');
  const [metric, setMetric] = useState<Metric>('total');
  const query = useTokenUsage();
  const today = todayUtc();

  const filtered = useMemo(() => {
    if (!query.data) return [];
    const cutoff = presetCutoff(preset, today);
    const byProjectAndDate = filterRows(query.data.rows, projectId, cutoff);
    if (family === 'all') return byProjectAndDate;
    return byProjectAndDate.filter((r) => familyOf(r.modelId) === family);
  }, [query.data, projectId, preset, family, today]);

  const summaries = useMemo(() => summariesPerModel(filtered), [filtered]);

  const costs = useMemo(
    () => costSummary(filtered, query.data?.prices ?? {}, query.data?.bundledPrices ?? { currency: 'USD' as const, source: 'none', perMTok: {} }),
    [filtered, query.data],
  );

  return (
    <div style={styles.page} data-testid="tokens-page">
      <div style={styles.chrome}>
        <div style={styles.title}>TOKEN USAGE</div>
        <select
          data-testid="tokens-project-filter"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          style={styles.select}
          aria-label="project filter"
        >
          <option value="all">ALL PROJECTS</option>
          {query.data?.projects.map((p) => (
            <option key={p.id} value={p.id}>{formatPath(p.cwd)}</option>
          ))}
        </select>
        <div style={styles.presetGroup}>
          {(['7d', '30d', '90d', 'all'] as RangePreset[]).map((p) => (
            <button
              key={p}
              type="button"
              data-testid={`tokens-preset-${p}`}
              onClick={() => onPresetChange(p)}
              style={{ ...styles.presetBtn, ...(preset === p ? styles.presetBtnOn : null) }}
              aria-pressed={preset === p}
            >{p.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {query.isLoading && <div style={styles.muted}>LOADING…</div>}
      {query.error && (
        <div style={styles.error}>FAILED TO LOAD USAGE: {(query.error as Error).message}</div>
      )}
      {query.data?.unsyncedWarning && (
        <div data-testid="usage-unsynced-warning" style={styles.muted}>⚠ {query.data.unsyncedWarning}</div>
      )}
      {query.data && query.data.projects.length === 0 && (
        <div style={styles.muted}>NO SESSIONS FOUND</div>
      )}
      {query.data && query.data.projects.length > 0 && (
        <>
          <div style={styles.panelTop}>
            <OverallSpendList summaries={summaries} costs={costs} />
          </div>
          <div style={styles.panelBottom}>
            <div style={styles.subHeader}>
              <div style={styles.subTitle}>DAILY USAGE</div>
              <div style={styles.presetGroup}>
                {(['total', 'input', 'output', 'cached'] as Metric[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-testid={`tokens-metric-${m}`}
                    onClick={() => setMetric(m)}
                    style={{ ...styles.presetBtn, ...(metric === m ? styles.presetBtnOn : null) }}
                    aria-pressed={metric === m}
                  >{m.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <div style={styles.chartHost}>
              <DailyUsageChart
                rows={query.data.rows}
                projectId={projectId}
                preset={preset}
                metric={metric}
                today={today}
                family={family}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  page: {
    flex: 1,
    minHeight: 0,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 8,
    padding: '12px 16px',
    overflow: 'hidden' as const,
  },
  chrome: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 12,
    flexShrink: 0,
  },
  title: {
    fontSize: 11,
    letterSpacing: 3,
    color: 'var(--edge-trail)',
    fontFamily: 'ui-monospace, monospace',
  },
  select: {
    background: 'transparent',
    border: '1px solid var(--edge-idle)',
    color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    letterSpacing: 1,
    padding: '4px 8px',
  },
  presetGroup: {
    display: 'flex' as const,
    gap: 6,
    marginLeft: 'auto',
    flexShrink: 0,
  },
  presetBtn: {
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid rgba(110, 224, 238, 0.6)',
    color: 'var(--text)',
    fontSize: 10,
    letterSpacing: 2,
    padding: '4px 10px',
    textTransform: 'uppercase' as const,
    fontFamily: 'ui-monospace, monospace',
    cursor: 'pointer' as const,
  },
  presetBtnOn: {
    background: 'rgba(0,229,255,0.10)',
    color: 'var(--edge-trail)',
    borderColor: 'var(--edge-trail)',
  },
  panelTop: {
    border: '1px solid rgba(0,229,255,0.55)',
    background: 'rgba(5,8,13,0.6)',
    minHeight: 200,
    maxHeight: '40%',
    overflow: 'auto' as const,
    flexShrink: 0,
  },
  panelBottom: {
    border: '1px solid rgba(0,229,255,0.55)',
    background: 'rgba(5,8,13,0.6)',
    flex: 1,
    minHeight: 0,
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  subHeader: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: '8px 12px',
    borderBottom: '1px solid rgba(110,224,238,0.18)',
    flexShrink: 0,
  },
  subTitle: {
    fontSize: 11,
    letterSpacing: 3,
    color: 'var(--edge-trail)',
    fontFamily: 'ui-monospace, monospace',
  },
  chartHost: { flex: 1, minHeight: 0 },
  muted: { padding: 24, color: 'var(--text-dim)', letterSpacing: 4, fontFamily: 'ui-monospace, monospace' },
  error: { padding: 24, color: 'var(--node-failed)', fontFamily: 'ui-monospace, monospace' },
};
