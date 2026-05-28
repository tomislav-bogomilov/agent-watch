import { useId, useState } from 'react';
import '../theme/hologram.css';
import type { Milestone, SkillActivation } from '../parse/types';
import type { HologramMetrics } from '../parse/deriveHologramMetrics';
import { useExitAnimation } from './useExitAnimation';
import { formatTokens } from '../util/formatTokens';

export type HologramView = {
  milestone: Milestone;
  mode: 'live' | 'playback';
  metrics: HologramMetrics;
  skills: SkillActivation[];
  skillsTotal: { count: number; totalTokens: number };
};

type Props = {
  view: HologramView;
  panelRect: { x: number; y: number; w: number; h: number };
  connectorPath: string;
  open: boolean;
  onClose: () => void;
};

const SCAN_STEP = 14;

function fmtMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtPct(p: number | null): string {
  if (p === null) return '—';
  return `${Math.round(p * 100)}%`;
}

function fmtDelta(delta: number | null): string {
  if (delta === null) return '';
  const sign = delta >= 0 ? '↗' : '↘';
  const k = Math.abs(delta) >= 1000 ? `${(Math.abs(delta) / 1000).toFixed(1)}k` : `${Math.abs(delta)}`;
  return `${sign} ${delta >= 0 ? '+' : '-'}${k} since prev`;
}

export function HologramPanel({ view, panelRect, connectorPath, open, onClose }: Props) {
  const { mounted, exiting } = useExitAnimation(open, 200);
  const [expanded, setExpanded] = useState(false);
  const filterId = useId();

  if (!mounted) return null;

  const { milestone, mode, metrics, skills, skillsTotal } = view;
  const topSkills = expanded ? skills : skills.slice(0, 5);
  const hiddenSkills = skills.slice(5);
  const hiddenSum = hiddenSkills.reduce((s, x) => s + x.tokenCost, 0);
  const idText = milestone.id.slice(0, 8).toUpperCase();
  const kindText = `// ${milestone.kind.toUpperCase()}`;
  const modeText = mode === 'live' ? 'LIVE' : 'PLAYBACK';

  const w = panelRect.w;

  const showIdleGap = metrics.idleGapMs !== null;
  // Vertical layout — every section uses the same top/bottom padding around
  // its content and divider so the rhythm reads cleanly.
  const SECTION_TOP_PAD = 22;   // divider → first content baseline
  const SECTION_BOTTOM_PAD = 14; // last content baseline → next divider
  const SKILLS_ROW_STEP = 16;

  const HEADER_Y = 10;
  const HEADER_DIVIDER_Y = HEADER_Y + 34;

  const LATENCY_Y = HEADER_DIVIDER_Y + SECTION_TOP_PAD;
  const LATENCY_SUB_Y = LATENCY_Y + 14;
  const LATENCY_DIVIDER_Y = LATENCY_SUB_Y + SECTION_BOTTOM_PAD;

  const IDLE_Y = LATENCY_DIVIDER_Y + SECTION_TOP_PAD;
  const IDLE_DIVIDER_Y = IDLE_Y + SECTION_BOTTOM_PAD;

  const SKILLS_HEAD_Y = (showIdleGap ? IDLE_DIVIDER_Y : LATENCY_DIVIDER_Y) + SECTION_TOP_PAD;
  const SKILLS_FIRST_ROW_Y = SKILLS_HEAD_Y + 10;
  const skillsBlockBottom = SKILLS_FIRST_ROW_Y + SKILLS_ROW_STEP * topSkills.length
    + (hiddenSkills.length > 0 ? SKILLS_ROW_STEP : 0);
  const SKILLS_DIVIDER_Y = skillsBlockBottom + SECTION_BOTTOM_PAD;

  const CACHE_Y = SKILLS_DIVIDER_Y + SECTION_TOP_PAD;
  const CACHE_SUB_Y = CACHE_Y + 16;
  const CACHE_DIVIDER_Y = CACHE_SUB_Y + SECTION_BOTTOM_PAD;

  const CONTEXT_Y = CACHE_DIVIDER_Y + SECTION_TOP_PAD;
  const CONTEXT_DIVIDER_Y = CONTEXT_Y + SECTION_BOTTOM_PAD;

  const TOKENS_LABEL_Y = CONTEXT_DIVIDER_Y + SECTION_TOP_PAD;

  const FOOTER_DIVIDER_Y = TOKENS_LABEL_Y + SECTION_BOTTOM_PAD + 4;
  const FOOTER_TEXT_Y = FOOTER_DIVIDER_Y + 14;
  const panelHeight = FOOTER_TEXT_Y + 8;

  const skillsTotalCost = skills.reduce((s, x) => s + x.tokenCost, 0);
  const pctOfTotal = (cost: number) =>
    skillsTotalCost > 0 ? `${Math.round((cost / skillsTotalCost) * 100)}%` : '0%';

  const latencyBarFill = metrics.latencyMs && metrics.latencyMedianMs > 0
    ? Math.min(1, metrics.latencyMs / (metrics.latencyMedianMs * 2))
    : 0;

  return (
    <g
      data-testid="holo-root"
      transform={`translate(${panelRect.x}, ${panelRect.y})`}
      className={exiting ? 'holo-exiting' : ''}
    >
      <defs>
        <filter id={`${filterId}-soft`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <rect x={-8} y={-8} width={w + 16} height={panelHeight + 16}
            fill="#00e5ff" opacity={0.06} filter={`url(#${filterId}-soft)`} />

      <g className="holo-shell">
        <rect className="holo-frame" x={0} y={0} width={w} height={panelHeight} />
        <path d={`M 0,12 L 0,0 L 12,0`} className="holo-corner-bracket" />
        <path d={`M ${w - 12},0 L ${w},0 L ${w},12`} className="holo-corner-bracket" />
        <path d={`M ${w},${panelHeight - 12} L ${w},${panelHeight} L ${w - 12},${panelHeight}`} className="holo-corner-bracket" />
        <path d={`M 12,${panelHeight} L 0,${panelHeight} L 0,${panelHeight - 12}`} className="holo-corner-bracket" />
        {Array.from({ length: Math.floor(panelHeight / SCAN_STEP) }, (_, i) => (
          <line key={i} x1={0} y1={(i + 1) * SCAN_STEP} x2={w} y2={(i + 1) * SCAN_STEP} className="holo-scan" />
        ))}
      </g>

      <g className="holo-row" style={{ ['--holo-row-delay' as string]: '250ms' }}>
        <rect x={10} y={HEADER_Y} width={w - 20} height={26} fill="rgba(0,229,255,0.10)" />
        <text x={20} y={HEADER_Y + 18} className="holo-id" data-testid="holo-id">{idText}</text>
        <text x={120} y={HEADER_Y + 18} className="holo-kind" data-testid="holo-kind">{kindText}</text>
        <rect x={w - 104} y={HEADER_Y + 5} width={62} height={16} rx={2} className="holo-mode-chip" />
        <text x={w - 73} y={HEADER_Y + 16} className="holo-mode-text" textAnchor="middle" data-testid="holo-mode-chip">{modeText}</text>
        <g
          className="holo-close"
          data-testid="holo-close"
          onClick={onClose}
          transform={`translate(${w - 22}, ${HEADER_Y + 13})`}
        >
          <circle r={9} fill="rgba(5,8,13,0.5)" />
          <text className="holo-close-text" textAnchor="middle" y={4}>×</text>
        </g>
        <line x1={10} y1={HEADER_DIVIDER_Y} x2={w - 10} y2={HEADER_DIVIDER_Y} className="holo-divider" />
      </g>

      <g className="holo-row" style={{ ['--holo-row-delay' as string]: '310ms' }}>
        <text x={20} y={LATENCY_Y} className="holo-label">LATENCY</text>
        <text x={240} y={LATENCY_Y} className="holo-value" textAnchor="end" data-testid="holo-latency-value">
          {fmtMs(metrics.latencyMs)}
        </text>
        <rect x={250} y={LATENCY_Y - 7} width={w - 270} height={8} rx={1} fill="var(--holo-bar-bg)" />
        <rect x={250} y={LATENCY_Y - 7} width={(w - 270) * latencyBarFill} height={8} rx={1} fill="var(--holo-cyan)" />
        <text x={250} y={LATENCY_SUB_Y} className="holo-value-sub" data-testid="holo-latency-sub">
          {metrics.latencyMedianMs > 0 ? `vs ${(metrics.latencyMedianMs / 1000).toFixed(1)}s median` : '—'}
        </text>
        <line x1={10} y1={LATENCY_DIVIDER_Y} x2={w - 10} y2={LATENCY_DIVIDER_Y} className="holo-divider" />
      </g>

      {showIdleGap && (
        <g className="holo-row" style={{ ['--holo-row-delay' as string]: '370ms' }}>
          <text x={20} y={IDLE_Y} className="holo-label">IDLE GAP</text>
          <text x={240} y={IDLE_Y} className="holo-value" textAnchor="end" data-testid="holo-idle-value">
            {fmtMs(metrics.idleGapMs)}
          </text>
          <text x={250} y={IDLE_Y} className="holo-value-sub">since prev turn</text>
          <line x1={10} y1={IDLE_DIVIDER_Y} x2={w - 10} y2={IDLE_DIVIDER_Y} className="holo-divider" />
        </g>
      )}

      <g className="holo-row" style={{ ['--holo-row-delay' as string]: '430ms' }}>
        <text x={20} y={SKILLS_HEAD_Y} className="holo-label">SKILLS LOADED</text>
        <text x={w - 10} y={SKILLS_HEAD_Y} className="holo-kind" textAnchor="end">
          {skillsTotal.count} · {formatTokens(skillsTotal.totalTokens)}
        </text>

        {topSkills.map((s, i) => {
          const y = SKILLS_FIRST_ROW_Y + i * SKILLS_ROW_STEP;
          return (
            <g key={s.name + s.activatedAt} transform={`translate(20, ${y})`} data-testid={`holo-skill-row-${i}`}>
              <text x={0} y={11} className="holo-skill-name">{s.name}</text>
              <text x={w - 78} y={11} className="holo-skill-tokens" textAnchor="end">
                {formatTokens(s.tokenCost)}
              </text>
              <text x={w - 30} y={11} className="holo-skill-tokens" textAnchor="end">
                {pctOfTotal(s.tokenCost)}
              </text>
            </g>
          );
        })}

        {hiddenSkills.length > 0 && (
          <g
            transform={`translate(20, ${SKILLS_FIRST_ROW_Y + topSkills.length * SKILLS_ROW_STEP})`}
            data-testid="holo-skill-expand"
            onClick={() => setExpanded((v) => !v)}
          >
            <rect x={0} y={0} width={w - 40} height={14} rx={2} className="holo-expand-row" />
            <text x={8} y={10} className="holo-expand-text">
              {expanded ? '▲  collapse' : `▼  ${hiddenSkills.length} more`}
            </text>
            {hiddenSum > 0 && (
              <text x={w - 50} y={10} className="holo-skill-tokens" textAnchor="end">
                {formatTokens(hiddenSum)}
              </text>
            )}
          </g>
        )}

        <line x1={10} y1={SKILLS_DIVIDER_Y} x2={w - 10} y2={SKILLS_DIVIDER_Y} className="holo-divider" />
      </g>

      <g className="holo-row" style={{ ['--holo-row-delay' as string]: '490ms' }}>
        <text x={20} y={CACHE_Y} className="holo-label">CACHE EFFICIENCY</text>
        <text x={w - 10} y={CACHE_Y} className="holo-value" textAnchor="end">{fmtPct(metrics.cacheEfficiency)}</text>
        <text x={20} y={CACHE_SUB_Y} className="holo-value-sub">
          {metrics.cacheReads !== null
            ? `cache reads ${formatTokens(metrics.cacheReads)} · misses ${formatTokens(metrics.cacheMisses ?? 0)}`
            : '—'}
        </text>
        <line x1={10} y1={CACHE_DIVIDER_Y} x2={w - 10} y2={CACHE_DIVIDER_Y} className="holo-divider" />
      </g>

      <g className="holo-row" style={{ ['--holo-row-delay' as string]: '550ms' }}>
        <text x={20} y={CONTEXT_Y} className="holo-label">CONTEXT</text>
        <text x={90} y={CONTEXT_Y} className="holo-value-sub" fill="var(--holo-mint)">
          {fmtDelta(metrics.contextDeltaSincePrev)}
        </text>
        <text x={w - 10} y={CONTEXT_Y} className="holo-value" textAnchor="end" data-testid="holo-context-value">
          {metrics.contextSize !== null ? `${(metrics.contextSize / 1000).toFixed(1)}k` : '—'}
        </text>
        <line x1={10} y1={CONTEXT_DIVIDER_Y} x2={w - 10} y2={CONTEXT_DIVIDER_Y} className="holo-divider" />
      </g>

      <g className="holo-row" style={{ ['--holo-row-delay' as string]: '610ms' }}>
        <text x={20} y={TOKENS_LABEL_Y} className="holo-label">TOKENS</text>
        {metrics.tokens && (() => {
          // Four labeled values spaced evenly across the row after the label.
          const labels: Array<['IN', keyof NonNullable<typeof metrics.tokens>]
                            | ['CR', keyof NonNullable<typeof metrics.tokens>]
                            | ['CW', keyof NonNullable<typeof metrics.tokens>]
                            | ['OUT', keyof NonNullable<typeof metrics.tokens>]> = [
            ['IN', 'input'],
            ['CR', 'cacheRead'],
            ['CW', 'cacheCreation'],
            ['OUT', 'output'],
          ];
          const startX = 80;
          const span = (w - 20) - startX;
          const step = span / labels.length;
          return labels.map(([label, key], i) => {
            const cx = startX + i * step;
            return (
              <g key={label}>
                <text x={cx} y={TOKENS_LABEL_Y} className="holo-label-dim">{label}</text>
                <text x={cx + 22} y={TOKENS_LABEL_Y} className="holo-skill-tokens">
                  {formatTokens(metrics.tokens![key])}
                </text>
              </g>
            );
          });
        })()}
      </g>

      <g className="holo-row" style={{ ['--holo-row-delay' as string]: '670ms' }}>
        <line x1={10} y1={FOOTER_DIVIDER_Y} x2={w - 10} y2={FOOTER_DIVIDER_Y} className="holo-divider-faint" />
        <text x={20} y={FOOTER_TEXT_Y} className="holo-label-dim">
          {milestone.timestamp ? new Date(milestone.timestamp).toISOString().slice(11, 23) : '—'}
        </text>
        <text x={w - 10} y={FOOTER_TEXT_Y} className="holo-kind" textAnchor="end">► STREAM</text>
      </g>

      <g transform={`translate(${-panelRect.x}, ${-panelRect.y})`}>
        <path d={connectorPath} className="holo-conn-line holo-line"
              data-testid="holo-conn-path"
              style={{ strokeDasharray: '4 3' }} />
      </g>
    </g>
  );
}
