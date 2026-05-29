import { useEffect, useMemo, useRef, useState } from 'react';
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent } from 'd3-zoom';
import { select } from 'd3-selection';
import type { MemoryRecord, MemoryType } from '../api/client';
import { MemoryHologram } from './MemoryHologram';

const TYPE_COLOR: Record<string, string> = {
  feedback: '#ff9d00', project: '#00e5ff', reference: '#b06cff', user: '#4dffa6',
};
const SCALE_MIN = 0.15, SCALE_MAX = 4;
const FIT_MARGIN = 56;
const FALLBACK_VP = { w: 960, h: 600 };

// Panel chrome
const HEADER_H = 18, PAD = 16, GAP = 44, NODE_R = 14, CHAR_W = 6;
const GLOBAL_BORDER = 'rgba(176,108,255,0.55)', GLOBAL_HEADER = 'rgba(176,108,255,0.14)', GLOBAL_CAP = '#d6bbff';
const PROJ_BORDER = 'rgba(0,229,255,0.55)', PROJ_HEADER = 'rgba(0,229,255,0.12)', PROJ_CAP = '#9fe9f5';

type Transform = { k: number; x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

type LaidNode = { id: string; type: MemoryType | null; scopeKey: string; x: number; y: number };
type Panel = { scopeKey: string; label: string; count: number; isGlobal: boolean; x: number; y: number; w: number; h: number };
type LaidEdge = { id: string; s: { x: number; y: number }; e: { x: number; y: number }; cross: boolean };

function projectLabel(m: MemoryRecord): string {
  if (m.scope.kind === 'global') return 'GLOBAL';
  return (m.scope.cwd.replace(/\\/g, '/').split('/').filter(Boolean).slice(-1)[0] ?? m.scopeKey).toUpperCase();
}

function fitTransform(box: Box, vp: { w: number; h: number }): Transform {
  const k = Math.max(SCALE_MIN, Math.min(SCALE_MAX,
    Math.min((vp.w - FIT_MARGIN * 2) / box.w, (vp.h - FIT_MARGIN * 2) / box.h)));
  return { k, x: (vp.w - k * box.w) / 2 - k * box.x, y: (vp.h - k * box.h) / 2 - k * box.y };
}

/** Lay a project's nodes out on an even grid that fills the panel uniformly.
 *  Most memories aren't linked to each other, so a force sim just clumps them
 *  and overlaps their long labels; a grid distributes evenly and guarantees no
 *  label collision. Column width is sized to the widest label in the group, and
 *  the column count targets a roughly 1.3:1 panel so it isn't a thin strip. */
const CELL_H = 48;
function layoutGroup(ids: string[]) {
  const n = ids.length;
  const labelW = Math.max(40, ...ids.map((id) => 16 + id.length * CHAR_W));
  const cellW = labelW + 26;
  const cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt((n * CELL_H * 1.3) / cellW))));
  const rows = Math.ceil(n / cols);
  const pos = new Map<string, { x: number; y: number }>();
  ids.forEach((id, i) => {
    pos.set(id, { x: (i % cols) * cellW, y: Math.floor(i / cols) * CELL_H + CELL_H / 2 });
  });
  return {
    pos,
    bbox: { x: -NODE_R, y: 0, w: (cols - 1) * cellW + labelW + NODE_R, h: rows * CELL_H },
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
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<ReturnType<typeof d3zoom<SVGSVGElement, unknown>> | null>(null);
  const [vp, setVp] = useState(FALLBACK_VP);
  const [t, setT] = useState<Transform>({ k: 1, x: 0, y: 0 });

  // Stable list of all groups (for the filter), independent of what's hidden.
  const allGroups = useMemo(() => {
    const map = new Map<string, { scopeKey: string; label: string; isGlobal: boolean; count: number }>();
    for (const m of memories) {
      if (!map.has(m.scopeKey)) {
        map.set(m.scopeKey, { scopeKey: m.scopeKey, label: projectLabel(m), isGlobal: m.scope.kind === 'global', count: 0 });
      }
      map.get(m.scopeKey)!.count += 1;
    }
    return [...map.values()].sort((a, b) =>
      a.isGlobal === b.isGlobal ? a.label.localeCompare(b.label) : a.isGlobal ? -1 : 1);
  }, [memories]);

  const { nodes, panels, edges, box } = useMemo(() => {
    const visible = memories.filter((m) => !hidden.has(m.scopeKey));
    const names = new Set(visible.map((m) => m.name));

    // group members
    const members = new Map<string, MemoryRecord[]>();
    for (const m of visible) {
      if (!members.has(m.scopeKey)) members.set(m.scopeKey, []);
      members.get(m.scopeKey)!.push(m);
    }
    const orderedKeys = allGroups.map((g) => g.scopeKey).filter((k) => members.has(k));

    // lay out each group locally, size its panel
    const laidNodes: LaidNode[] = [];
    const panels: Panel[] = [];
    let cx = 0, cy = 0, rowH = 0;
    const targetRowW = Math.max(720, Math.sqrt(visible.length) * 320);
    for (const key of orderedKeys) {
      const recs = members.get(key)!;
      const ids = recs.map((r) => r.name);
      const { pos, bbox } = layoutGroup(ids);
      const w = bbox.w + PAD * 2;
      const h = bbox.h + HEADER_H + PAD * 2;
      if (cx > 0 && cx + w > targetRowW) { cx = 0; cy += rowH + GAP; rowH = 0; }
      const px = cx, py = cy;
      const g0 = allGroups.find((g) => g.scopeKey === key)!;
      panels.push({ scopeKey: key, label: g0.label, count: recs.length, isGlobal: g0.isGlobal, x: px, y: py, w, h });
      for (const r of recs) {
        const p = pos.get(r.name)!;
        laidNodes.push({
          id: r.name, type: r.type, scopeKey: key,
          x: px + PAD + (p.x - bbox.x), y: py + HEADER_H + PAD + (p.y - bbox.y),
        });
      }
      cx += w + GAP; rowH = Math.max(rowH, h);
    }

    const posByName = new Map(laidNodes.map((n) => [n.id, n]));
    const edges: LaidEdge[] = visible.flatMap((m) =>
      m.links.filter((tt) => names.has(tt)).map((tt) => {
        const s = posByName.get(m.name)!, e = posByName.get(tt)!;
        return { id: `${m.name}-${tt}`, s: { x: s.x, y: s.y }, e: { x: e.x, y: e.y }, cross: s.scopeKey !== e.scopeKey };
      }));

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of panels) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.w); maxY = Math.max(maxY, p.y + p.h);
    }
    const box: Box = panels.length
      ? { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
      : { x: 0, y: 0, w: FALLBACK_VP.w, h: FALLBACK_VP.h };

    return { nodes: laidNodes, panels, edges, box };
  }, [memories, hidden, allGroups]);

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

  const fitKey = `${nodes.length}:${box.x},${box.y},${box.w},${box.h}:${vp.w}x${vp.h}`;
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

  function toggleGroup(scopeKey: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(scopeKey)) next.delete(scopeKey); else next.add(scopeKey);
      return next;
    });
  }

  const openMemory = openName ? memories.find((m) => m.name === openName) ?? null : null;
  const visibleGroupCount = allGroups.length - allGroups.filter((g) => hidden.has(g.scopeKey)).length;

  if (memories.length === 0) {
    return <div style={{ padding: 24, color: 'var(--text-dim)', letterSpacing: 4 }}>NO MEMORIES</div>;
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <svg ref={svgRef} width="100%" height="100%" data-testid="memory-graph"
        style={{ display: 'block', cursor: 'grab', touchAction: 'none' }}
        onClick={() => setOpenName(null)}>
        <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
          {panels.map((p) => (
            <g key={p.scopeKey} data-testid={`graph-panel-${p.scopeKey}`}>
              <path
                d={`M${p.x} ${p.y} H${p.x + p.w} V${p.y + p.h - 12} L${p.x + p.w - 12} ${p.y + p.h} H${p.x} Z`}
                fill={p.isGlobal ? 'rgba(176,108,255,0.04)' : 'rgba(0,229,255,0.035)'}
                stroke={p.isGlobal ? GLOBAL_BORDER : PROJ_BORDER} strokeWidth={1} />
              <rect x={p.x} y={p.y} width={p.w} height={HEADER_H} fill={p.isGlobal ? GLOBAL_HEADER : PROJ_HEADER} />
              <text x={p.x + 8} y={p.y + 13} fill={p.isGlobal ? GLOBAL_CAP : PROJ_CAP}
                fontSize={10} letterSpacing={2} fontFamily="ui-monospace, monospace">{p.label} · {p.count}</text>
            </g>
          ))}
          {edges.map((e) => (
            <line key={e.id} data-testid={`graph-edge-${e.id}`} x1={e.s.x} y1={e.s.y} x2={e.e.x} y2={e.e.y}
              stroke={e.cross ? '#6ee0ee' : 'rgba(0,229,255,0.4)'} strokeWidth={1}
              strokeDasharray={e.cross ? '5 4' : undefined} opacity={e.cross ? 0.7 : 1} />
          ))}
          {nodes.map((n) => {
            const color = TYPE_COLOR[n.type ?? ''] ?? '#7fb9c4';
            const isSel = n.id === selectedName || n.id === openName;
            return (
              <g key={n.id} data-testid={`graph-node-${n.id}`} transform={`translate(${n.x},${n.y})`}
                onClick={(ev) => { ev.stopPropagation(); onSelect(n.id); setOpenName(n.id); }}
                style={{ cursor: 'pointer' }}>
                <circle r={isSel ? 14 : 11} fill="rgba(5,8,13,0.9)" stroke={color}
                  strokeWidth={isSel ? 2.5 : 1.5} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
                <text x={16} y={4} fill="var(--text)" fontSize={10} fontFamily="ui-monospace, monospace">{n.id}</text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Project filter — collapsed pill that expands into toggle chips */}
      <div style={styles.filterWrap}>
        {!filterOpen ? (
          <button type="button" data-testid="graph-filter" style={styles.pill} onClick={() => setFilterOpen(true)}>
            ▸ PROJECTS · {visibleGroupCount}/{allGroups.length}
          </button>
        ) : (
          <div style={styles.chips}>
            <button type="button" data-testid="graph-filter" style={styles.pillOpen} onClick={() => setFilterOpen(false)}>▾ PROJECTS</button>
            {allGroups.map((g) => {
              const off = hidden.has(g.scopeKey);
              return (
                <button key={g.scopeKey} type="button" data-testid={`graph-filter-chip-${g.scopeKey}`}
                  aria-pressed={!off} onClick={() => toggleGroup(g.scopeKey)}
                  style={{ ...styles.chip, ...(off ? styles.chipOff : null) }}>
                  {g.label} · {g.count}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button type="button" data-testid="graph-fit" onClick={fitNow} style={styles.fit} title="fit graph to view">FIT</button>

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
  filterWrap: { position: 'absolute' as const, top: 12, left: 12, right: 64, zIndex: 7 },
  pill: {
    fontSize: 9, letterSpacing: 1, color: '#9fe9f5', borderWidth: 1, borderStyle: 'solid' as const,
    borderColor: 'rgba(0,229,255,0.5)', borderRadius: 12, padding: '3px 10px',
    background: 'rgba(0,229,255,0.06)', cursor: 'pointer' as const, fontFamily: 'ui-monospace, monospace',
  },
  pillOpen: {
    fontSize: 9, letterSpacing: 1, color: 'var(--edge-trail)', borderWidth: 1, borderStyle: 'solid' as const,
    borderColor: 'var(--edge-trail)', borderRadius: 12, padding: '3px 10px',
    background: 'rgba(0,229,255,0.12)', cursor: 'pointer' as const, fontFamily: 'ui-monospace, monospace',
  },
  chips: { display: 'flex' as const, flexWrap: 'wrap' as const, gap: 5, alignItems: 'center' as const },
  chip: {
    fontSize: 9, letterSpacing: 1, padding: '3px 9px', borderRadius: 12, borderWidth: 1, borderStyle: 'solid' as const,
    borderColor: 'var(--edge-trail)', color: '#9fe9f5', background: 'rgba(0,229,255,0.10)',
    cursor: 'pointer' as const, fontFamily: 'ui-monospace, monospace',
  },
  chipOff: { borderColor: 'var(--edge-idle)', color: '#5f8b95', background: 'transparent' },
  fit: {
    position: 'absolute' as const, top: 12, right: 12, zIndex: 7, background: 'rgba(5,8,13,0.85)',
    borderWidth: 1, borderStyle: 'solid' as const, borderColor: 'rgba(110,224,238,0.6)', color: 'var(--text)',
    fontSize: 10, letterSpacing: 2, padding: '4px 10px', fontFamily: 'ui-monospace, monospace', cursor: 'pointer' as const,
  },
};
