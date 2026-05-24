import { flattenDFS } from '../../playback/usePlayback';
import type { PlaybackState } from '../../playback/usePlayback';
import type { Milestone } from '../../parse/types';

/**
 * In LIVE mode there is no playback — we always show every milestone we've
 * received so far, with the most recent one as the "active" node. This helper
 * synthesizes a PlaybackState that the existing GraphCanvas rendering can
 * consume: every node is past the current position, edges are fully drawn,
 * and `index` points at the last node so the camera-follow logic centers on
 * the live tip.
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
    finished: true,
  };
}
