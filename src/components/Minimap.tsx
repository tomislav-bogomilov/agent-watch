import type { MouseEvent } from 'react';
import type { LayoutResult } from '../graph/layout';
import type { Transform } from '../graph/useCamera';

type Props = {
  layout: LayoutResult;
  transform: Transform;
  viewport: { width: number; height: number };
  currentLayoutPoint: { x: number; y: number } | null;
  onJump: (layoutPoint: { x: number; y: number }) => void;
};

const W = 200;
const H = 140;

export function Minimap({ layout, transform, viewport, currentLayoutPoint, onJump }: Props) {
  const sx = W / Math.max(1, layout.width);
  const sy = H / Math.max(1, layout.height);
  const s = Math.min(sx, sy);
  const offX = (W - layout.width * s) / 2;
  const offY = (H - layout.height * s) / 2;

  // Viewport rect in layout coordinates
  const vx = -transform.x / transform.k;
  const vy = -transform.y / transform.k;
  const vw = viewport.width / transform.k;
  const vh = viewport.height / transform.k;

  function handleClick(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.x;
    const py = e.clientY - rect.y;
    const lx = (px - offX) / s;
    const ly = (py - offY) / s;
    onJump({ x: lx, y: ly });
  }

  return (
    <svg
      data-testid="minimap"
      width={W}
      height={H}
      onClick={handleClick}
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        zIndex: 6,
        background: 'rgba(5,8,13,0.85)',
        border: '1px solid var(--edge-idle)',
        cursor: 'crosshair',
      }}
    >
      <g transform={`translate(${offX}, ${offY}) scale(${s})`}>
        {layout.edges.map((e) => (
          <line
            key={`${e.sourceId}->${e.targetId}`}
            x1={e.sourceX}
            y1={e.sourceY}
            x2={e.targetX}
            y2={e.targetY}
            stroke="var(--edge-idle)"
            strokeWidth={2 / s}
          />
        ))}
        {layout.nodes.map((n) => (
          <circle key={n.id} cx={n.x} cy={n.y} r={3 / s} fill="var(--text-dim)" />
        ))}
        {currentLayoutPoint && (
          <circle
            cx={currentLayoutPoint.x}
            cy={currentLayoutPoint.y}
            r={5 / s}
            fill="var(--edge-trail)"
          />
        )}
        <rect
          x={vx}
          y={vy}
          width={vw}
          height={vh}
          fill="none"
          stroke="var(--edge-trail)"
          strokeOpacity={0.6}
          strokeWidth={2 / s}
        />
      </g>
    </svg>
  );
}
