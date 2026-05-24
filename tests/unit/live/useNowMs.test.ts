import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNowMs } from '../../../src/components/live/useNowMs';

describe('useNowMs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T12:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('returns Date.now() at mount', () => {
    const { result } = renderHook(() => useNowMs(1000));
    expect(result.current).toBe(new Date('2026-05-24T12:00:00Z').getTime());
  });

  it('updates after the interval elapses', () => {
    const { result } = renderHook(() => useNowMs(1000));
    const t0 = result.current;
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(t0 + 1000);
  });

  it('clears its interval on unmount', () => {
    const { unmount } = renderHook(() => useNowMs(1000));
    const clearSpy = vi.spyOn(global, 'clearInterval');
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('two subscribers with the same interval update together', () => {
    const a = renderHook(() => useNowMs(1000));
    const b = renderHook(() => useNowMs(1000));
    const before = a.result.current;
    act(() => { vi.advanceTimersByTime(1000); });
    expect(a.result.current).toBe(before + 1000);
    expect(b.result.current).toBe(before + 1000);
  });
});
