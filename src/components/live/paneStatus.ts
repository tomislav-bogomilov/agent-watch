import { SUBAGENT_STABLE_MS, CLOSING_MS } from './liveness';

export type PaneStatus = 'active' | 'closing' | 'frozen' | 'closed';

export type PaneState = {
  status: PaneStatus;
  closingStartedAt: number | null;
  frozenAt: number | null;
  frozenRemainingMs: number | null;
};

export function nextPaneStatus(
  prev: PaneState,
  lastUpdatedMs: number,
  nowMs: number,
): PaneState {
  // Sub-agent activity resumed: reset to active no matter the previous status.
  if (lastUpdatedMs > (prev.closingStartedAt ?? 0) && nowMs - lastUpdatedMs < SUBAGENT_STABLE_MS) {
    return { status: 'active', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null };
  }
  if (prev.status === 'active') {
    if (nowMs - lastUpdatedMs > SUBAGENT_STABLE_MS) {
      return { status: 'closing', closingStartedAt: nowMs, frozenAt: null, frozenRemainingMs: null };
    }
    return prev;
  }
  if (prev.status === 'closing') {
    const elapsed = nowMs - (prev.closingStartedAt ?? nowMs);
    if (elapsed > CLOSING_MS) {
      return { ...prev, status: 'closed' };
    }
    return prev;
  }
  // frozen / closed: pure functions only flip when activity resumes (handled above).
  return prev;
}

/**
 * Returns seconds remaining on the closing countdown, or null if not closing/frozen.
 */
export function remainingSeconds(state: PaneState, nowMs: number): number | null {
  if (state.status === 'frozen' && state.frozenRemainingMs != null) {
    return Math.max(0, Math.ceil(state.frozenRemainingMs / 1000));
  }
  if (state.status === 'closing' && state.closingStartedAt != null) {
    const remainingMs = CLOSING_MS - (nowMs - state.closingStartedAt);
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }
  return null;
}
