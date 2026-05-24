import { describe, it, expect } from 'vitest';
import { nextPaneStatus, type PaneState } from '../../../src/components/live/paneStatus';

function s(partial: Partial<PaneState>): PaneState {
  return {
    status: 'active',
    closingStartedAt: null,
    frozenAt: null,
    frozenRemainingMs: null,
    ...partial,
  };
}

describe('nextPaneStatus', () => {
  const lastUpdated = new Date('2026-05-24T12:00:00Z').getTime();

  it('keeps status=active when mtime is recent', () => {
    const now = lastUpdated + 15_000;
    expect(nextPaneStatus(s({ status: 'active' }), lastUpdated, now)).toEqual({
      status: 'active', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null,
    });
  });

  it('transitions active → closing when mtime is stable past SUBAGENT_STABLE_MS', () => {
    const now = lastUpdated + 30_001;
    const next = nextPaneStatus(s({ status: 'active' }), lastUpdated, now);
    expect(next.status).toBe('closing');
    expect(next.closingStartedAt).toBe(now);
  });

  it('keeps status=closing during CLOSING_MS window', () => {
    const closingStartedAt = lastUpdated + 30_001;
    const now = closingStartedAt + 10_000;
    const next = nextPaneStatus(s({ status: 'closing', closingStartedAt }), lastUpdated, now);
    expect(next.status).toBe('closing');
  });

  it('transitions closing → closed after CLOSING_MS', () => {
    const closingStartedAt = lastUpdated + 30_001;
    const now = closingStartedAt + 30_001;
    expect(nextPaneStatus(s({ status: 'closing', closingStartedAt }), lastUpdated, now).status).toBe('closed');
  });

  it('returns to active when frozen and mtime changes again (sub-agent woke up)', () => {
    const frozenAt = lastUpdated + 40_000;
    const newerUpdate = frozenAt + 5_000;
    const now = newerUpdate + 1_000;
    const next = nextPaneStatus(
      s({ status: 'frozen', frozenAt, frozenRemainingMs: 20_000, closingStartedAt: lastUpdated + 30_001 }),
      newerUpdate, now,
    );
    expect(next.status).toBe('active');
    expect(next.frozenAt).toBeNull();
    expect(next.frozenRemainingMs).toBeNull();
    expect(next.closingStartedAt).toBeNull();
  });

  it('stays frozen otherwise', () => {
    const frozenAt = lastUpdated + 40_000;
    const next = nextPaneStatus(
      s({ status: 'frozen', frozenAt, frozenRemainingMs: 20_000, closingStartedAt: lastUpdated + 30_001 }),
      lastUpdated, frozenAt + 100_000,
    );
    expect(next.status).toBe('frozen');
    expect(next.frozenRemainingMs).toBe(20_000);
  });
});
