import { useEffect, useMemo, useRef, useState } from 'react';
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
  type SimulationNodeDatum,
} from 'd3-force';
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent } from 'd3-zoom';
import { select } from 'd3-selection';
import type { MemoryRecord, MemoryType } from '../api/client';
import { MemoryHologram } from './MemoryHologram';

const TYPE_COLOR: Record<string, string> = {
  feedback: '#ff9d00', project: '#00e5ff', reference: '#b06cff', user: '#4dffa6',
};
const W = 900, H = 560;
const SCALE_MIN = 0.2, SCALE_MAX = 4;
const FIT_MARGIN = 48;
const FALLBACK_VP = { w: 960, h: 600 }; // used before the container is measured (and in jsdom)

type Node = SimulationNodeDatum & { id: string; type: MemoryType | null };
type Transform = { k: number; x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

function fitTransform(box: Box, vp: { w: number; h: number }): Transform {
  const k = Math.max(SCALE_MIN, Math.min(SCALE_MAX,
    Math.min((vp.w - FIT_MARGIN * 2) / box.w, (vp.h - FIT_MARGIN * 2) / box.h)));
  return {
    k,
    x: (vp.w - k * box.w) / 2 - k * box.x,
    y: (vp.h - k * box.h) / 2 - k * box.y,
  };
}

export function MemoryGraph({ memories, selectedName, onSelect, getBacklinks, knownSessionIds, onJumpToSession, now }: {
  memories: MemoryRecord[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  getBacklinks: (name: string) => string[];
  knownSessionIds: Set<string>;
  onJumpToSession: (sessionId: string) => void;
  now: number;
}) {
  const [openName, setOpenName] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<ReturnType<typeof d3zoom<SVGSVGElement, unknown>> | null>(null);
  const [vp, setVp] = useState(FALLBACK_VP);
  const [t, setT] = useState<Transform>({ k: 1, x: 0, y: 0 });

  const { nodes, edges, box } = useMemo(() => {
    const names = new Set(memories.map((m) => m.name));
    const nodes: Node[] = memories.map((m) => ({ id: m.name, type: m.type }));
    const links = memories.flatMap((m) =>
      m.links.filter((tt) => names.has(tt)).map((tt) => ({ source: m.name, target: tt }))
    );
    const sim = forceSimulation(nodes)
      .force('link', forceLink(links).id((d: any) => d.id).distance(90))
      .force('charge', forceManyBody().strength(-220))
      .force('center', forceCenter(W / 2, H / 2))
      .force('collide', forceCollide(26))
      .stop();
    for (let i = 0; i < 220; i++) sim.tick();
    const pos = new Map(nodes.map((n) => [n.id, { x: n.x ?? W / 2, y: n.y ?? H / 2 }]));

    // Bounding box of node circles + their right-extending labels.
    const NODE_R = 14, CHAR_W = 6;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const p = pos.get(n.id)!;
      minX = Math.min(minX, p.x - NODE_R);
      minY = Math.min(minY, p.y - NODE_R);
      maxX = Math.max(maxX, p.x + 16 + n.id.length * CHAR_W);
      maxY = Math.max(maxY, p.y + NODE_R);
    }
    const box: Box = nodes.length
      ? { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
      : { x: 0, y: 0, w: W, h: H };

    return {
      box,
      nodes: nodes.map((n) => ({ ...n, x: pos.get(n.id)!.x, y: pos.get(n.id)!.y })),
      edges: links.map((l) => {
        const s = pos.get(typeof l.source === 'string' ? l.source : (l.source as Node).id)!;
        const e = pos.get(typeof l.target === 'string' ? l.target : (l.target as Node).id)!;
        return { id: `${(l.source as any).id ?? l.source}-${(l.target as any).id ?? l.target}`, s, e };
      }),
    };
  }, [memories]);

  // Measure the container so the fit transform matches real pixels.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setVp({ w: r.width, h: r.height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Attach d3-zoom (wheel to zoom, drag to pan). Mirrors the session graph's camera.
  useEffect(() => {
    if (!svgRef.current) return;
    const svgSel = select(svgRef.current);
    const zb = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([SCALE_MIN, SCALE_MAX])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        const { k, x, y } = event.transform;
        setT({ k, x, y });
      });
    zoomRef.current = zb;
    svgSel.call(zb);
    return () => { svgSel.on('.zoom', null); };
  }, []);

  // Reset to a fitted view whenever the data set or the viewport changes.
  const fitKey = `${memories.length}:${box.x},${box.y},${box.w},${box.h}:${vp.w}x${vp.h}`;
  const lastFitRef = useRef<string>('');
  useEffect(() => {
    if (!svgRef.current || !zoomRef.current) return;
    if (lastFitRef.current === fitKey) return;
    lastFitRef.current = fitKey;
    const f = fitTransform(box, vp);
    select(svgRef.current).call(zoomRef.current.transform, zoomIdentity.translate(f.x, f.y).scale(f.k));
  }, [fitKey, box, vp]);

  function fitNow() {
    if (!svgRef.current || !zoomRef.current) return;
    const f = fitTransform(box, vp);
    select(svgRef.current).transition().duration(300)
      .call(zoomRef.current.transform, zoomIdentity.translate(f.x, f.y).scale(f.k));
  }

  const openMemory = openName ? memories.find((m) => m.name === openName) ?? null : null;

  if (memories.length === 0) {
    return <div style={{ padding: 24, color: 'var(--text-dim)', letterSpacing: 4 }}>NO MEMORIES</div>;
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <svg ref={svgRef} width="100%" height="100%" data-testid="memory-graph"
        style={{ display: 'block', cursor: 'grab', touchAction: 'none' }}
        onClick={() => setOpenName(null)}>
        <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
          {edges.map((e) => (
            <line key={e.id} data-testid={`graph-edge-${e.id}`} x1={e.s.x} y1={e.s.y} x2={e.e.x} y2={e.e.y}
              stroke="rgba(0,229,255,0.4)" strokeWidth={1} />
          ))}
          {nodes.map((n) => {
            const color = TYPE_COLOR[n.type ?? ''] ?? '#7fb9c4';
            const isSel = n.id === selectedName || n.id === openName;
            return (
              <g key={n.id} data-testid={`graph-node-${n.id}`} transform={`translate(${n.x},${n.y})`}
                onClick={(e) => { e.stopPropagation(); onSelect(n.id); setOpenName(n.id); }}
                style={{ cursor: 'pointer' }}>
                <circle r={isSel ? 14 : 11} fill="rgba(5,8,13,0.9)" stroke={color}
                  strokeWidth={isSel ? 2.5 : 1.5} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
                <text x={16} y={4} fill="var(--text)" fontSize={10} fontFamily="ui-monospace, monospace">{n.id}</text>
              </g>
            );
          })}
        </g>
      </svg>

      <button type="button" data-testid="graph-fit" onClick={fitNow} style={styles.fit}
        title="fit graph to view">FIT</button>

      {openMemory && (
        <MemoryHologram
          memory={openMemory}
          backlinks={getBacklinks(openMemory.name)}
          canJump={!!openMemory.originSessionId && knownSessionIds.has(openMemory.originSessionId)}
          now={now}
          onClose={() => setOpenName(null)}
          onNavigate={(name) => { onSelect(name); setOpenName(name); }}
          onJumpToSession={onJumpToSession}
        />
      )}
    </div>
  );
}

const styles = {
  fit: {
    position: 'absolute' as const, top: 12, left: 12, zIndex: 7,
    background: 'rgba(5,8,13,0.85)', borderWidth: 1, borderStyle: 'solid' as const,
    borderColor: 'rgba(110,224,238,0.6)', color: 'var(--text)', fontSize: 10, letterSpacing: 2,
    padding: '4px 10px', fontFamily: 'ui-monospace, monospace', cursor: 'pointer' as const,
  },
};
