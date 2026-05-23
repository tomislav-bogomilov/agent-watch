import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { LayoutResult } from '../graph/layout';
import type { Transform } from '../graph/useCamera';
import { layoutFromMinimapPixel, viewportRectInLayout, isPointInRect, type Point } from './minimapCoords';

type Props = {
  layout: LayoutResult;
  transform: Transform;
  viewport: { width: number; height: number };
  currentLayoutPoint: { x: number; y: number } | null;
  onJump: (layoutPoint: Point) => void;
  onPan: (layoutPoint: Point) => void;
  onZoom: (layoutPoint: Point, k: number) => void;
};

const W = 200;
const H = 140;
const SCALE_MIN = 0.2;
const SCALE_MAX = 8;
// Multiplicative wheel step. ~1.0015^120 ≈ 1.20 per detent on most mice.
const WHEEL_BASE = 1.0015;

export function Minimap({ layout, transform, viewport, currentLayoutPoint, onJump, onPan, onZoom }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<{
    rectOffsetInLayout: Point; // (cursorLayout - rectTopLeft) at drag start
  } | null>(null);
  const draggedRef = useRef(false);

  const sx = W / Math.max(1, layout.width);
  const sy = H / Math.max(1, layout.height);
  const s = Math.min(sx, sy);
  const offX = (W - layout.width * s) / 2;
  const offY = (H - layout.height * s) / 2;

  const rectLayout = viewportRectInLayout(transform, viewport);

  function eventToLayout(e: { clientX: number; clientY: number }): Point | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return layoutFromMinimapPixel(e.clientX - rect.x, e.clientY - rect.y, offX, offY, s);
  }

  function handleClick(e: ReactMouseEvent<SVGSVGElement>) {
    // A drag's pointerup synthesizes a click. Skip it.
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    const layoutPt = eventToLayout(e);
    if (!layoutPt) return;
    onJump(layoutPt);
  }

  function handlePointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    const layoutPt = eventToLayout(e);
    if (!layoutPt) return;
    if (!isPointInRect(layoutPt, rectLayout)) return; // click-to-jump path handles it
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      rectOffsetInLayout: { x: layoutPt.x - rectLayout.x, y: layoutPt.y - rectLayout.y },
    };
  }

  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!dragStateRef.current) return;
    const layoutPt = eventToLayout(e);
    if (!layoutPt) return;
    draggedRef.current = true;
    // New rect top-left in layout space, then center of rect = camera center.
    const nextTopLeft = {
      x: layoutPt.x - dragStateRef.current.rectOffsetInLayout.x,
      y: layoutPt.y - dragStateRef.current.rectOffsetInLayout.y,
    };
    const center = { x: nextTopLeft.x + rectLayout.width / 2, y: nextTopLeft.y + rectLayout.height / 2 };
    onPan(center);
  }

  function handlePointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    if (dragStateRef.current) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragStateRef.current = null;
    }
    // draggedRef stays true until the synthesized click clears it.
  }

  // Wheel handler attached non-passive so we can preventDefault and stop the
  // surrounding canvas from also wheeling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(ev: WheelEvent) {
      ev.preventDefault();
      const rect = svg!.getBoundingClientRect();
      const layoutPt = layoutFromMinimapPixel(ev.clientX - rect.x, ev.clientY - rect.y, offX, offY, s);
      const factor = Math.pow(WHEEL_BASE, -ev.deltaY);
      const nextK = Math.min(SCALE_MAX, Math.max(SCALE_MIN, transform.k * factor));
      onZoom(layoutPt, nextK);
    }
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => { svg.removeEventListener('wheel', onWheel); };
  }, [offX, offY, s, transform.k, onZoom]);

  // Cursor: grab when the cursor sits inside the viewport rect, crosshair
  // elsewhere. Cheap to recompute per render — there's no live mousemove
  // listener for hover; the cursor swaps via inline `style.cursor`. Browsers
  // refresh cursor as the pointer moves over the element so we only need to
  // set the right default; for an extra-correct version we'd track hover.
  const cursorStyle = 'crosshair';

  return (
    <svg
      ref={svgRef}
      data-testid="minimap"
      width={W}
      height={H}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        zIndex: 6,
        background: 'rgba(5,8,13,0.85)',
        border: '1px solid var(--edge-idle)',
        cursor: cursorStyle,
        touchAction: 'none',
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
          x={rectLayout.x}
          y={rectLayout.y}
          width={rectLayout.width}
          height={rectLayout.height}
          fill="none"
          stroke="var(--edge-trail)"
          strokeOpacity={0.6}
          strokeWidth={2 / s}
        />
      </g>
    </svg>
  );
}
