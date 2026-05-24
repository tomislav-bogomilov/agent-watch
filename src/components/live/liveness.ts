import type { SessionMeta } from '../../parse/types';

export const LIVE_THRESHOLD_MS = 180_000;
export const SUBAGENT_STABLE_MS = 30_000;
export const CLOSING_MS = 30_000;
export const POLL_MS = 7_000;
export const TICK_MS = 1_000;

export function isLiveMeta(meta: SessionMeta): boolean {
  return Date.now() - new Date(meta.lastUpdatedAt).getTime() < LIVE_THRESHOLD_MS;
}
