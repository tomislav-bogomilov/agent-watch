import { memo, type CSSProperties } from 'react';
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

export type EdgeFilterCohort = 'glow' | 'softglow';
export function edgeFilterCohort(state: 'idle' | 'drawing' | 'done' | 'pruned'): EdgeFilterCohort {
  return (state === 'pruned' || state === 'idle') ? 'softglow' : 'glow';
}

export const EdgePath = memo(function EdgePath({ edge, state, progress, inSubagent, freshness = 1 }: Props) {
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
  // Two clear tiers for done edges so the most-recent transition
  // (inbound to the current playhead) reads obviously different from the
  // older trail behind it. Recent stays close to drawing; older fades.
  const isRecentDone = freshness >= 0.95;
  // Tail-done is dramatically demoted so the recent transition (and the
  // active node) are the unambiguous focus. Tail floors at ~0.18 opacity.
  const doneOpacity = isRecentDone ? 0.92 : Math.max(0.18, 0.1 + 0.25 * freshness);
  const opacity =
    state === 'pruned' ? 0.28 :
    state === 'idle' ? 0.55 :
    state === 'done' ? doneOpacity :
    1;
  // Recent-done jumps to a thick stroke (almost matching drawing). Older
  // done edges hold a slim baseline — the visual tail.
  const recentDoneStroke = inSubagent ? 4.5 : 5;
  // Tail strokes are slim; the recent done is more than 2× thicker so it
  // visually pops out of the trail.
  const tailMax = inSubagent ? 2.2 : 2.4;
  const tailMin = inSubagent ? 1.4 : 1.6;
  const doneStroke = isRecentDone
    ? recentDoneStroke
    : tailMin + (tailMax - tailMin) * freshness;
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
  // Glow MUST come from a CSS drop-shadow on the element, not from an SVG
  // <filter> referenced by the `filter=` attribute. SVG filters compute their
  // region as a % of the element bbox; for a perfectly vertical path the bbox
  // has width 0, so 200% × 0 = 0 and the filter output is clipped to nothing.
  // CSS drop-shadow works on the rasterized geometry (stroke included) and is
  // immune to that. Static drop-shadow + opacity keyframe = visible breathing
  // glow with no per-frame paint-shader work.
  const glowFilter =
    state === 'drawing' ? `drop-shadow(0 0 6px var(--edge-trail))`
    : state === 'done' ? `drop-shadow(0 0 4px var(--edge-trail))`
    : state === 'idle' ? `drop-shadow(0 0 1.5px var(--edge-trail))`
    : `drop-shadow(0 0 1px rgba(255,255,255,0.08))`;
  const style: CSSProperties = { filter: glowFilter };
  if (state === 'drawing') style.animation = 'tg-edge-pulse 1.2s ease-in-out infinite';
  else if (state === 'done') style.animation = 'tg-edge-trail 3.2s ease-in-out infinite';
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
      style={style}
    />
  );
});

function curvePath(edge: LaidOutEdge): string {
  const mid = (edge.sourceY + edge.targetY) / 2;
  return `M ${edge.sourceX} ${edge.sourceY} C ${edge.sourceX} ${mid}, ${edge.targetX} ${mid}, ${edge.targetX} ${edge.targetY}`;
}

function pathLength(edge: LaidOutEdge): number {
  const dx = edge.targetX - edge.sourceX;
  const dy = edge.targetY - edge.sourceY;
  return Math.sqrt(dx * dx + dy * dy) * 1.15;
}
