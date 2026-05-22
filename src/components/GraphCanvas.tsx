import { useMemo, useRef, useState } from 'react';
import { layoutTree, type LaidOutNode } from '../graph/layout';
import { GraphDefs } from '../theme/Filters';
import { NodeShape } from './NodeShape';
import { EdgePath } from './EdgePath';
import { NodeTooltip } from './NodeTooltip';
import { collectTaintedIds } from '../parse/failure';
import type { Milestone, Session } from '../parse/types';
import type { PlaybackState } from '../playback/usePlayback';

type Props = { session: Session; playback: PlaybackState; subagentIds: Set<string> };

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

export function GraphCanvas({ session, playback, subagentIds }: Props) {
  const layout = useMemo(() => layoutTree(session.root), [session]);
  const subagentRegions = useMemo(
    () => computeSubagentRegions(session.root, layout.nodes),
    [session, layout]
  );
  const taintedIds = useMemo(() => collectTaintedIds(session.root), [session]);
  const containerRef = useRef<HTMLDivElement>(null);
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

  const currentId = playback.order[playback.index]?.id;
  const traversedIds = new Set(playback.order.slice(0, playback.index + 1).map((m) => m.id));
  const successIds = session.successPath;

  const traversedEdgeKey =
    playback.index > 0
      ? `${playback.order[playback.index - 1].id}->${playback.order[playback.index].id}`
      : null;

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="xMidYMin meet"
        style={{ display: 'block' }}
      >
        <GraphDefs />
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
          return (
            <g
              key={n.id}
              onMouseEnter={(e) => handleNodeEnter(n.milestone, e)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              <NodeShape node={n} state={state} inSubagent={inSub} />
            </g>
          );
        })}
      </svg>
      {hover && <NodeTooltip milestone={hover.milestone} screenX={hover.screenX} screenY={hover.screenY} />}
    </div>
  );
}
