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
 *  `overrides` lets callers (e.g. freezeToggle) pin a specific PaneState for
 *  a key, bypassing the time-derived computation for that entry. */
export function useStatusMap(
  entries: Entry[],
  keyToFileId: Map<string, string>,
  subagentMtimes: Record<string, string>,
  userClosedKeys: Set<string>,
  overrides: Record<string, PaneState>,
  intervalMs: number = TICK_MS,
): Record<string, PaneState> {
  const nowMs = useNowMs(intervalMs);
  const prevRef = useRef<Record<string, PaneState>>({});

  return useMemo(() => {
    const next: Record<string, PaneState> = {};
    const prev = prevRef.current;
    for (const e of entries) {
      const fileId = keyToFileId.get(e.key);
      const mtimeIso = fileId ? subagentMtimes[fileId] : undefined;
      // Entries without a file mapping or recorded mtime stay 'active' indefinitely —
      // we have no signal that they've gone quiet, so we default to "just updated".
      const lastUpdatedMs = mtimeIso ? new Date(mtimeIso).getTime() : nowMs;
      const staleAtOpen = (nowMs - lastUpdatedMs) >= SUBAGENT_STABLE_MS;
      // An override seeds the prevState fed into nextPaneStatus, so a 'closing'
      // override evolves toward 'closed' and a 'frozen' override stays frozen
      // until file activity resumes. userClosedKeys still wins below regardless.
      const prevState: PaneState =
        overrides[e.key] ?? prev[e.key] ?? (staleAtOpen
          ? { status: 'closed', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null }
          : { status: 'active', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null });
      next[e.key] = userClosedKeys.has(e.key)
        ? ({ status: 'closed' as const, closingStartedAt: null, frozenAt: null, frozenRemainingMs: null })
        : nextPaneStatus(prevState, lastUpdatedMs, nowMs);
    }
    if (mapsEqual(prev, next)) return prev;
    prevRef.current = next;
    return next;
  }, [entries, keyToFileId, subagentMtimes, userClosedKeys, overrides, nowMs]);
}
