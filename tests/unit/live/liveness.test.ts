import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isLiveMeta, LIVE_THRESHOLD_MS, SUBAGENT_STABLE_MS, CLOSING_MS, POLL_MS, TICK_MS } from '../../../src/components/live/liveness';
import type { SessionMeta } from '../../../src/parse/types';

function meta(lastUpdatedAt: string): SessionMeta {
  return {
    projectId: 'p', sessionId: 's', cwd: '/c',
    startedAt: lastUpdatedAt, lastUpdatedAt,
    sizeBytes: 0,
  };
}

describe('liveness constants', () => {
  it('declares constants used across the live feature', () => {
    expect(LIVE_THRESHOLD_MS).toBe(180_000);
    expect(SUBAGENT_STABLE_MS).toBe(60_000);
    expect(CLOSING_MS).toBe(30_000);
    expect(POLL_MS).toBe(7_000);
    expect(TICK_MS).toBe(1_000);
  });
});

describe('isLiveMeta', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-05-24T12:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns true when lastUpdatedAt is just now', () => {
    expect(isLiveMeta(meta('2026-05-24T12:00:00Z'))).toBe(true);
  });

  it('returns true 179s after lastUpdatedAt', () => {
    expect(isLiveMeta(meta('2026-05-24T11:57:01Z'))).toBe(true);
  });

  it('returns false 181s after lastUpdatedAt', () => {
    expect(isLiveMeta(meta('2026-05-24T11:56:59Z'))).toBe(false);
  });
});
