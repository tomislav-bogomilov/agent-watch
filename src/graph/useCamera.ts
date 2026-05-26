import { useEffect, useRef, useState, useCallback } from 'react';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type D3ZoomEvent } from 'd3-zoom';
import { select } from 'd3-selection';

export type Bounds = { width: number; height: number };
export type Viewport = { width: number; height: number };
export type Transform = { k: number; x: number; y: number };

const SCALE_MIN = 0.2;
const SCALE_MAX = 8;
const PROGRAMMATIC_GUARD_MS = 320;
const TWEEN_MS = 280;

// FOLLOW focus pose: scale fits 9 nodes vertically (NODE_Y_SPACING=110, so
// total span = 9 × 110 = 990 layout units = full viewport height), and the
// playhead sits at 30% from the top so the bottom 70% shows lookahead.
const FOCUS_VISIBLE_NODES = 9;
const NODE_Y_SPACING = 110;
const FOCUS_VERTICAL_RATIO = 0.30;

export function fitTransform(layout: Bounds, viewport: Viewport, margin = 24): Transform {
  const availW = Math.max(1, viewport.width - margin * 2);
  const availH = Math.max(1, viewport.height - margin * 2);
  const k = Math.min(
    availW / Math.max(1, layout.width),
    availH / Math.max(1, layout.height),
    1,
  );
  const x = (viewport.width - layout.width * k) / 2;
  const y = margin;
  return { k, x, y };
}

export function centerOnTransform(
  layoutPoint: { x: number; y: number },
  viewport: Viewport,
  k: number,
): Transform {
  return {
    k,
    x: viewport.width / 2 - layoutPoint.x * k,
    y: viewport.height / 2 - layoutPoint.y * k,
  };
}

export function focusedZoomFor(viewport: Viewport): number {
  const raw = viewport.height / (FOCUS_VISIBLE_NODES * NODE_Y_SPACING);
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, raw));
}

export function focusOnTransform(
  layoutPoint: { x: number; y: number },
  viewport: Viewport,
): Transform {
  const k = focusedZoomFor(viewport);
  return {
    k,
    x: viewport.width / 2 - layoutPoint.x * k,
    y: viewport.height * FOCUS_VERTICAL_RATIO - layoutPoint.y * k,
  };
}

// Initial framing on session load: anchor the root node near the top of the
// viewport at 1:1 zoom so the first ~7 nodes are visible (NODE_Y_SPACING is
// 110, so 6 × 110 = 660 below the root fits inside an 800px-tall canvas with
// padding to spare). Replaces the old fit-the-whole-graph default which made
// large sessions render as tiny dots.
const INITIAL_TOP_PADDING = 80;
const INITIAL_K = 1;

export function initialFrameTransform(
  rootPoint: { x: number; y: number },
  viewport: Viewport,
  k: number = INITIAL_K,
): Transform {
  return {
    k,
    x: viewport.width / 2 - rootPoint.x * k,
    y: INITIAL_TOP_PADDING - rootPoint.y * k,
  };
}

type Options = {
  svgRef: React.RefObject<SVGSVGElement | null>;
  layout: Bounds;
  viewport: Viewport;
};

export type CameraApi = {
  transform: Transform;
  follow: boolean;
  setFollow: (b: boolean) => void;
  fit: () => void;
  frameInitial: (rootPoint: { x: number; y: number }) => void;
  centerOn: (pt: { x: number; y: number }, k?: number, opts?: { animate?: boolean }) => void;
  focusOn: (pt: { x: number; y: number }, opts?: { animate?: boolean }) => void;
};

export function useCamera({ svgRef, layout, viewport }: Options): CameraApi {
  const [transform, setTransform] = useState<Transform>({ k: 1, x: 0, y: 0 });
  // FOLLOW always starts true on each session load. Pan/wheel turns it off
  // ephemerally for the current session; explicit toggle stays in-memory too.
  // No localStorage: prior auto-offs from accidental pans were sticking and
  // hiding the playback follow behavior on subsequent visits.
  const [follow, setFollow] = useState<boolean>(true);
  // Clear any legacy persisted value so users coming from older builds get
  // the new default. Safe no-op if the key is absent.
  useEffect(() => {
    try { localStorage.removeItem('tg.follow'); } catch { /* ignore */ }
  }, []);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const programmaticRef = useRef(false);

  useEffect(() => {
    if (!svgRef.current) return;
    const svgSel = select(svgRef.current);
    const zb = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([SCALE_MIN, SCALE_MAX])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        setTransform({ k: event.transform.k, x: event.transform.x, y: event.transform.y });
        if (!programmaticRef.current && event.sourceEvent) {
          setFollow(false);
        }
      });
    svgSel.call(zb);
    zoomBehaviorRef.current = zb;
    return () => { svgSel.on('.zoom', null); };
  }, [svgRef]);

  const applyTransform = useCallback((t: Transform, animate = true) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    programmaticRef.current = true;
    const svgSel = select(svgRef.current);
    const id = zoomIdentity.translate(t.x, t.y).scale(t.k);
    if (animate) {
      svgSel.transition().duration(TWEEN_MS).call(zoomBehaviorRef.current.transform, id);
    } else {
      svgSel.call(zoomBehaviorRef.current.transform, id);
    }
    setTimeout(() => { programmaticRef.current = false; }, PROGRAMMATIC_GUARD_MS);
  }, [svgRef]);

  const fit = useCallback(() => {
    applyTransform(fitTransform(layout, viewport, 24));
  }, [applyTransform, layout, viewport]);

  const frameInitial = useCallback((rootPoint: { x: number; y: number }) => {
    applyTransform(initialFrameTransform(rootPoint, viewport));
  }, [applyTransform, viewport]);

  const centerOn = useCallback((pt: { x: number; y: number }, k?: number, opts?: { animate?: boolean }) => {
    const targetK = k ?? Math.max(0.6, transform.k);
    const animate = opts?.animate ?? true;
    applyTransform(centerOnTransform(pt, viewport, targetK), animate);
  }, [applyTransform, viewport, transform.k]);

  const focusOn = useCallback((pt: { x: number; y: number }, opts?: { animate?: boolean }) => {
    const animate = opts?.animate ?? true;
    applyTransform(focusOnTransform(pt, viewport), animate);
  }, [applyTransform, viewport]);

  return { transform, follow, setFollow, fit, frameInitial, centerOn, focusOn };
}
