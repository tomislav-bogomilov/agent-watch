import type { LaidOutEdge } from '../graph/layout';

type Props = {
  edge: LaidOutEdge;
  state: 'idle' | 'drawing' | 'done' | 'pruned';
  progress: number; // 0..1, only used when state==='drawing'
  inSubagent: boolean;
};

export function EdgePath({ edge, state, progress, inSubagent }: Props) {
  const d = curvePath(edge);
  const stroke =
    state === 'pruned'
      ? 'var(--node-pruned)'
      : inSubagent
      ? 'var(--subagent-accent)'
      : state === 'idle'
      ? 'var(--edge-idle)'
      : 'var(--edge-trail)';
  const dashArray = state === 'drawing' ? `${pathLength(edge)}` : undefined;
  const dashOffset = state === 'drawing' ? pathLength(edge) * (1 - progress) : 0;
  const opacity = state === 'pruned' ? 0.35 : state === 'idle' ? 0.85 : 1;
  const strokeWidth = state === 'drawing'
    ? (inSubagent ? 3 : 3.5)
    : state === 'done'
    ? (inSubagent ? 2.5 : 3)
    : (inSubagent ? 2 : 2.5);
  const dasharray = inSubagent && state !== 'drawing' ? '6 4' : dashArray;

  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeDasharray={dasharray}
      strokeDashoffset={dashOffset}
      opacity={opacity}
      filter={state === 'drawing' || state === 'done' ? 'url(#tg-glow)' : undefined}
    />
  );
}

function curvePath(edge: LaidOutEdge): string {
  const mid = (edge.sourceY + edge.targetY) / 2;
  return `M ${edge.sourceX} ${edge.sourceY} C ${edge.sourceX} ${mid}, ${edge.targetX} ${mid}, ${edge.targetX} ${edge.targetY}`;
}

function pathLength(edge: LaidOutEdge): number {
  const dx = edge.targetX - edge.sourceX;
  const dy = edge.targetY - edge.sourceY;
  return Math.sqrt(dx * dx + dy * dy) * 1.15;
}
