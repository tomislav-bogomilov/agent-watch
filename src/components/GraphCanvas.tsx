import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { layoutTree, type LaidOutNode } from '../graph/layout';
import { GraphDefs } from '../theme/Filters';
import { NodeShape, nodeFilterCohort } from './NodeShape';
import { EdgePath, edgeFilterCohort } from './EdgePath';
import { NodeTooltip } from './NodeTooltip';
import { Minimap } from './Minimap';
import { collectTaintedIds } from '../parse/failure';
import { useCamera, type CameraApi } from '../graph/useCamera';
import { visibleLayoutRect, nodeInRect, edgeIntersectsRect } from '../graph/viewport';
import type { Filters } from './FilterToggles';
import type { Milestone, Session } from '../parse/types';
import type { PlaybackState } from '../playback/usePlayback';
type Props = {
  session: Session;
  playback: PlaybackState;
  subagentIds: Set<string>;
  pinnedId: string | null;
  onPin: (id: string | null) => void;
  onScrubTo: (index: number) => void;
  filters: Filters;
  onCameraReady?: (api: CameraApi) => void;
  liveEngaged: boolean;
  compact?: boolean;
  /** When true, skip computing/rendering subagent-region rectangles. Used by
   *  LIVE N=1 mode where the tree has been stripped via buildMainRoot and the
   *  default walk produces enormous overlapping false-positive regions. */
  hideSubagentRegions?: boolean;
  /** Forwarded to <Minimap> so it shifts left when the details panel is docked. */
  detailPanelOpen?: boolean;
  detailPanelWidth?: number;
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

export function GraphCanvas({
  session, playback, subagentIds, pinnedId, onPin, onScrubTo, filters, onCameraReady,
  liveEngaged, compact = false, hideSubagentRegions = false,
  detailPanelOpen = false, detailPanelWidth = 0,
}: Props) {
  const layout = useMemo(() => layoutTree(session.root), [session]);
  const subagentRegions = useMemo(
    () => hideSubagentRegions ? [] : computeSubagentRegions(session.root, layout.nodes),
    [session.root, layout, hideSubagentRegions]
  );
  const taintedIds = useMemo(() => collectTaintedIds(session.root), [session.root]);

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
  const { transform, fit, frameInitial, follow, centerOn } = camera;

  useEffect(() => {
    onCameraReady?.(camera);
  }, [camera, onCameraReady]);

  // Initial framing ONCE per session: anchor the root near the top of the
  // viewport at 1:1 zoom so the first ~7 nodes are visible regardless of how
  // large the session is. Tracks which session id was last framed so a mere
  // viewport change (e.g., right panel opening, sidebar resize) does not
  // re-frame and disrupt the user's current zoom.
  //
  // Skipped entirely when `liveEngaged` is true — the LIVE caller drives its
  // own initial framing via `onCameraReady` (fit + setFollow), and we don't
  // want `frameInitial(root)` to override it.
  const fittedSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (liveEngaged) return;
    if (viewport.width <= 1 || viewport.height <= 1) return;
    if (fittedSessionRef.current === session.id) return;
    fittedSessionRef.current = session.id;
    const root = layout.nodes[0];
    if (root) frameInitial({ x: root.x, y: root.y });
    else fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, viewport.width, viewport.height]);

  const currentId = playback.order[playback.index]?.id;

  const VIEWPORT_MARGIN = 200;

  const visibleRect = useMemo(
    () => visibleLayoutRect(
      { k: transform.k, x: transform.x, y: transform.y },
      { width: viewport.width, height: viewport.height },
      VIEWPORT_MARGIN
    ),
    [transform.k, transform.x, transform.y, viewport.width, viewport.height]
  );

  const visibleNodes = useMemo(() => {
    return layout.nodes.filter((n) => nodeInRect(n, visibleRect) || n.id === currentId);
  }, [layout.nodes, visibleRect, currentId]);

  const visibleEdges = useMemo(
    () => layout.edges.filter((e) => edgeIntersectsRect(e, visibleRect)),
    [layout.edges, visibleRect]
  );

  const visibleSubagentRegions = useMemo(
    () => subagentRegions.filter((r) =>
      edgeIntersectsRect(
        { sourceX: r.x, sourceY: r.y, targetX: r.x + r.width, targetY: r.y + r.height },
        visibleRect
      )
    ),
    [subagentRegions, visibleRect]
  );

  // Auto-follow: when follow is on, animate to the active node at the current
  // zoom every time currentId changes OR the viewport changes (pane resize,
  // mount-time first measure). The viewport deps fix LIVE-mode re-layouts
  // where panes grow/shrink as sub-agents join/leave — without them the
  // camera stays on its previous transform and the current node drifts off.
  // d3-zoom's 280 ms transition gives the tween; the 320 ms programmatic
  // guard in useCamera prevents these from flipping follow off.
  //
  // RAF-debounce: coalesce rapid viewport ticks (e.g. sidebar resize) into a
  // single follow tween per frame. Tolerance skip: if the active node is
  // already within 8 screen-px of viewport center, skip the tween entirely to
  // prevent judder from stacking 280 ms tweens.
  const followRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!follow || !currentId) return;
    if (viewport.width <= 1 || viewport.height <= 1) return;
    const node = layout.nodes.find((n) => n.id === currentId);
    if (!node) return;

    // Cancel any pending follow tween scheduled in the same frame.
    if (followRafRef.current != null) cancelAnimationFrame(followRafRef.current);
    followRafRef.current = requestAnimationFrame(() => {
      followRafRef.current = null;
      // Tolerance: skip the tween if the node is already within 8 screen-px
      // of the viewport center at the current zoom.
      const screenX = node.x * transform.k + transform.x;
      const screenY = node.y * transform.k + transform.y;
      const dx = screenX - viewport.width / 2;
      const dy = screenY - viewport.height / 2;
      if (Math.sqrt(dx * dx + dy * dy) < 8) return;
      centerOn({ x: node.x, y: node.y }, transform.k);
    });

    return () => {
      if (followRafRef.current != null) {
        cancelAnimationFrame(followRafRef.current);
        followRafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, follow, viewport.width, viewport.height]);

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
  const orderIndex = useMemo(() => {
    const m = new Map<string, number>();
    playback.order.forEach((mi, i) => m.set(mi.id, i));
    return m;
  }, [playback.order]);
  const successIds = session.successPath;

  const traversedEdgeKey =
    playback.index > 0
      ? `${playback.order[playback.index - 1].id}->${playback.order[playback.index].id}`
      : null;
  // When the user has stepped or scrubbed onto a node (paused with no
  // edgeProgress), the inbound edge should be shown FULLY drawn rather
  // than as a half-rendered 'drawing' edge — otherwise the trail looks
  // like it stops one node behind the playhead.
  const pausedAtNode = !playback.playing && playback.edgeProgress === 0;

  function isHidden(nodeId: string, state: string): boolean {
    if (filters.hidePruned && state === 'pruned') return true;
    if (filters.hideSubagents && subagentIds.has(nodeId)) return true;
    if (filters.successOnly && !successIds.has(nodeId) && nodeId !== currentId) return true;
    return false;
  }

  const renderedEdgesGlow: JSX.Element[] = [];
  const renderedEdgesSoft: JSX.Element[] = [];
  for (const e of visibleEdges) {
    const key = `${e.sourceId}->${e.targetId}`;
    const isTraversed = traversedIds.has(e.targetId);
    const isCurrent = key === traversedEdgeKey;
    const inSub = subagentIds.has(e.targetId);
    const pruned = taintedIds.has(e.targetId) && !traversedIds.has(e.targetId);
    const state: 'idle' | 'drawing' | 'done' | 'pruned' =
      pruned ? 'pruned'
      : isCurrent && pausedAtNode ? 'done'
      : isCurrent ? 'drawing'
      : isTraversed ? 'done'
      : 'idle';
    const sourcePruned = taintedIds.has(e.sourceId) && !traversedIds.has(e.sourceId);
    const sourceState = sourcePruned ? 'pruned' : 'idle';
    if (isHidden(e.sourceId, sourceState) || isHidden(e.targetId, state)) continue;
    const targetIdx = orderIndex.get(e.targetId) ?? playback.index;
    const hopsBack = Math.max(0, playback.index - targetIdx);
    const freshness = state === 'done' ? Math.max(0.55, 1 - hopsBack * 0.07) : 1;
    const elem = (
      <EdgePath
        key={key}
        edge={e}
        state={state}
        progress={isCurrent ? playback.edgeProgress : isTraversed ? 1 : 0}
        inSubagent={inSub}
        freshness={freshness}
      />
    );
    (edgeFilterCohort(state) === 'glow' ? renderedEdgesGlow : renderedEdgesSoft).push(elem);
  }

  const renderedNodesGlow: JSX.Element[] = [];
  const renderedNodesPlain: JSX.Element[] = [];
  for (const n of visibleNodes) {
    const inSub = subagentIds.has(n.id);
    let state: 'idle' | 'active' | 'success' | 'failed' | 'pruned';
    if (n.id === currentId && !playback.finished) state = 'active';
    else if (n.milestone.failed) state = 'failed';
    else if (taintedIds.has(n.id) && !traversedIds.has(n.id)) state = 'pruned';
    else if (playback.finished && successIds.has(n.id)) state = 'success';
    else if (playback.finished && traversedIds.has(n.id)) state = 'success';
    else if (traversedIds.has(n.id)) state = 'success';
    else state = 'idle';
    if (isHidden(n.id, state)) continue;
    const isPinned = n.id === pinnedId;
    const isTraversed = traversedIds.has(n.id) || n.id === currentId;
    const showContextBadge = filters.showAllContext || isTraversed;
    const elem = (
      <g
        key={n.id}
        onMouseEnter={(ev) => handleNodeEnter(n.milestone, ev)}
        onMouseLeave={() => setHover(null)}
        onClick={(ev) => {
          ev.stopPropagation();
          const idx = orderIndex.get(n.id);
          if (idx != null) onScrubTo(idx);
          onPin(isPinned ? null : n.id);
        }}
        style={{ cursor: 'pointer' }}
      >
        <NodeShape node={n} state={state} inSubagent={inSub} pinned={isPinned} showContextBadge={showContextBadge} />
      </g>
    );
    (nodeFilterCohort(state) === 'glow' ? renderedNodesGlow : renderedNodesPlain).push(elem);
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
          {visibleSubagentRegions.map((r, i) => (
            <rect
              key={`sg-region-${i}`}
              x={r.x} y={r.y} width={r.width} height={r.height}
              fill="var(--subagent-accent)" fillOpacity={0.05}
              stroke="var(--subagent-accent)" strokeOpacity={0.25}
              strokeWidth={1} rx={8}
              data-testid="subagent-region"
            />
          ))}
          {/* Edges keep their filter per-element: group-level filter on a
              <g> whose bbox has zero width (all-vertical edges in a linear
              tree) collapses the filter region and clips the trail. */}
          <g data-cohort="edges-soft">{renderedEdgesSoft}</g>
          <g data-cohort="edges-glow">{renderedEdgesGlow}</g>
          <g data-cohort="nodes-plain">{renderedNodesPlain}</g>
          <g data-cohort="nodes-glow" filter="url(#tg-glow)">{renderedNodesGlow}</g>
        </g>
      </svg>
      {!compact && (
        <Minimap
          layout={layout}
          transform={transform}
          viewport={viewport}
          currentLayoutPoint={currentId ? layout.nodes.find((n) => n.id === currentId) ?? null : null}
          onJump={(pt) => centerOn(pt, transform.k)}
          onPan={(pt) => centerOn(pt, transform.k, { animate: false })}
          onZoom={(pt, k) => centerOn(pt, k, { animate: false })}
          detailPanelOpen={detailPanelOpen}
          detailPanelWidth={detailPanelWidth}
        />
      )}
      {hover && <NodeTooltip milestone={hover.milestone} screenX={hover.screenX} screenY={hover.screenY} />}
    </div>
  );
}
