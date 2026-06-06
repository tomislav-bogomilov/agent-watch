import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { PriceTable, TokenUsageRow } from '../api/client';
import {
  costByMonth, costSummary, formatUsd, modelKeysByCost, type MonthCost,
} from './cost';
import { colorFor } from './palette';
import { modelLabel } from './modelLabel';

type Props = {
  rows: TokenUsageRow[];
  prices: Record<string, PriceTable>;
  bundled: PriceTable;
};

export function SpendBars({ rows, prices, bundled }: Props) {
  const months = useMemo(() => costByMonth(rows, prices, bundled), [rows, prices, bundled]);
  const summary = useMemo(() => costSummary(rows, prices, bundled), [rows, prices, bundled]);
  const keys = useMemo(() => modelKeysByCost(months), [months]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const host = hostRef.current;
    if (!svg || !host) return;
    const width = host.clientWidth || 600;
    const height = 180;
    const margin = { top: 8, right: 12, bottom: 22, left: 52 };
    const sel = d3.select(svg);
    sel.selectAll('*').remove();
    sel.attr('width', width).attr('height', height);
    if (months.length === 0) return;

    const x = d3.scaleBand<string>()
      .domain(months.map((m) => m.month))
      .range([margin.left, width - margin.right])
      .padding(0.35);
    const yMax = d3.max(months, (m) => m.total.total) ?? 0;
    const y = d3.scaleLinear()
      .domain([0, yMax || 1]).nice()
      .range([height - margin.bottom, margin.top]);

    for (const m of months) {
      let y0 = 0;
      for (const k of keys) {
        const v = m.byModel.get(k)?.total ?? 0;
        if (v <= 0) continue;
        sel.append('rect')
          .attr('data-role', 'spend-bar')
          .attr('x', x(m.month)!)
          .attr('width', x.bandwidth())
          .attr('y', y(y0 + v))
          .attr('height', Math.max(1, y(y0) - y(y0 + v)))
          .attr('fill', colorFor(k, keys))
          .append('title')
          .text(`${m.month} · ${modelLabel(k.replace(/\|sub$/, ''))}${k.endsWith('|sub') ? ' · sub' : ''}: ${formatUsd(v)}`);
        y0 += v;
      }
      sel.append('text')
        .attr('x', x(m.month)! + x.bandwidth() / 2)
        .attr('y', height - 6)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-dim)')
        .attr('font-size', 9)
        .attr('font-family', 'ui-monospace, monospace')
        .text(m.month);
    }
    for (const t of y.ticks(3)) {
      sel.append('text')
        .attr('x', margin.left - 6)
        .attr('y', y(t) + 3)
        .attr('text-anchor', 'end')
        .attr('fill', 'var(--text-dim)')
        .attr('font-size', 9)
        .attr('font-family', 'ui-monospace, monospace')
        .text(formatUsd(t));
    }
  }, [months, keys]);

  if (months.length === 0) {
    return <div style={styles.empty}>NO PRICED USAGE IN RANGE</div>;
  }

  const monthsDesc = [...months].reverse();
  return (
    <div style={styles.wrap} data-testid="spend-bars">
      <div style={styles.chips}>
        <div style={{ ...styles.chip, ...styles.chipMain }} data-testid="spend-chip-total">
          ALL-TIME <span style={styles.chipVal}>≈ {formatUsd(summary.total.total)}</span>
        </div>
        <div style={styles.chip} data-testid="spend-chip-input">
          INPUT <span style={styles.chipVal}>{formatUsd(summary.total.input)}</span>
        </div>
        <div style={styles.chip} data-testid="spend-chip-output">
          OUTPUT <span style={styles.chipVal}>{formatUsd(summary.total.output)}</span>
        </div>
        <div style={styles.chip} data-testid="spend-chip-cacheread">
          CACHE R <span style={styles.chipVal}>{formatUsd(summary.total.cacheRead)}</span>
        </div>
        <div style={styles.chip} data-testid="spend-chip-cachewrite">
          CACHE W <span style={styles.chipVal}>{formatUsd(summary.total.cacheWrite)}</span>
        </div>
      </div>
      <div ref={hostRef} style={styles.chartHost}>
        <svg ref={svgRef} />
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.thLeft}>MONTH</th>
            <th style={styles.th}>INPUT</th>
            <th style={styles.th}>OUTPUT</th>
            <th style={styles.th}>CACHE R</th>
            <th style={styles.th}>CACHE W</th>
            <th style={styles.thRight}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {monthsDesc.map((m) => (
            <MonthRows
              key={m.month}
              m={m}
              keys={keys}
              expanded={expanded === m.month}
              onToggle={() => setExpanded(expanded === m.month ? null : m.month)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthRows({ m, keys, expanded, onToggle }: {
  m: MonthCost;
  keys: string[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr data-testid={`spend-month-row-${m.month}`} onClick={onToggle} style={styles.bodyRow}>
        <td style={styles.tdLeft}>{m.month}</td>
        <td style={styles.td}>{formatUsd(m.total.input)}</td>
        <td style={styles.td}>{formatUsd(m.total.output)}</td>
        <td style={styles.td}>{formatUsd(m.total.cacheRead)}</td>
        <td style={styles.td}>{formatUsd(m.total.cacheWrite)}</td>
        <td style={styles.tdRight}>≈ {formatUsd(m.total.total)}</td>
      </tr>
      {expanded && keys.filter((k) => m.byModel.has(k)).map((k) => {
        const c = m.byModel.get(k)!;
        return (
          <tr key={k} data-testid={`spend-month-detail-${m.month}-${k}`} style={styles.detailRow}>
            <td style={styles.tdLeftDetail}>
              ↳ {modelLabel(k.replace(/\|sub$/, ''))}{k.endsWith('|sub') ? ' · sub' : ''}
            </td>
            <td style={styles.td}>{formatUsd(c.input)}</td>
            <td style={styles.td}>{formatUsd(c.output)}</td>
            <td style={styles.td}>{formatUsd(c.cacheRead)}</td>
            <td style={styles.td}>{formatUsd(c.cacheWrite)}</td>
            <td style={styles.tdRight}>{formatUsd(c.total)}</td>
          </tr>
        );
      })}
    </>
  );
}

const mono = 'ui-monospace, monospace';
const styles = {
  wrap: { display: 'flex' as const, flexDirection: 'column' as const, gap: 12, padding: 12, overflowY: 'auto' as const, flex: 1, minHeight: 0 },
  chips: { display: 'flex' as const, gap: 8, flexWrap: 'wrap' as const },
  chip: { border: '1px solid rgba(110,224,238,0.18)', padding: '6px 10px', fontFamily: mono, fontSize: 10, letterSpacing: 1, color: 'var(--text-dim)' },
  chipMain: { borderColor: 'rgba(0,229,255,0.55)' },
  chipVal: { color: 'var(--edge-trail)' },
  chartHost: { flexShrink: 0 },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontFamily: mono, fontSize: 11 },
  thLeft: { textAlign: 'left' as const, padding: '5px 8px', color: 'var(--text-dim)', fontWeight: 400, letterSpacing: 1, borderBottom: '1px solid rgba(110,224,238,0.18)' },
  th: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--text-dim)', fontWeight: 400, letterSpacing: 1, borderBottom: '1px solid rgba(110,224,238,0.18)' },
  thRight: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--edge-trail)', fontWeight: 400, letterSpacing: 1, borderBottom: '1px solid rgba(110,224,238,0.18)' },
  bodyRow: { cursor: 'pointer' as const },
  detailRow: {},
  tdLeft: { textAlign: 'left' as const, padding: '5px 8px', color: 'var(--text)' },
  tdLeftDetail: { textAlign: 'left' as const, padding: '3px 8px 3px 20px', color: 'var(--text-dim)' },
  td: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--text-dim)' },
  tdRight: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--edge-trail)' },
  empty: { padding: 24, color: 'var(--text-dim)', fontFamily: mono, letterSpacing: 3, fontSize: 11, textAlign: 'center' as const },
};
