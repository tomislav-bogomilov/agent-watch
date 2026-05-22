import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { clamp, usePersistentWidth } from '../../src/util/usePersistentWidth';

describe('clamp', () => {
  it('clamps below min', () => { expect(clamp(0, 10, 100)).toBe(10); });
  it('clamps above max', () => { expect(clamp(500, 10, 100)).toBe(100); });
  it('passes through in range', () => { expect(clamp(42, 10, 100)).toBe(42); });
});

describe('usePersistentWidth', () => {
  beforeEach(() => { localStorage.clear(); });

  it('returns fallback when nothing persisted', () => {
    const { result } = renderHook(() => usePersistentWidth('tg.test.w', 280, 200, 500));
    expect(result.current[0]).toBe(280);
  });

  it('reads persisted value (clamped)', () => {
    localStorage.setItem('tg.test.w', '350');
    const { result } = renderHook(() => usePersistentWidth('tg.test.w', 280, 200, 500));
    expect(result.current[0]).toBe(350);
  });

  it('clamps persisted value above max', () => {
    localStorage.setItem('tg.test.w', '9999');
    const { result } = renderHook(() => usePersistentWidth('tg.test.w', 280, 200, 500));
    expect(result.current[0]).toBe(500);
  });

  it('falls back on non-numeric persisted value', () => {
    localStorage.setItem('tg.test.w', 'hello');
    const { result } = renderHook(() => usePersistentWidth('tg.test.w', 280, 200, 500));
    expect(result.current[0]).toBe(280);
  });

  it('set updates state, clamps, and writes to localStorage', () => {
    const { result } = renderHook(() => usePersistentWidth('tg.test.w', 280, 200, 500));
    act(() => { result.current[1](999); });
    expect(result.current[0]).toBe(500);
    expect(localStorage.getItem('tg.test.w')).toBe('500');
    act(() => { result.current[1](42); });
    expect(result.current[0]).toBe(200);
    expect(localStorage.getItem('tg.test.w')).toBe('200');
    act(() => { result.current[1](333); });
    expect(result.current[0]).toBe(333);
    expect(localStorage.getItem('tg.test.w')).toBe('333');
  });
});
