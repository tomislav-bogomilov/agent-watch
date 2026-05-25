import { useEffect, useRef, useState } from 'react';
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
  /** When true, shifts the minimap left by detailPanelWidth + 12 to clear an
   *  open details panel docked at the right edge. Default false. */
  detailPanelOpen?: boolean;
  detailPanelWidth?: number;
};

const W = 200;
const H = 140;
const SCALE_MIN = 0.2;
const SCALE_MAX = 8;
// Multiplicative wheel step. ~1.0015^120 ≈ 1.20 per detent on most mice.
const WHEEL_BASE = 1.0015;

export function Minimap({
  layout, transform, viewport, currentLayoutPoint, onJump, onPan, onZoom,
  detailPanelOpen = false, detailPanelWidth = 0,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    rectOffsetInLayout: Point; // (cursorLayout - rectTopLeft) at drag start
  } | null>(null);
  const draggedRef = useRef(false);
  const transformRef = useRef<Transform>(transform);
  transformRef.current = transform;

  const sx = W / Math.max(1, layout.width);
  const sy = H / Math.max(1, layout.height);
  const s = Math.min(sx, sy);
  const offX = (W - layout.width * s) / 2;
  const offY = (H - layout.height * s) / 2;

  const rectLayout = viewportRectInLayout(transform, viewport);
  const rightOffset = detailPanelOpen ? detailPanelWidth + 12 : 12;

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
    setIsDragging(true);
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
      setIsDragging(false);
    }
    // draggedRef stays true until the synthesized click clears it.
  }

  // Wheel handler attached non-passive so we can preventDefault and stop the
  // surrounding canvas from also wheeling. Reads transform.k from a ref so
  // rapid scrolling doesn't churn the listener (which would risk reading a
  // stale k between React renders).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(ev: WheelEvent) {
      ev.preventDefault();
      const rect = svg!.getBoundingClientRect();
      const layoutPt = layoutFromMinimapPixel(ev.clientX - rect.x, ev.clientY - rect.y, offX, offY, s);
      // Normalize deltaY across deltaMode values so Firefox/Linux (lines) and
      // page-mode events scale consistently with pixel-mode events.
      const LINE_HEIGHT = 40;
      const PAGE_HEIGHT = 800;
      const normalizedDelta = ev.deltaMode === 1 ? ev.deltaY * LINE_HEIGHT
                            : ev.deltaMode === 2 ? ev.deltaY * PAGE_HEIGHT
                            : ev.deltaY;
      const factor = Math.pow(WHEEL_BASE, -normalizedDelta);
      const nextK = Math.min(SCALE_MAX, Math.max(SCALE_MIN, transformRef.current.k * factor));
      onZoom(layoutPt, nextK);
    }
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => { svg.removeEventListener('wheel', onWheel); };
  }, [offX, offY, s, onZoom]);

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
        right: rightOffset,
        bottom: 12,
        zIndex: 6,
        background: [
          'radial-gradient(rgba(0,229,255,0.55) 0.9px, transparent 1.1px) 14px 12px / 60px 70px',
          'radial-gradient(rgba(127,255,212,0.45) 0.8px, transparent 1px) 42px 38px / 70px 60px',
          'radial-gradient(rgba(0,229,255,0.40) 0.7px, transparent 0.9px) 78px 18px / 80px 50px',
          'radial-gradient(rgba(0,229,255,0.28) 0.6px, transparent 0.8px) 4px 8px / 28px 32px',
          'radial-gradient(rgba(127,255,212,0.22) 0.5px, transparent 0.7px) 19px 22px / 34px 40px',
          'radial-gradient(rgba(0,229,255,0.15) 0.4px, transparent 0.5px) 10px 30px / 22px 26px',
          'radial-gradient(ellipse at center, rgba(0,229,255,0.10), transparent 70%)',
          'rgba(5,8,13,0.92)',
        ].join(', '),
        border: '1px solid #00e5ff',
        boxShadow: '0 0 10px rgba(0,229,255,0.55), inset 0 0 10px rgba(0,229,255,0.20)',
        animation: 'mmBreathe 3.5s ease-in-out infinite',
        cursor: isDragging ? 'grabbing' : 'crosshair',
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
            strokeOpacity={0.7}
            strokeWidth={2 / s}
          />
        ))}
        {layout.nodes.map((n) => (
          <circle key={n.id} cx={n.x} cy={n.y} r={3 / s} fill="var(--text-dim)" />
        ))}
        {currentLayoutPoint && (
          <>
            <circle
              cx={currentLayoutPoint.x}
              cy={currentLayoutPoint.y}
              r={5 / s}
              fill="var(--edge-trail)"
              style={{ filter: 'drop-shadow(0 0 4px var(--edge-trail))' }}
            />
            <circle
              cx={currentLayoutPoint.x}
              cy={currentLayoutPoint.y}
              r={5 / s}
              fill="none"
              stroke="var(--edge-trail)"
              strokeWidth={1.5 / s}
              data-testid="minimap-sonar"
            >
              <animate attributeName="r" from={5 / s} to={14 / s} dur="1.6s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" from="0.8" to="0" dur="1.6s" repeatCount="indefinite" />
            </circle>
          </>
        )}
        <rect
          x={rectLayout.x}
          y={rectLayout.y}
          width={rectLayout.width}
          height={rectLayout.height}
          fill="rgba(0,229,255,0.08)"
          stroke="var(--edge-trail)"
          strokeOpacity={0.85}
          strokeWidth={2 / s}
          style={{ filter: 'drop-shadow(0 0 4px rgba(0,229,255,0.6))' }}
        />
      </g>
      {/* Tick graticule — drawn in SVG screen-space (200x140), not in layout space.
          Lives outside the transform group so ticks stay fixed at the minimap edges. */}
      <g pointerEvents="none">
        {/* top edge */}
        <line x1={50}  y1={0}   x2={50}  y2={3}   stroke="#00e5ff" strokeOpacity={0.55} />
        <line x1={75}  y1={0}   x2={75}  y2={3}   stroke="#00e5ff" strokeOpacity={0.55} />
        <line x1={100} y1={0}   x2={100} y2={5}   stroke="#00e5ff" strokeOpacity={0.55} />
        <line x1={125} y1={0}   x2={125} y2={3}   stroke="#00e5ff" strokeOpacity={0.55} />
        <line x1={150} y1={0}   x2={150} y2={3}   stroke="#00e5ff" strokeOpacity={0.55} />
        {/* bottom edge */}
        <line x1={50}  y1={140} x2={50}  y2={137} stroke="#00e5ff" strokeOpacity={0.55} />
        <line x1={75}  y1={140} x2={75}  y2={137} stroke="#00e5ff" strokeOpacity={0.55} />
        <line x1={100} y1={140} x2={100} y2={135} stroke="#00e5ff" strokeOpacity={0.55} />
        <line x1={125} y1={140} x2={125} y2={137} stroke="#00e5ff" strokeOpacity={0.55} />
        <line x1={150} y1={140} x2={150} y2={137} stroke="#00e5ff" strokeOpacity={0.55} />
        {/* left edge */}
        <line x1={0}   y1={35}  x2={3}   y2={35}  stroke="#00e5ff" strokeOpacity={0.55} />
        <line x1={0}   y1={70}  x2={5}   y2={70}  stroke="#00e5ff" strokeOpacity={0.55} />
        <line x1={0}   y1={105} x2={3}   y2={105} stroke="#00e5ff" strokeOpacity={0.55} />
        {/* right edge */}
        <line x1={200} y1={35}  x2={197} y2={35}  stroke="#00e5ff" strokeOpacity={0.55} />
        <line x1={200} y1={70}  x2={195} y2={70}  stroke="#00e5ff" strokeOpacity={0.55} />
        <line x1={200} y1={105} x2={197} y2={105} stroke="#00e5ff" strokeOpacity={0.55} />
      </g>
    </svg>
  );
}
