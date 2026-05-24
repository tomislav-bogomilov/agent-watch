import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStatusMap } from '../../../src/components/live/useStatusMap';

type Entry = { key: string };

const TICK = 1000;

describe('useStatusMap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T12:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('returns a status for every entry', () => {
    const entries: Entry[] = [{ key: 'a' }, { key: 'b' }];
    const keyToFileId = new Map([['a', 'fa'], ['b', 'fb']]);
    const mtimes = { fa: '2026-05-24T12:00:00Z', fb: '2026-05-24T12:00:00Z' };
    const userClosed = new Set<string>();
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, {}, TICK)
    );
    expect(Object.keys(result.current)).toEqual(['a', 'b']);
    expect(result.current.a.status).toBe('active');
    expect(result.current.b.status).toBe('active');
  });

  it('returns the SAME object reference across ticks when nothing changed', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    const mtimes = { fa: '2026-05-24T12:00:00Z' };
    const userClosed = new Set<string>();
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, {}, TICK)
    );
    const first = result.current;
    act(() => { vi.advanceTimersByTime(TICK); });
    expect(result.current).toBe(first); // reference-equal: no rerender propagation
  });

  it('returns a new reference when an entry transitions state', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    const mtimes = { fa: '2026-05-24T12:00:00Z' };
    const userClosed = new Set<string>();
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, {}, TICK)
    );
    const first = result.current;
    // 31s of inactivity → transitions to 'closing'
    act(() => { vi.advanceTimersByTime(31_000); });
    expect(result.current).not.toBe(first);
    expect(result.current.a.status).toBe('closing');
  });

  it('marks user-closed entries as closed regardless of mtime activity', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    const mtimes = { fa: '2026-05-24T12:00:00Z' };
    const userClosed = new Set(['a']);
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, {}, TICK)
    );
    expect(result.current.a.status).toBe('closed');
  });

  it('seeds nextPaneStatus from a frozen override and stays frozen when the file is stale', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    // Stale mtime so the activity-resumed branch doesn't override the seed.
    const mtimes = { fa: '2026-05-24T11:55:00Z' };
    const userClosed = new Set<string>();
    const overrides = {
      a: { status: 'frozen' as const, closingStartedAt: null, frozenAt: 0, frozenRemainingMs: 5000 },
    };
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, overrides, TICK)
    );
    expect(result.current.a.status).toBe('frozen');
  });

  it('lets a closing override evolve toward closed via nextPaneStatus', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    const mtimes = { fa: '2026-05-24T11:55:00Z' };  // stale
    const userClosed = new Set<string>();
    const closingStartedAt = Date.now();
    const overrides = {
      a: { status: 'closing' as const, closingStartedAt, frozenAt: null, frozenRemainingMs: null },
    };
    const { result, rerender } = renderHook(
      ({ ovr }: { ovr: typeof overrides }) =>
        useStatusMap(entries, keyToFileId, mtimes, userClosed, ovr, TICK),
      { initialProps: { ovr: overrides } }
    );
    expect(result.current.a.status).toBe('closing');
    // Advance past CLOSING_MS (30s) and re-render with the same override.
    act(() => { vi.advanceTimersByTime(31_000); });
    rerender({ ovr: overrides });
    expect(result.current.a.status).toBe('closed');
  });

  it('userClosedKeys wins over a frozen override', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    const mtimes = { fa: '2026-05-24T11:55:00Z' };
    const userClosed = new Set(['a']);
    const overrides = {
      a: { status: 'frozen' as const, closingStartedAt: null, frozenAt: 0, frozenRemainingMs: 5000 },
    };
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, overrides, TICK)
    );
    expect(result.current.a.status).toBe('closed');
  });
});
