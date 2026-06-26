import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayback, SPEED_STEPS, stepSpeed } from '../../src/playback/usePlayback';
import type { Milestone } from '../../src/parse/types';

function ms(id: string, children: Milestone[] = []): Milestone {
  return {
    id,
    kind: 'tool_call',
    label: id,
    summary: id,
    timestamp: '',
    failed: false,
    raw: null,
    children,
  };
}

describe('usePlayback', () => {
  it('starts paused', () => {
    const root = ms('a', [ms('b')]);
    const { result } = renderHook(() => usePlayback(root));
    expect(result.current.state.playing).toBe(false);
    expect(result.current.state.index).toBe(0);
  });

  it('step(+1) advances index and pauses', () => {
    const root = ms('a', [ms('b', [ms('c')])]);
    const { result } = renderHook(() => usePlayback(root));
    act(() => { result.current.controls.step(1); });
    expect(result.current.state.index).toBe(1);
    expect(result.current.state.playing).toBe(false);
  });

  it('step(-1) does not go below 0', () => {
    const root = ms('a', [ms('b')]);
    const { result } = renderHook(() => usePlayback(root));
    act(() => { result.current.controls.step(-1); });
    expect(result.current.state.index).toBe(0);
  });

  it('exposes 0.25×, 0.5×, 1×, 2×, 4× speeds via setSpeed', () => {
    const root = ms('a');
    const { result } = renderHook(() => usePlayback(root));
    act(() => { result.current.controls.setSpeed(0.25); });
    expect(result.current.state.speed).toBe(0.25);
    act(() => { result.current.controls.setSpeed(0.5); });
    expect(result.current.state.speed).toBe(0.5);
    act(() => { result.current.controls.setSpeed(4); });
    expect(result.current.state.speed).toBe(4);
  });

  it('scrubTo jumps to the requested index and pauses', () => {
    const root = ms('a', [ms('b', [ms('c', [ms('d')])])]);
    const { result } = renderHook(() => usePlayback(root));
    act(() => { result.current.controls.scrubTo(2); });
    expect(result.current.state.index).toBe(2);
    expect(result.current.state.playing).toBe(false);
  });

  it('defaults to 2x (quicker than the old 0.1x)', () => {
    const root = ms('a', [ms('b')]);
    const { result } = renderHook(() => usePlayback(root));
    expect(result.current.state.speed).toBe(2);
  });

  it('stepSpeed walks the ladder and clamps at both ends', () => {
    expect(SPEED_STEPS).toEqual([0.1, 0.25, 0.5, 1, 2, 4]);
    expect(stepSpeed(1, 1)).toBe(2);
    expect(stepSpeed(1, -1)).toBe(0.5);
    expect(stepSpeed(4, 1)).toBe(4);   // clamp high
    expect(stepSpeed(0.1, -1)).toBe(0.1); // clamp low
  });
});
