// tests/unit/components/PlaybackControls.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlaybackControls } from '../../../src/components/PlaybackControls';
import type { PlaybackState, PlaybackControls as Controls } from '../../../src/playback/usePlayback';
import type { Milestone } from '../../../src/parse/types';

function ms(id: string, over: Partial<Milestone> = {}): Milestone {
  return { id, kind: 'tool_call', label: id, summary: id, timestamp: '', failed: false, raw: null, children: [], ...over };
}

function setup(speed: PlaybackState['speed'] = 2) {
  const controls: Controls = {
    play: vi.fn(), pause: vi.fn(), toggle: vi.fn(), setSpeed: vi.fn(),
    restart: vi.fn(), step: vi.fn(), scrubTo: vi.fn(),
  };
  const state: PlaybackState = {
    order: [ms('a'), ms('b', { kind: 'subagent_spawn' }), ms('c')],
    index: 0, edgeProgress: 0, playing: false, speed, finished: false,
  };
  render(<PlaybackControls state={state} controls={controls} />);
  return controls;
}

describe('PlaybackControls', () => {
  it('drops restart / next-failure / next-tool-call', () => {
    setup();
    expect(screen.queryByTestId('restart')).toBeNull();
    expect(screen.queryByTestId('jump-fail')).toBeNull();
    expect(screen.queryByTestId('jump-tool')).toBeNull();
  });

  it('keeps step / play / scrubber / next-subagent / end', () => {
    setup();
    for (const id of ['step-back', 'play-toggle', 'step-forward', 'scrubber-track', 'jump-subagent', 'jump-end']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });

  it('shows the current speed and steps up/down', () => {
    const controls = setup(2);
    expect(screen.getByTestId('speed-value').textContent).toContain('2');
    fireEvent.click(screen.getByTestId('speed-inc'));
    expect(controls.setSpeed).toHaveBeenCalledWith(4);
    fireEvent.click(screen.getByTestId('speed-dec'));
    expect(controls.setSpeed).toHaveBeenCalledWith(1);
  });

  it('clamps at the top of the ladder', () => {
    const controls = setup(4);
    fireEvent.click(screen.getByTestId('speed-inc'));
    expect(controls.setSpeed).toHaveBeenCalledWith(4);
  });
});
