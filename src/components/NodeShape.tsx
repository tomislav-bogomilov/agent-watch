import type { LaidOutNode } from '../graph/layout';

type Props = {
  node: LaidOutNode;
  state: 'idle' | 'active' | 'success' | 'failed' | 'pruned';
  inSubagent: boolean;
};

function glyphFor(kind: LaidOutNode['milestone']['kind']): string {
  switch (kind) {
    case 'root_prompt': return '>';
    case 'user_followup': return '>';
    case 'assistant_turn': return '·';
    case 'tool_call': return '⚙';
    case 'subagent_spawn': return '⌥';
    case 'completion': return '■';
  }
}

export function NodeShape({ node, state, inSubagent }: Props) {
  const w = 110, h = 28;
  const colors = colorsFor(state, inSubagent);

  return (
    <g transform={`translate(${node.x - w / 2}, ${node.y - h / 2})`} data-id={node.id} data-state={state}>
      {state === 'active' || state === 'success' ? (
        <rect width={w} height={h} rx={4} fill={colors.fill} stroke={colors.stroke} strokeWidth={1}
              filter="url(#tg-glow)" opacity={0.95} />
      ) : (
        <rect width={w} height={h} rx={4} fill={colors.fill} stroke={colors.stroke} strokeWidth={1}
              opacity={state === 'pruned' ? 0.35 : 0.95} />
      )}
      <text x={8} y={h / 2 + 4} fontSize={11} fill={colors.text} fontFamily="ui-monospace, monospace">
        {glyphFor(node.milestone.kind)}  {node.milestone.label}
      </text>
      {state === 'failed' && (
        <circle cx={w - 6} cy={6} r={3} fill="var(--node-failed)" filter="url(#tg-glow)" />
      )}
    </g>
  );
}

function colorsFor(state: Props['state'], inSubagent: boolean) {
  const stroke = inSubagent ? 'var(--subagent-accent)' : 'var(--edge-idle)';
  switch (state) {
    case 'idle':
      return { fill: 'var(--node-idle)', stroke, text: 'var(--text)' };
    case 'active':
      return { fill: 'var(--node-active)', stroke: 'var(--node-active)', text: '#001017' };
    case 'success':
      return { fill: 'var(--node-idle)', stroke: 'var(--node-success)', text: 'var(--node-success)' };
    case 'failed':
      return { fill: 'var(--node-idle)', stroke: 'var(--node-failed)', text: 'var(--node-failed)' };
    case 'pruned':
      return { fill: 'var(--node-pruned)', stroke: 'var(--node-pruned)', text: 'var(--text-dim)' };
  }
}
