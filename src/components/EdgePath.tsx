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
  // Done edges cap below 1 so the live 'drawing' transition reads as
  // the brightest line. Freshness (1 = inbound to current playhead) is
  // scaled into the [0.4, 0.78] range — even the freshest visited edge
  // sits noticeably below the drawing edge.
  const doneOpacity = 0.4 + 0.38 * freshness;
  const opacity =
    state === 'pruned' ? 0.32 :
    state === 'idle' ? 0.7 :
    state === 'done' ? doneOpacity :
    1;
  // Done strokes are clearly slimmer than the drawing edge. They also
  // taper with age so the trail thins out the further back you look.
  const doneStrokeMax = inSubagent ? 3.5 : 4;
  const doneStrokeMin = inSubagent ? 2.6 : 3;
  const doneStroke = doneStrokeMin + (doneStrokeMax - doneStrokeMin) * freshness;
  const strokeWidth = state === 'drawing'
    ? (inSubagent ? 5 : 5.5)
    : state === 'done'
    ? doneStroke
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
