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

  it('honors explicit overrides over derived state', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    const mtimes = { fa: '2026-05-24T12:00:00Z' };
    const userClosed = new Set<string>();
    const overrides = {
      a: { status: 'frozen' as const, closingStartedAt: null, frozenAt: 0, frozenRemainingMs: 5000 },
    };
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, overrides, TICK)
    );
    expect(result.current.a.status).toBe('frozen');
  });
});
