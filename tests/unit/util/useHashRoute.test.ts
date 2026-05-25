import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHashRoute } from '../../../src/util/useHashRoute';

describe('useHashRoute', () => {
  beforeEach(() => { window.location.hash = ''; });
  afterEach(() => { window.location.hash = ''; });

  it('returns "main" for empty hash', () => {
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toBe('main');
  });

  it('returns "tokens" for #/tokens', () => {
    window.location.hash = '#/tokens';
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toBe('tokens');
  });

  it('reacts to hashchange events', () => {
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toBe('main');
    act(() => {
      window.location.hash = '#/tokens';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toBe('tokens');
    act(() => {
      window.location.hash = '';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toBe('main');
  });

  it('treats unknown hashes as "main"', () => {
    window.location.hash = '#/something-else';
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toBe('main');
  });
});
