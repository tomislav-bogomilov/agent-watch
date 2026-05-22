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
  centerOn: (pt: { x: number; y: number }, k?: number) => void;
};

export function useCamera({ svgRef, layout, viewport }: Options): CameraApi {
  const [transform, setTransform] = useState<Transform>({ k: 1, x: 0, y: 0 });
  const [follow, setFollow] = useState(true);
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

  const centerOn = useCallback((pt: { x: number; y: number }, k?: number) => {
    const targetK = k ?? Math.max(0.6, transform.k);
    applyTransform(centerOnTransform(pt, viewport, targetK));
  }, [applyTransform, viewport, transform.k]);

  return { transform, follow, setFollow, fit, centerOn };
}
