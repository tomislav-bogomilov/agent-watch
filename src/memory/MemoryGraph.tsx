import { useMemo, useState } from 'react';
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
  type SimulationNodeDatum,
} from 'd3-force';
import type { MemoryRecord, MemoryType } from '../api/client';
import { MemoryHologram } from './MemoryHologram';

const TYPE_COLOR: Record<string, string> = {
  feedback: '#ff9d00', project: '#00e5ff', reference: '#b06cff', user: '#4dffa6',
};
const W = 900, H = 560;

type Node = SimulationNodeDatum & { id: string; type: MemoryType | null };

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
  const { nodes, edges, vb } = useMemo(() => {
    const names = new Set(memories.map((m) => m.name));
    const nodes: Node[] = memories.map((m) => ({ id: m.name, type: m.type }));
    const links = memories.flatMap((m) =>
      m.links.filter((t) => names.has(t)).map((t) => ({ source: m.name, target: t }))
    );
    const sim = forceSimulation(nodes)
      .force('link', forceLink(links).id((d: any) => d.id).distance(90))
      .force('charge', forceManyBody().strength(-220))
      .force('center', forceCenter(W / 2, H / 2))
      .force('collide', forceCollide(26))
      .stop();
    for (let i = 0; i < 220; i++) sim.tick();
    const pos = new Map(nodes.map((n) => [n.id, { x: n.x ?? W / 2, y: n.y ?? H / 2 }]));

    // Fit the viewBox to the actual node + label extents (the simulation has no
    // bounding force, so nodes drift past a fixed viewBox and clip). Account for
    // the node radius and the label that extends to the right of each node.
    const PAD = 28;
    const NODE_R = 14;
    const CHAR_W = 6; // ~width per char of the 10px monospace label
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const p = pos.get(n.id)!;
      const labelRight = p.x + 16 + n.id.length * CHAR_W;
      minX = Math.min(minX, p.x - NODE_R);
      minY = Math.min(minY, p.y - NODE_R);
      maxX = Math.max(maxX, labelRight);
      maxY = Math.max(maxY, p.y + NODE_R);
    }
    const vb = {
      x: minX - PAD,
      y: minY - PAD,
      w: Math.max(1, maxX - minX) + PAD * 2,
      h: Math.max(1, maxY - minY) + PAD * 2,
    };

    return {
      vb,
      nodes,
      edges: links.map((l) => {
        const s = pos.get(typeof l.source === 'string' ? l.source : (l.source as Node).id)!;
        const t = pos.get(typeof l.target === 'string' ? l.target : (l.target as Node).id)!;
        return { id: `${(l.source as any).id ?? l.source}-${(l.target as any).id ?? l.target}`, s, t };
      }),
    };
  }, [memories]);

  const openMemory = openName ? memories.find((m) => m.name === openName) ?? null : null;

  if (memories.length === 0) {
    return <div style={{ padding: 24, color: 'var(--text-dim)', letterSpacing: 4 }}>NO MEMORIES</div>;
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block' }} data-testid="memory-graph"
        onClick={() => setOpenName(null)}>
        {edges.map((e) => (
          <line key={e.id} data-testid={`graph-edge-${e.id}`} x1={e.s.x} y1={e.s.y} x2={e.t.x} y2={e.t.y}
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
      </svg>
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
