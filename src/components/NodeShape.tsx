import { memo } from 'react';
import type { LaidOutNode } from '../graph/layout';
import type { MilestoneKind } from '../parse/types';
import { formatTokens } from '../util/formatTokens';

type State = 'idle' | 'active' | 'success' | 'failed' | 'pruned';

type Props = {
  node: LaidOutNode;
  state: State;
  inSubagent: boolean;
  pinned?: boolean;
  showContextBadge?: boolean;
};

function glyphFor(kind: MilestoneKind): string {
  switch (kind) {
    case 'root_prompt': return '>';
    case 'user_followup': return '>';
    case 'assistant_turn': return '·';
    case 'tool_call': return '⚙';
    case 'subagent_spawn': return '⌥';
    case 'completion': return '■';
  }
}

const W = 116;
const H = 32;
const MAX_LABEL_CHARS = 16;

// Per-kind silhouette so every milestone reads at a glance even from afar.
// All shapes are inscribed in the W×H box; the label sits at x=14 to clear
// the cut corners on chevrons / parallelograms.
function shapeFor(kind: MilestoneKind): { d: string; labelX: number } {
  switch (kind) {
    case 'root_prompt':
    case 'user_followup': {
      // Right-pointing chevron (input)
      const c = 10;
      return { d: `M 0,0 H ${W - c} L ${W},${H / 2} L ${W - c},${H} H 0 Z`, labelX: 10 };
    }
    case 'tool_call': {
      // Octagon (chamfered rect — machine-cut TRON tile)
      const c = 7;
      return {
        d: `M ${c},0 H ${W - c} L ${W},${c} V ${H - c} L ${W - c},${H} H ${c} L 0,${H - c} V ${c} Z`,
        labelX: 14,
      };
    }
    case 'subagent_spawn': {
      // Parallelogram (a fork/branch)
      const s = 9;
      return { d: `M ${s},0 H ${W} L ${W - s},${H} H 0 Z`, labelX: 14 };
    }
    case 'completion': {
      // Hexagon (terminal state)
      const c = H / 2;
      return {
        d: `M ${c},0 H ${W - c} L ${W},${H / 2} L ${W - c},${H} H ${c} L 0,${H / 2} Z`,
        labelX: 22,
      };
    }
    case 'assistant_turn':
    default: {
      // Rounded-corner data tile (default thought)
      return { d: `M 4,0 H ${W - 4} Q ${W},0 ${W},4 V ${H - 4} Q ${W},${H} ${W - 4},${H} H 4 Q 0,${H} 0,${H - 4} V 4 Q 0,0 4,0 Z`, labelX: 10 };
    }
  }
}

export const NodeShape = memo(function NodeShape({ node, state, inSubagent, pinned, showContextBadge }: Props) {
  const colors = colorsFor(state, inSubagent, node.milestone.kind);
  const useGlow = state === 'active' || state === 'success';
  const { d, labelX } = shapeFor(node.milestone.kind);

  const fullLabel = `${glyphFor(node.milestone.kind)}  ${node.milestone.label}`;
  const shown = fullLabel.length > MAX_LABEL_CHARS
    ? `${fullLabel.slice(0, MAX_LABEL_CHARS - 1)}…`
    : fullLabel;

  return (
    <g transform={`translate(${node.x - W / 2}, ${node.y - H / 2})`} data-id={node.id} data-state={state} data-kind={node.milestone.kind}>
      <title>{node.milestone.label}</title>
      <path
        d={d}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={state === 'active' ? 2 : state === 'success' ? 1.75 : 1.25}
        filter={useGlow ? 'url(#tg-glow)' : undefined}
        opacity={state === 'pruned' ? 0.35 : 0.97}
        style={state === 'success' ? { animation: 'tg-shimmer 2.4s ease-in-out infinite' } : undefined}
      />
      <text
        x={labelX}
        y={H / 2 + 4}
        fontSize={11}
        fill={colors.text}
        fontFamily="ui-monospace, monospace"
        style={{ pointerEvents: 'none' }}
      >
        {shown}
      </text>
      {state === 'failed' && (
        <circle cx={W - 10} cy={6} r={3.5} fill="var(--node-failed)" filter="url(#tg-glow)" />
      )}
      {pinned && (
        <path
          d={d}
          transform="translate(-3,-3) scale(1.05)"
          fill="none"
          stroke="var(--edge-trail)"
          strokeWidth={1.5}
          style={{ filter: 'url(#tg-glow)' }}
        />
      )}
      {showContextBadge && node.milestone.contextSize != null && (
        <g data-testid="context-badge" transform={`translate(${W - 28}, -8)`} style={{ pointerEvents: 'none' }}>
          <rect
            x={0}
            y={0}
            width={32}
            height={12}
            rx={2}
            ry={2}
            fill="#05080d"
            stroke={colors.stroke}
            strokeWidth={0.75}
            opacity={state === 'pruned' ? 0.45 : 1}
          />
          <text
            x={16}
            y={9}
            textAnchor="middle"
            fontSize={9}
            letterSpacing={0.5}
            fontFamily="ui-monospace, monospace"
            fill={colors.stroke}
            style={{ pointerEvents: 'none' }}
          >
            {formatTokens(node.milestone.contextSize)}
          </text>
        </g>
      )}
    </g>
  );
});

function tintFor(kind: MilestoneKind): { fill: string; accent: string } {
  // Distinct neon tints per kind, on the TRON cyan/violet/teal axis.
  switch (kind) {
    case 'root_prompt':
    case 'user_followup':
      return { fill: '#0a2230', accent: '#5cf2ff' };
    case 'tool_call':
      return { fill: '#0f2e2a', accent: '#7fffd4' };
    case 'subagent_spawn':
      return { fill: '#1a1230', accent: '#9d6cff' };
    case 'completion':
      return { fill: '#0d2a16', accent: '#7fffd4' };
    case 'assistant_turn':
    default:
      return { fill: '#0f2632', accent: '#5cf2ff' };
  }
}

function colorsFor(state: State, inSubagent: boolean, kind: MilestoneKind) {
  const tint = tintFor(kind);
  const subStroke = inSubagent ? 'var(--subagent-accent)' : tint.accent;
  switch (state) {
    case 'idle':
      return { fill: tint.fill, stroke: subStroke, text: 'var(--text)' };
    case 'active':
      return { fill: 'var(--node-active)', stroke: 'var(--node-active)', text: '#001017' };
    case 'success':
      return { fill: tint.fill, stroke: 'var(--node-success)', text: 'var(--node-success)' };
    case 'failed':
      return { fill: tint.fill, stroke: 'var(--node-failed)', text: 'var(--node-failed)' };
    case 'pruned':
      return { fill: 'var(--node-pruned)', stroke: 'var(--node-pruned)', text: 'var(--text-dim)' };
  }
}
