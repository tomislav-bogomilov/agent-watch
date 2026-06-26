import { useEffect, useMemo, useRef, useState } from 'react';
import type { NarratorInput } from '../../api/client';
import { useNarrative, useStartNarrative, useTickNarrative, useRefreshNarrative } from '../../api/hooks';
import type { NarrativeBlock as Block, Verbosity } from '../../narrative/types';
import { rebucket } from '../../narrative/rebucket';
import { diffBlocks } from '../../narrative/diffBlocks';
import { buildIndexMap, indexForBlockStart, activeBlockId } from '../../narrative/sync';
import { NarrativeBlock } from './NarrativeBlock';
import { VerbosityControl } from './VerbosityControl';
import { RefreshButton } from './RefreshButton';
import { ArmillaryLoader } from './ArmillaryLoader';
import { EnableNarrativePrompt } from './EnableNarrativePrompt';
import '../../theme/narrative.css';

export interface NarrativeTabProps {
  projectId: string;
  sessionId: string;
  live: boolean;
  milestones: NarratorInput[];
  orderIds: string[];
  currentIndex: number;
  onScrubToIndex: (i: number) => void;
  /** Pin/select the block's start node. Optional so playback + per-pane hosts share this. */
  onSelectNode?: (milestoneId: string) => void;
  /** Controlled enable state. Lifted to the host so it survives the tab unmount
   *  (switching to Details unmounts this component); omit for uncontrolled. */
  enabled?: boolean;
  onEnabledChange?: (v: boolean) => void;
  /** Controlled verbosity, lifted for the same reason; omit for uncontrolled. */
  verbosity?: Verbosity;
  onVerbosityChange?: (v: Verbosity) => void;
}

export function NarrativeTab(props: NarrativeTabProps) {
  const { projectId, sessionId, live, milestones, orderIds, currentIndex, onScrubToIndex, onSelectNode } = props;
  const [enabledLocal, setEnabledLocal] = useState(false);
  const [verbosityLocal, setVerbosityLocal] = useState<Verbosity>('steps');
  const enabled = props.enabled ?? enabledLocal;
  const setEnabled = props.onEnabledChange ?? setEnabledLocal;
  const verbosity = props.verbosity ?? verbosityLocal;
  const setVerbosity = props.onVerbosityChange ?? setVerbosityLocal;

  const start = useStartNarrative();
  const tick = useTickNarrative();
  const refresh = useRefreshNarrative();
  const query = useNarrative(projectId, sessionId, enabled, live);

  const state = query.data;
  const blocks = useMemo<Block[]>(() => state?.blocks ?? [], [state]);
  const indexMap = useMemo(() => buildIndexMap(orderIds), [orderIds]);
  const activeId = useMemo(
    () => activeBlockId(blocks, indexMap, currentIndex),
    [blocks, indexMap, currentIndex],
  );

  // animation diff vs previous blocks. prevRef starts null so the FIRST render
  // diffs blocks against themselves (no spurious "new" flash) — this matters on
  // remount (tab switch back), where React Query hands back cached blocks
  // synchronously and we don't want them all re-animating as added.
  const prevRef = useRef<Block[] | null>(null);
  const diff = useMemo(() => diffBlocks(prevRef.current ?? blocks, blocks), [blocks]);
  useEffect(() => { prevRef.current = blocks; }, [blocks]);

  // live incremental: on each poll, push current milestones (server no-ops if nothing new)
  useEffect(() => {
    if (!enabled || !live) return;
    tick.mutate({ projectId, sessionId, milestones });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, live, query.dataUpdatedAt]);

  // auto-follow the active block
  const activeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeId]);

  const onEnable = () => {
    setEnabled(true);
    start.mutate({ projectId, sessionId, milestones });
  };

  if (!enabled) return <EnableNarrativePrompt onEnable={onEnable} error={null} />;
  if (state?.error && blocks.length === 0) {
    return <EnableNarrativePrompt onEnable={onEnable} error={state.error} />;
  }
  if ((state?.building || start.isPending) && blocks.length === 0) {
    return <ArmillaryLoader label="Building narrative" />;
  }

  const items = rebucket(blocks, verbosity);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="narr-controls">
        <VerbosityControl value={verbosity} onChange={setVerbosity} />
        <RefreshButton
          building={!!state?.building}
          onClick={() => refresh.mutate({ projectId, sessionId, milestones })}
        />
      </div>
      {/* Keep the existing steps visible during a rebuild/auto-refresh — the
          server preserves the old blocks while building, and the RefreshButton
          above already signals the in-flight state. (The empty-blocks initial
          build is handled by the ArmillaryLoader early-return above.) */}
      <div className="narr-flow" data-testid="narr-flow" data-building={state?.building ? 'true' : undefined}>
        {items.map((item) => {
          const list = item.kind === 'group' ? item.blocks : [item.block];
          return list.map((b) => {
            const isActive = b.id === activeId;
            return (
              <div key={b.id} ref={isActive ? activeRef : undefined}>
                <NarrativeBlock
                  block={item.kind === 'group' ? { ...b, status: item.status } : b}
                  active={isActive}
                  isNew={diff.added.has(b.id) || diff.changed.has(b.id)}
                  showDetail={verbosity === 'detailed'}
                  onClick={() => {
                    const idx = indexForBlockStart(b, indexMap);
                    if (idx >= 0) onScrubToIndex(idx);
                    onSelectNode?.(b.startMilestoneId);
                  }}
                />
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
