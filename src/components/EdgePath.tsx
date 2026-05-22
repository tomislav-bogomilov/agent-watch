import type { LaidOutEdge } from '../graph/layout';

type Props = {
  edge: LaidOutEdge;
  state: 'idle' | 'drawing' | 'done' | 'pruned';
  progress: number; // 0..1, only used when state==='drawing'
  inSubagent: boolean;
  // 1.0 = freshest done edge (inbound to current node).
  // <1.0 fades older done edges so the trail reads like a comet tail.
  freshness?: number;
};

export function EdgePath({ edge, state, progress, inSubagent, freshness = 1 }: Props) {
  const d = curvePath(edge);
  // Use the same cyan family for every state so all tracks read as
  // wired-up paths. Differences come from stroke width, opacity, and
  // glow strength.
  const stroke = inSubagent ? 'var(--subagent-accent)' : 'var(--edge-trail)';
  const dashArray = state === 'drawing' ? `${pathLength(edge)}` : undefined;
  const dashOffset = state === 'drawing' ? pathLength(edge) * (1 - progress) : 0;
  // Visual hierarchy:
  //   pruned  → faint, no glow, dashed (failed branch, structural only)
  //   idle    → soft glow, slim line
  //   done    → full glow, thick line (visited trail stays vivid)
  //   drawing → animated bold pulse
  const opacity =
    state === 'pruned' ? 0.32 :
    state === 'idle' ? 0.85 :
    state === 'done' ? Math.max(0.55, freshness) :
    1;
  // Done strokes fade slightly toward the tail (older = slimmer) so the
  // freshest end of the trail visually leads the eye to the playhead.
  const doneStroke = (inSubagent ? 4.5 : 5) - (1 - freshness) * 1.2;
  const strokeWidth = state === 'drawing'
    ? (inSubagent ? 5 : 5.5)
    : state === 'done'
    ? Math.max(inSubagent ? 3 : 3.5, doneStroke)
    : state === 'idle'
    ? (inSubagent ? 2.5 : 3)
    : 2; // pruned
  const dasharray =
    inSubagent && state !== 'drawing' ? '6 4'
    : state === 'pruned' ? '4 5'
    : dashArray;
  const animatedStyle =
    state === 'drawing' ? { animation: 'tg-edge-pulse 1.2s ease-in-out infinite' }
    : state === 'done' ? { animation: 'tg-edge-trail 3.2s ease-in-out infinite' }
    : undefined;
  const filterUrl =
    state === 'pruned' ? 'url(#tg-glow-soft)' :
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
