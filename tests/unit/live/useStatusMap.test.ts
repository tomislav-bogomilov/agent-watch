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
      useStatusMap(entries, keyToFileId, mtimes, userClosed, TICK)
    );
    expect(Object.keys(result.current.statusMap)).toEqual(['a', 'b']);
    expect(result.current.statusMap.a.status).toBe('active');
    expect(result.current.statusMap.b.status).toBe('active');
  });

  it('returns the SAME statusMap object reference across ticks when nothing changed', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    const mtimes = { fa: '2026-05-24T12:00:00Z' };
    const userClosed = new Set<string>();
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, TICK)
    );
    const first = result.current.statusMap;
    act(() => { vi.advanceTimersByTime(TICK); });
    expect(result.current.statusMap).toBe(first);
  });

  it('returns a new statusMap reference when an entry transitions state', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    const mtimes = { fa: '2026-05-24T12:00:00Z' };
    const userClosed = new Set<string>();
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, TICK)
    );
    const first = result.current.statusMap;
    // 31s of inactivity → transitions to 'closing'
    act(() => { vi.advanceTimersByTime(31_000); });
    expect(result.current.statusMap).not.toBe(first);
    expect(result.current.statusMap.a.status).toBe('closing');
  });

  it('marks user-closed entries as closed regardless of mtime activity', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    const mtimes = { fa: '2026-05-24T12:00:00Z' };
    const userClosed = new Set(['a']);
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, TICK)
    );
    expect(result.current.statusMap.a.status).toBe('closed');
  });

  it('exposes a seed callback that injects state into the next tick', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    const mtimes = { fa: '2026-05-24T11:55:00Z' };  // stale
    const userClosed = new Set<string>();
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, TICK)
    );
    act(() => {
      result.current.seed('a', {
        status: 'frozen',
        closingStartedAt: null,
        frozenAt: 0,
        frozenRemainingMs: 5000,
      });
    });
    expect(result.current.statusMap.a.status).toBe('frozen');
  });

  it('does not re-freeze a pane after file activity has unfrozen it', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    // Start with stale mtime, then update to fresh, then back to stale.
    const initialMtimes = { fa: '2026-05-24T11:55:00Z' };
    const userClosed = new Set<string>();
    const { result, rerender } = renderHook(
      ({ mtimes }: { mtimes: Record<string, string> }) =>
        useStatusMap(entries, keyToFileId, mtimes, userClosed, TICK),
      { initialProps: { mtimes: initialMtimes } }
    );
    // Seed a frozen state.
    act(() => {
      result.current.seed('a', {
        status: 'frozen',
        closingStartedAt: null,
        frozenAt: 0,
        frozenRemainingMs: 5000,
      });
    });
    expect(result.current.statusMap.a.status).toBe('frozen');
    // Simulate file activity: rerender with a fresh mtime.
    rerender({ mtimes: { fa: '2026-05-24T12:00:00Z' } });
    expect(result.current.statusMap.a.status).toBe('active');
    // Now simulate the file going quiet for 30+ seconds (no further activity).
    act(() => { vi.advanceTimersByTime(31_000); });
    // Pane should NOT re-freeze — natural evolution from 'active' → 'closing', not back to 'frozen'.
    expect(result.current.statusMap.a.status).toBe('closing');
  });

  it('userClosedKeys produces a closed state regardless of seed', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    const mtimes = { fa: '2026-05-24T11:55:00Z' };
    const userClosed = new Set(['a']);
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, TICK)
    );
    act(() => {
      result.current.seed('a', {
        status: 'frozen',
        closingStartedAt: null,
        frozenAt: 0,
        frozenRemainingMs: 5000,
      });
    });
    expect(result.current.statusMap.a.status).toBe('closed');
  });
});
