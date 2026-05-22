import { useEffect, useMemo, useRef, useState } from 'react';
import { layoutTree, type LaidOutNode } from '../graph/layout';
import { GraphDefs } from '../theme/Filters';
import { NodeShape } from './NodeShape';
import { EdgePath } from './EdgePath';
import { NodeTooltip } from './NodeTooltip';
import { collectTaintedIds } from '../parse/failure';
import { useCamera, type CameraApi } from '../graph/useCamera';
import type { Filters } from './FilterToggles';
import type { Milestone, Session } from '../parse/types';
import type { PlaybackState } from '../playback/usePlayback';

type Props = {
  session: Session;
  playback: PlaybackState;
  subagentIds: Set<string>;
  pinnedId: string | null;
  onPin: (id: string | null) => void;
  filters: Filters;
  onCameraReady?: (api: CameraApi) => void;
};

type SubagentRegion = { x: number; y: number; width: number; height: number };

function collectDescendantIds(node: Milestone): string[] {
  const ids = [node.id];
  for (const c of node.children) ids.push(...collectDescendantIds(c));
  return ids;
}

function computeSubagentRegions(root: Milestone, nodes: LaidOutNode[]): SubagentRegion[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const regions: SubagentRegion[] = [];
  function walk(node: Milestone): void {
    if (node.kind === 'subagent_spawn' && node.children[0]) {
      const ids = collectDescendantIds(node.children[0]);
      const positions = ids
        .map((id) => byId.get(id))
        .filter((n): n is LaidOutNode => n !== undefined);
      if (positions.length > 0) {
        const xs = positions.map((p) => p.x);
        const ys = positions.map((p) => p.y);
        regions.push({
          x: Math.min(...xs) - 70,
          y: Math.min(...ys) - 20,
          width: Math.max(...xs) - Math.min(...xs) + 140,
          height: Math.max(...ys) - Math.min(...ys) + 50,
        });
      }
    }
    for (const c of node.children) walk(c);
  }
  walk(root);
  return regions;
}

export function GraphCanvas({ session, playback, subagentIds, pinnedId, onPin, filters, onCameraReady }: Props) {
  const layout = useMemo(() => layoutTree(session.root), [session]);
  const subagentRegions = useMemo(
    () => computeSubagentRegions(session.root, layout.nodes),
    [session, layout]
  );
  const taintedIds = useMemo(() => collectTaintedIds(session.root), [session]);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setViewport({ width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const camera = useCamera({ svgRef, layout, viewport });
  const { transform, fit, setFollow, follow, centerOn } = camera;

  useEffect(() => {
    onCameraReady?.(camera);
  }, [camera, onCameraReady]);

  // Auto-fit when the session (and thus layout) changes, once viewport is known.
  useEffect(() => {
    if (viewport.width > 1 && viewport.height > 1) {
      fit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, viewport.width, viewport.height]);

  const currentId = playback.order[playback.index]?.id;

  // Auto-follow: when follow is on and the active node leaves the central 60%
  // of the viewport, re-center on it. The 320 ms programmatic guard in
  // useCamera prevents this from flipping follow off.
  useEffect(() => {
    if (!follow || !currentId) return;
    const node = layout.nodes.find((n) => n.id === currentId);
    if (!node) return;
    const screenX = node.x * transform.k + transform.x;
    const screenY = node.y * transform.k + transform.y;
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    if (Math.abs(screenX - cx) > viewport.width * 0.3 || Math.abs(screenY - cy) > viewport.height * 0.3) {
      centerOn({ x: node.x, y: node.y }, transform.k);
    }
  }, [currentId, follow, layout.nodes, transform.k, transform.x, transform.y, viewport.height, viewport.width, centerOn]);

  const [hover, setHover] = useState<{ milestone: Milestone; screenX: number; screenY: number } | null>(null);

  function handleNodeEnter(milestone: Milestone, ev: React.MouseEvent<SVGGElement>): void {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    setHover({
      milestone,
      screenX: rect.x + rect.width / 2 - containerRect.x,
      screenY: rect.y + rect.height - containerRect.y,
    });
  }

  const traversedIds = new Set(playback.order.slice(0, playback.index + 1).map((m) => m.id));
  const successIds = session.successPath;

  const traversedEdgeKey =
    playback.index > 0
      ? `${playback.order[playback.index - 1].id}->${playback.order[playback.index].id}`
      : null;

  function isHidden(nodeId: string, state: string): boolean {
    if (filters.hidePruned && state === 'pruned') return true;
    if (filters.hideSubagents && subagentIds.has(nodeId)) return true;
    if (filters.successOnly && !successIds.has(nodeId) && nodeId !== currentId) return true;
    return false;
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ display: 'block', cursor: 'grab' }}
      >
        <GraphDefs />
        <g className="zoom-layer" transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
          {subagentRegions.map((r, i) => (
            <rect
              key={`sg-region-${i}`}
              x={r.x} y={r.y} width={r.width} height={r.height}
              fill="var(--subagent-accent)" fillOpacity={0.05}
              stroke="var(--subagent-accent)" strokeOpacity={0.25}
              strokeWidth={1} rx={8}
              data-testid="subagent-region"
            />
          ))}
          {layout.edges.map((e) => {
            const key = `${e.sourceId}->${e.targetId}`;
            const isTraversed = traversedIds.has(e.targetId);
            const isCurrent = key === traversedEdgeKey;
            const inSub = subagentIds.has(e.targetId);
            const pruned = taintedIds.has(e.targetId) && !traversedIds.has(e.targetId);
            const state = pruned ? 'pruned' : isCurrent ? 'drawing' : isTraversed ? 'done' : 'idle';
            const sourcePruned = taintedIds.has(e.sourceId) && !traversedIds.has(e.sourceId);
            const sourceState = sourcePruned ? 'pruned' : 'idle';
            if (isHidden(e.sourceId, sourceState) || isHidden(e.targetId, state)) return null;
            return (
              <EdgePath
                key={key}
                edge={e}
                state={state}
                progress={isCurrent ? playback.edgeProgress : isTraversed ? 1 : 0}
                inSubagent={inSub}
              />
            );
          })}
          {layout.nodes.map((n) => {
            const inSub = subagentIds.has(n.id);
            let state: 'idle' | 'active' | 'success' | 'failed' | 'pruned';
            if (n.milestone.failed) state = 'failed';
            else if (taintedIds.has(n.id)) state = 'pruned';
            else if (playback.finished && successIds.has(n.id)) state = 'success';
            else if (playback.finished && traversedIds.has(n.id)) state = 'success';
            else if (n.id === currentId) state = 'active';
            else if (traversedIds.has(n.id)) state = 'success';
            else state = 'idle';
            if (isHidden(n.id, state)) return null;
            const isPinned = n.id === pinnedId;
            return (
              <g
                key={n.id}
                onMouseEnter={(e) => handleNodeEnter(n.milestone, e)}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => { e.stopPropagation(); onPin(isPinned ? null : n.id); }}
                style={{ cursor: 'pointer' }}
              >
                <NodeShape node={n} state={state} inSubagent={inSub} pinned={isPinned} />
              </g>
            );
          })}
        </g>
      </svg>
      <button
        data-testid="fit-button"
        onClick={() => fit()}
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 6,
          background: 'rgba(5,8,13,0.85)', border: '1px solid var(--edge-idle)',
          color: 'var(--text)', padding: '4px 10px', cursor: 'pointer',
          fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: 2,
        }}
        title="fit (F)"
      >FIT</button>
      <button
        data-testid="follow-toggle"
        onClick={() => setFollow(!follow)}
        style={{
          position: 'absolute', top: 12, right: 64, zIndex: 6,
          background: 'rgba(5,8,13,0.85)',
          border: `1px solid ${follow ? 'var(--edge-trail)' : 'var(--edge-idle)'}`,
          color: follow ? 'var(--edge-trail)' : 'var(--text)',
          padding: '4px 10px', cursor: 'pointer',
          fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: 2,
        }}
        title="follow playhead (L)"
      >FOLLOW</button>
      {hover && <NodeTooltip milestone={hover.milestone} screenX={hover.screenX} screenY={hover.screenY} />}
    </div>
  );
}
