import { useCallback, useMemo, useRef, useState } from 'react';
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

function mapsEqual(prev: Record<string, PaneState>, next: Record<string, PaneState>): boolean {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return false;
  for (const k of prevKeys) {
    const prevState = prev[k];
    const nextState = next[k];
    if (!nextState) return false;
    if (!stateEqual(prevState, nextState)) return false;
  }
  return true;
}

/** Status map for the LIVE subagent panes. Returns the same object reference
 *  when the derived map is value-equal to the previous one, so memoized
 *  consumers don't rerender on idle 1Hz ticks.
 *
 *  Returns the map plus a `seed(key, state)` callback. Calling `seed` writes
 *  directly into the hook's prev-ref, so the next tick's `nextPaneStatus`
 *  call uses the seeded state as `prevState`. Unlike a "permanent override",
 *  the seed is consumed once and then evolves naturally — file activity will
 *  unfreeze a frozen pane and the seed does not re-apply afterward. */
export function useStatusMap(
  entries: Entry[],
  keyToFileId: Map<string, string>,
  subagentMtimes: Record<string, string>,
  userClosedKeys: Set<string>,
  intervalMs: number = TICK_MS,
): { statusMap: Record<string, PaneState>; seed: (key: string, state: PaneState) => void } {
  const nowMs = useNowMs(intervalMs);
  const prevRef = useRef<Record<string, PaneState>>({});
  const [seedVersion, setSeedVersion] = useState(0);

  const seed = useCallback((key: string, state: PaneState) => {
    prevRef.current = { ...prevRef.current, [key]: state };
    setSeedVersion((v) => v + 1);
  }, []);

  const statusMap = useMemo(() => {
    const next: Record<string, PaneState> = {};
    const prev = prevRef.current;
    for (const e of entries) {
      const fileId = keyToFileId.get(e.key);
      const mtimeIso = fileId ? subagentMtimes[fileId] : undefined;
      // Entries without a file mapping or recorded mtime stay 'active' indefinitely —
      // we have no signal that they've gone quiet, so we default to "just updated".
      const lastUpdatedMs = mtimeIso ? new Date(mtimeIso).getTime() : nowMs;
      const staleAtOpen = (nowMs - lastUpdatedMs) >= SUBAGENT_STABLE_MS;
      const prevState: PaneState =
        prev[e.key] ?? (staleAtOpen
          ? { status: 'closed', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null }
          : { status: 'active', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null });
      next[e.key] = userClosedKeys.has(e.key)
        ? ({ status: 'closed' as const, closingStartedAt: null, frozenAt: null, frozenRemainingMs: null })
        : nextPaneStatus(prevState, lastUpdatedMs, nowMs);
    }
    if (mapsEqual(prev, next)) return prev;
    prevRef.current = next;
    return next;
  }, [entries, keyToFileId, subagentMtimes, userClosedKeys, nowMs, seedVersion]);

  return { statusMap, seed };
}
