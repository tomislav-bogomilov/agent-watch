import { flattenDFS } from '../../playback/usePlayback';
import type { PlaybackState } from '../../playback/usePlayback';
import type { Milestone } from '../../parse/types';

/**
 * In LIVE mode there is no playback — we always show every milestone we've
 * received so far, with the most recent one as the "active" node. The
 * `finished: false` flag is intentional: it keeps `GraphCanvas`'s state
 * computation treating `currentId` as the active node (so it renders with
 * the accent highlight). `edgeProgress: 1` keeps all edges drawn fully.
 */
export function makeLivePlayback(root: Milestone): PlaybackState {
  const order = flattenDFS(root);
  const lastIndex = Math.max(0, order.length - 1);
  return {
    order,
    index: lastIndex,
    edgeProgress: 1,
    playing: false,
    speed: 1,
    finished: false,
  };
}
