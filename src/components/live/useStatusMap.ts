import { useMemo, useRef } from 'react';
import { useNowMs } from './useNowMs';
import { nextPaneStatus, type PaneState } from './paneStatus';
import { SUBAGENT_STABLE_MS, TICK_MS } from './liveness';

type Entry = { key: string };

function stateEqual(a: PaneState, b: PaneState): boolean {
  return (
    a.status === b.status &&
    a.closingStartedAt === b.closingStartedAt &&
    a.frozenAt === b.frozenAt &&
    a.frozenRemainingMs === b.frozenRemainingMs
  );
}

function mapsEqual(a: Record<string, PaneState>, b: Record<string, PaneState>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    const av = a[k];
    const bv = b[k];
    if (!bv) return false;
    if (!stateEqual(av, bv)) return false;
  }
  return true;
}

/** Status map for the LIVE subagent panes. Returns the same object reference
 *  when the derived map is value-equal to the previous one, so memoized
 *  consumers don't rerender on idle 1Hz ticks. */
export function useStatusMap(
  entries: Entry[],
  keyToFileId: Map<string, string>,
  subagentMtimes: Record<string, string>,
  userClosedKeys: Set<string>,
  intervalMs: number = TICK_MS,
): Record<string, PaneState> {
  const nowMs = useNowMs(intervalMs);
  const prevRef = useRef<Record<string, PaneState>>({});

  return useMemo(() => {
    const next: Record<string, PaneState> = {};
    const prev = prevRef.current;
    for (const e of entries) {
      if (userClosedKeys.has(e.key)) {
        next[e.key] = { status: 'closed', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null };
        continue;
      }
      const fileId = keyToFileId.get(e.key);
      const mtimeIso = fileId ? subagentMtimes[fileId] : undefined;
      const lastUpdatedMs = mtimeIso ? new Date(mtimeIso).getTime() : nowMs;
      const staleAtOpen = (nowMs - lastUpdatedMs) >= SUBAGENT_STABLE_MS;
      const prevState: PaneState =
        prev[e.key] ?? (staleAtOpen
          ? { status: 'closed', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null }
          : { status: 'active', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null });
      next[e.key] = nextPaneStatus(prevState, lastUpdatedMs, nowMs);
    }
    if (mapsEqual(prev, next)) return prev;
    prevRef.current = next;
    return next;
  }, [entries, keyToFileId, subagentMtimes, userClosedKeys, nowMs]);
}
