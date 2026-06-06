import { useMemo, useState } from 'react';
import type { PriceTable, TokenUsageRow } from '../api/client';
import {
  costByMonth, costSummary, formatUsd, modelKeysByCost, zeroSplit,
  type CostSplit, type MonthCost,
} from './cost';
import { colorFor } from './palette';
import { modelKeyLabel } from './modelLabel';

type Props = {
  rows: TokenUsageRow[];
  prices: Record<string, PriceTable>;
  bundled: PriceTable;
  todayMonth: string; // YYYY-MM
};

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

export function SpendMatrix({ rows, prices, bundled, todayMonth }: Props) {
  const months = useMemo(() => costByMonth(rows, prices, bundled), [rows, prices, bundled]);
  const summary = useMemo(() => costSummary(rows, prices, bundled), [rows, prices, bundled]);
  const keys = useMemo(() => modelKeysByCost(months), [months]);
  const [pinned, setPinned] = useState<{ key: string; month: string } | null>(null);

  const totalsByKey = useMemo(() => {
    const t = new Map<string, number>();
    for (const m of months) for (const [k, c] of m.byModel) t.set(k, (t.get(k) ?? 0) + c.total);
    return t;
  }, [months]);

  const maxCell = useMemo(() => {
    let max = 0;
    for (const m of months) for (const c of m.byModel.values()) max = Math.max(max, c.total);
    return max;
  }, [months]);

  if (months.length === 0) {
    return <div style={styles.empty}>NO PRICED USAGE IN RANGE</div>;
  }

  const thisMonth = months.find((m) => m.month === todayMonth)?.total ?? zeroSplit();
  const avg = summary.total.total / months.length;
  const topKey = keys[0];
  const topShare = summary.total.total > 0 ? ((totalsByKey.get(topKey) ?? 0) / summary.total.total) * 100 : 0;

  return (
    <div style={styles.wrap} data-testid="spend-matrix">
      <div style={styles.cards}>
        <div style={styles.card} data-testid="spend-card-alltime">
          <div style={styles.cardLabel}>ALL-TIME</div>
          <div style={styles.cardValueMain}>≈ {formatUsd(summary.total.total)}</div>
          <div style={styles.cardSub}>
            in {formatUsd(summary.total.input)} · out {formatUsd(summary.total.output)} · cache {formatUsd(summary.total.cacheRead + summary.total.cacheWrite)}
          </div>
        </div>
        <div style={styles.card} data-testid="spend-card-thismonth">
          <div style={styles.cardLabel}>THIS MONTH</div>
          <div style={styles.cardValueMain}>≈ {formatUsd(thisMonth.total)}</div>
          <div style={styles.cardSub}>
            in {formatUsd(thisMonth.input)} · out {formatUsd(thisMonth.output)} · cache {formatUsd(thisMonth.cacheRead + thisMonth.cacheWrite)}
          </div>
        </div>
        <div style={styles.card} data-testid="spend-card-avg">
          <div style={styles.cardLabel}>AVG / MONTH</div>
          <div style={styles.cardValue}>≈ {formatUsd(avg)}</div>
          <div style={styles.cardSub}>{months.length} month{months.length === 1 ? '' : 's'} of data</div>
        </div>
        <div style={styles.card} data-testid="spend-card-top">
          <div style={styles.cardLabel}>TOP MODEL</div>
          <div style={styles.cardValue}>{modelKeyLabel(topKey)} <span style={styles.cardShare}>{Math.round(topShare)}%</span></div>
          <div style={styles.cardSub}>≈ {formatUsd(totalsByKey.get(topKey) ?? 0)} all-time</div>
        </div>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.thLeft}>MODEL ▼ · MONTH ▶</th>
            {months.map((m) => <th key={m.month} style={styles.th}>{m.month}</th>)}
            <th style={styles.thRight}>Σ</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <MatrixRow
              key={k}
              k={k}
              color={colorFor(k, keys)}
              months={months}
              maxCell={maxCell}
              rowTotal={totalsByKey.get(k) ?? 0}
              pinnedMonth={pinned?.key === k ? pinned.month : null}
              onCellClick={(month) =>
                setPinned(pinned && pinned.key === k && pinned.month === month ? null : { key: k, month })}
            />
          ))}
          <tr>
            <td style={styles.tdLeft}>Σ</td>
            {months.map((m) => <td key={m.month} style={styles.td}>{formatUsd(m.total.total)}</td>)}
            <td style={styles.tdGrand}>≈ {formatUsd(summary.total.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function MatrixRow({ k, color, months, maxCell, rowTotal, pinnedMonth, onCellClick }: {
  k: string;
  color: string;
  months: MonthCost[];
  maxCell: number;
  rowTotal: number;
  pinnedMonth: string | null;
  onCellClick: (month: string) => void;
}) {
  const pinnedSplit: CostSplit | undefined = pinnedMonth
    ? months.find((m) => m.month === pinnedMonth)?.byModel.get(k)
    : undefined;
  return (
    <>
      <tr>
        <td style={styles.tdLeft}>{modelKeyLabel(k)}</td>
        {months.map((m) => {
          const c = m.byModel.get(k);
          if (!c) {
            return <td key={m.month} style={styles.td} data-testid={`spend-cell-${k}-${m.month}`}>—</td>;
          }
          const alpha = maxCell > 0 ? 0.04 + (c.total / maxCell) * 0.22 : 0.04;
          return (
            <td
              key={m.month}
              data-testid={`spend-cell-${k}-${m.month}`}
              onClick={() => onCellClick(m.month)}
              style={{ ...styles.tdCell, background: hexToRgba(color, alpha) }}
            >{formatUsd(c.total)}</td>
          );
        })}
        <td style={styles.tdRight}>{formatUsd(rowTotal)}</td>
      </tr>
      {pinnedMonth && pinnedSplit && (
        <tr>
          <td colSpan={months.length + 2} style={styles.pinCell} data-testid="spend-cell-pin">
            ↳ {pinnedMonth}: in {formatUsd(pinnedSplit.input)} · out {formatUsd(pinnedSplit.output)} · cache r {formatUsd(pinnedSplit.cacheRead)} · cache w {formatUsd(pinnedSplit.cacheWrite)}
          </td>
        </tr>
      )}
    </>
  );
}

const mono = 'ui-monospace, monospace';
const styles = {
  wrap: { display: 'flex' as const, flexDirection: 'column' as const, gap: 12, padding: 12, overflow: 'auto' as const, flex: 1, minHeight: 0 },
  cards: { display: 'flex' as const, gap: 10, flexWrap: 'wrap' as const },
  card: { flex: 1, minWidth: 150, border: '1px solid rgba(0,229,255,0.35)', padding: '8px 10px', fontFamily: mono },
  cardLabel: { fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 },
  cardValueMain: { fontSize: 15, color: 'var(--edge-trail)' },
  cardValue: { fontSize: 13, color: 'var(--text)' },
  cardShare: { color: 'var(--edge-trail)' },
  cardSub: { fontSize: 8, color: 'var(--text-dim)', marginTop: 2 },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontFamily: mono, fontSize: 11 },
  thLeft: { textAlign: 'left' as const, padding: '5px 8px', color: 'var(--text-dim)', fontWeight: 400, letterSpacing: 1, borderBottom: '1px solid rgba(110,224,238,0.18)' },
  th: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--text-dim)', fontWeight: 400, letterSpacing: 1, borderBottom: '1px solid rgba(110,224,238,0.18)' },
  thRight: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--edge-trail)', fontWeight: 400, letterSpacing: 1, borderBottom: '1px solid rgba(110,224,238,0.18)' },
  tdLeft: { textAlign: 'left' as const, padding: '5px 8px', color: 'var(--text)', borderTop: '1px solid rgba(110,224,238,0.08)' },
  td: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--text-dim)', borderTop: '1px solid rgba(110,224,238,0.08)' },
  tdCell: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--text)', borderTop: '1px solid rgba(110,224,238,0.08)', cursor: 'pointer' as const },
  tdRight: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--edge-trail)', borderTop: '1px solid rgba(110,224,238,0.08)' },
  tdGrand: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--edge-trail)', borderTop: '1px solid rgba(110,224,238,0.25)' },
  pinCell: { textAlign: 'left' as const, padding: '2px 8px 6px 20px', color: 'var(--text-dim)', fontSize: 9 },
  empty: { padding: 24, color: 'var(--text-dim)', fontFamily: mono, letterSpacing: 3, fontSize: 11, textAlign: 'center' as const },
};
