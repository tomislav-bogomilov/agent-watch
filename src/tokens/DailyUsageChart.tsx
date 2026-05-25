import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { TokenUsageRow } from '../api/client';
import {
  presetCutoff,
  filterRows,
  densifyDays,
  modelKeysSorted,
  stackData,
  type RangePreset,
  type Metric,
  type DayRow,
} from './aggregate';
import { colorFor } from './palette';
import { formatTokens } from '../util/formatTokens';
import { modelLabel } from './modelLabel';

type Props = {
  rows: TokenUsageRow[];
  projectId: string | 'all';
  preset: RangePreset;
  today: string;
  metric: Metric;
};

type Hover = { day: string; key: string; value: number; cx: number; cy: number } | null;

const MARGIN = { top: 16, right: 16, bottom: 28, left: 56 };
const TOOLTIP_W = 140;
const ISO_OFF_X = 5;
const ISO_OFF_Y = 5;
const LEGEND_H = 32;

const PANEL_BG: React.CSSProperties = {
  background: [
    'radial-gradient(rgba(0,229,255,0.55) 0.9px, transparent 1.1px) 14px 12px / 60px 70px',
    'radial-gradient(rgba(127,255,212,0.45) 0.8px, transparent 1px) 42px 38px / 70px 60px',
    'radial-gradient(rgba(0,229,255,0.40) 0.7px, transparent 0.9px) 78px 18px / 80px 50px',
    'radial-gradient(rgba(0,229,255,0.28) 0.6px, transparent 0.8px) 4px 8px / 28px 32px',
    'radial-gradient(rgba(127,255,212,0.22) 0.5px, transparent 0.7px) 19px 22px / 34px 40px',
    'radial-gradient(rgba(0,229,255,0.15) 0.4px, transparent 0.5px) 10px 30px / 22px 26px',
    'radial-gradient(ellipse at center, rgba(0,229,255,0.10), transparent 70%)',
    'rgba(5,8,13,0.92)',
  ].join(', '),
  border: '1px solid #00e5ff',
  boxShadow: '0 0 10px rgba(0,229,255,0.55), inset 0 0 10px rgba(0,229,255,0.20)',
  animation: 'paneBreathe 3.5s ease-in-out infinite',
};

export function DailyUsageChart({ rows, projectId, preset, today, metric }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(320);
  const [hover, setHover] = useState<Hover>(null);
  const [disabled, setDisabled] = useState<Set<string>>(new Set());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setWidth(Math.max(200, Math.floor(r.width)));
      setHeight(Math.max(160, Math.floor(r.height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setDisabled(new Set());
  }, [projectId, preset]);

  // allKeys is every model key present in the filtered data; activeKeys
  // is the subset to actually stack (legend toggles flip membership).
  const { days, allKeys, activeKeys, data, hasData } = useMemo(() => {
    const cutoff = presetCutoff(preset, today);
    const filtered = filterRows(rows, projectId, cutoff);
    if (filtered.length === 0) {
      return { days: [] as string[], allKeys: [] as string[], activeKeys: [] as string[], data: [] as DayRow[], hasData: false };
    }
    const earliest = filtered.reduce((m, r) => (r.day < m ? r.day : m), filtered[0].day);
    const from = earliest > cutoff ? earliest : cutoff;
    const days = densifyDays(from, today);
    const allKeys = modelKeysSorted(filtered);
    const activeKeys = allKeys.filter((k) => !disabled.has(k));
    const data = stackData(filtered, days, activeKeys, metric);
    return { days, allKeys, activeKeys, data, hasData: true };
  }, [rows, projectId, preset, today, metric, disabled]);

  // SVG height is reduced by LEGEND_H to reserve space for the legend row below.
  const svgHeight = Math.max(160, height - LEGEND_H);

  useEffect(() => {
    setHover(null);
    if (!hasData || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const innerW = Math.max(10, width - MARGIN.left - MARGIN.right);
    // Use svgHeight (not height) so axes fit inside the actual SVG element.
    const innerH = Math.max(10, svgHeight - MARGIN.top - MARGIN.bottom);

    const x = d3.scaleBand<string>()
      .domain(days)
      .range([MARGIN.left, MARGIN.left + innerW])
      .padding(0.2);

    const stacker = d3.stack<DayRow>()
      .keys(activeKeys)
      .value((d, k) => d.values[k] ?? 0);
    const series = stacker(data);

    const maxY = d3.max(series, (s) => d3.max(s, (d) => d[1])) ?? 0;
    const y = d3.scaleLinear()
      .domain([0, Math.max(1, maxY)])
      .nice()
      .range([MARGIN.top + innerH, MARGIN.top]);

    // grid lines
    svg.append('g')
      .attr('transform', `translate(${MARGIN.left},0)`)
      .call(
        d3.axisLeft(y)
          .ticks(4)
          .tickSize(-innerW)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', 'rgba(110,224,238,0.08)');

    // y axis
    svg.append('g')
      .attr('transform', `translate(${MARGIN.left},0)`)
      .call(
        d3.axisLeft(y)
          .ticks(4)
          .tickFormat((d) => formatTokens(d as number))
      )
      .call((g) => {
        g.selectAll('text').attr('fill', 'var(--text-dim)').style('font-family', 'ui-monospace, monospace').style('font-size', '10px');
        g.selectAll('line').attr('stroke', 'rgba(110,224,238,0.25)');
        g.select('.domain').attr('stroke', 'rgba(110,224,238,0.25)');
      });

    // x axis (thinned to ~8 ticks)
    const tickEvery = Math.max(1, Math.ceil(days.length / 8));
    const xTickValues = days.filter((_, i) => i % tickEvery === 0);
    svg.append('g')
      .attr('transform', `translate(0,${MARGIN.top + innerH})`)
      .call(
        d3.axisBottom(x).tickValues(xTickValues).tickFormat((d) => String(d).slice(5))
      )
      .call((g) => {
        g.selectAll('text').attr('fill', 'var(--text-dim)').style('font-family', 'ui-monospace, monospace').style('font-size', '10px');
        g.selectAll('line').attr('stroke', 'rgba(110,224,238,0.25)');
        g.select('.domain').attr('stroke', 'rgba(110,224,238,0.25)');
      });

    // Isometric wireframe bars — drawing order: side polygons, front rects, top polygons.
    // One <g> per series.
    const barsG = svg.append('g');

    // Pass 1: side polygons (drawn first, behind everything)
    series.forEach((s) => {
      const color = colorFor(s.key, allKeys);
      const sideG = barsG.append('g');
      s.forEach((d) => {
        const bx = x(d.data.day) ?? 0;
        const bw = x.bandwidth();
        const yTop = y(d[1]);
        const yBottom = y(d[0]);
        const h = Math.max(0, yBottom - yTop);
        if (h <= 0) return;
        // Side panel: right face of the bar, offset ISO_OFF_X right and ISO_OFF_Y up
        const pts = [
          `${bx + bw},${yTop}`,
          `${bx + bw + ISO_OFF_X},${yTop - ISO_OFF_Y}`,
          `${bx + bw + ISO_OFF_X},${yBottom - ISO_OFF_Y}`,
          `${bx + bw},${yBottom}`,
        ].join(' ');
        sideG.append('polygon')
          .attr('points', pts)
          .attr('fill', color)
          .attr('fill-opacity', 0.08)
          .attr('stroke', color)
          .attr('stroke-width', 1)
          .attr('stroke-opacity', 1);
      });
    });

    // Pass 2: front rects (data-role="bar" goes here only, for test assertion compat)
    const frontG = barsG.append('g');
    series.forEach((s) => {
      const color = colorFor(s.key, allKeys);
      frontG.append('g')
        .selectAll('rect')
        .data(s)
        .join('rect')
        .attr('data-role', 'bar')
        .attr('data-key', s.key)
        .attr('data-day', (d) => d.data.day)
        .attr('x', (d) => x(d.data.day) ?? 0)
        .attr('y', (d) => y(d[1]))
        .attr('height', (d) => Math.max(0, y(d[0]) - y(d[1])))
        .attr('width', x.bandwidth())
        .attr('fill', color)
        .attr('fill-opacity', 0.10)
        .attr('stroke', color)
        .attr('stroke-width', 1.1)
        .attr('stroke-opacity', 1)
        .style('cursor', 'crosshair')
        .on('mouseenter', (_event, d) => {
          const rx = (x(d.data.day) ?? 0) + x.bandwidth() / 2;
          const ry = y(d[1]);
          setHover({ day: d.data.day, key: s.key, value: d[1] - d[0], cx: rx, cy: ry });
        })
        .on('mouseleave', () => setHover(null));
    });

    // Pass 3: top polygons (drawn last, on top)
    series.forEach((s) => {
      const color = colorFor(s.key, allKeys);
      const topG = barsG.append('g');
      s.forEach((d) => {
        const bx = x(d.data.day) ?? 0;
        const bw = x.bandwidth();
        const yTop = y(d[1]);
        const yBottom = y(d[0]);
        const h = Math.max(0, yBottom - yTop);
        if (h <= 0) return;
        // Top face: parallelogram on the top of the bar
        const pts = [
          `${bx},${yTop}`,
          `${bx + ISO_OFF_X},${yTop - ISO_OFF_Y}`,
          `${bx + bw + ISO_OFF_X},${yTop - ISO_OFF_Y}`,
          `${bx + bw},${yTop}`,
        ].join(' ');
        topG.append('polygon')
          .attr('points', pts)
          .attr('fill', color)
          .attr('fill-opacity', 0.15)
          .attr('stroke', color)
          .attr('stroke-width', 1)
          .attr('stroke-opacity', 1);
      });
    });
  }, [hasData, width, svgHeight, days, allKeys, activeKeys, data]);

  function toggleKey(k: string): void {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  return (
    <div ref={containerRef} style={{ ...styles.container, ...PANEL_BG }}>
      {!hasData && <div style={styles.empty}>NO USAGE IN RANGE</div>}
      {hasData && <svg ref={svgRef} width={width} height={svgHeight} />}
      {hover && (() => {
        const flipLeft = hover.cx + 8 + TOOLTIP_W > width;
        const left = flipLeft ? Math.max(0, hover.cx - 8 - TOOLTIP_W) : hover.cx + 8;
        const top = Math.max(0, hover.cy - 36);
        return (
          <div
            data-testid="chart-tooltip"
            style={{ ...styles.tooltip, left, top, width: TOOLTIP_W }}
          >
            <div>{hover.day}</div>
            <div style={{ color: colorFor(hover.key, allKeys) }}>
              {(() => {
                const isSub = hover.key.endsWith('|sub');
                const baseId = isSub ? hover.key.slice(0, -4) : hover.key;
                return isSub ? `${modelLabel(baseId)} · sub` : modelLabel(baseId);
              })()}
            </div>
            <div>{formatTokens(hover.value)}</div>
          </div>
        );
      })()}
      {hasData && allKeys.length > 0 && (
        <div style={styles.legend} data-testid="chart-legend">
          {allKeys.map((k) => {
            const off = disabled.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKey(k)}
                style={{ ...styles.chip, opacity: off ? 0.35 : 1 }}
                data-testid={`legend-chip-${k}`}
                aria-pressed={!off}
              >
                <span style={{ ...styles.swatch, background: colorFor(k, allKeys) }} aria-hidden />
                {(() => {
                  const isSub = k.endsWith('|sub');
                  const baseId = isSub ? k.slice(0, -4) : k;
                  return isSub ? `${modelLabel(baseId)} · sub` : modelLabel(baseId);
                })()}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    position: 'relative' as const,
    minHeight: 200,
    overflow: 'hidden',
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  empty: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-dim)',
    letterSpacing: 3,
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
  },
  tooltip: {
    position: 'absolute' as const,
    background: 'rgba(5,8,13,0.95)',
    border: '1px solid rgba(110,224,238,0.6)',
    color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 10,
    letterSpacing: 1,
    padding: '4px 8px',
    pointerEvents: 'none' as const,
    whiteSpace: 'nowrap' as const,
    zIndex: 4,
  },
  legend: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    pointerEvents: 'auto' as const,
    paddingLeft: MARGIN.left,
    paddingTop: 6,
    paddingBottom: 6,
    borderTop: '1px solid rgba(110,224,238,0.18)',
    height: LEGEND_H,
    boxSizing: 'border-box' as const,
    alignItems: 'center' as const,
  },
  chip: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid rgba(110, 224, 238, 0.4)',
    color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 10,
    letterSpacing: 1,
    padding: '2px 6px',
    cursor: 'pointer' as const,
  },
  swatch: { width: 10, height: 10, display: 'inline-block' as const },
};
