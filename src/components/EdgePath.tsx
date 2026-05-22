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
  const opacity = state === 'pruned' ? 0.5 : 1;
  // Stroke and glow create a clear visual hierarchy:
  //   idle → soft glow, slim line
  //   done → full glow, thicker line (so the visited trail jumps out
  //          even after the pulse animation has stopped)
  //   drawing → animated bold pulse
  const strokeWidth = state === 'drawing'
    ? (inSubagent ? 4.5 : 5)
    : state === 'done'
    ? (inSubagent ? 3.5 : 4.5)
    : (inSubagent ? 2.5 : 3);
  const dasharray = inSubagent && state !== 'drawing' ? '6 4' : dashArray;
  const animatedStyle = state === 'drawing'
    ? { animation: 'tg-edge-pulse 1.2s ease-in-out infinite' }
    : undefined;
  const filterUrl =
    state === 'pruned' ? undefined :
    state === 'idle' ? 'url(#tg-glow-soft)' :
    'url(#tg-glow)';

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
      filter={filterUrl}
      style={animatedStyle}
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
