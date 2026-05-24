import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CanvasToolbar } from '../../../src/components/CanvasToolbar';

const noop = () => {};

describe('CanvasToolbar', () => {
  it('renders nothing when all show* are false', () => {
    const { container } = render(
      <CanvasToolbar
        showLive={false} liveEngaged={false} onToggleLive={noop}
        showFit={false} onFit={noop}
        showFollow={false} follow={false} onToggleFollow={noop}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders only LIVE when showLive=true and others false', () => {
    render(
      <CanvasToolbar
        showLive={true} liveEngaged={false} onToggleLive={noop}
        showFit={false} onFit={noop}
        showFollow={false} follow={false} onToggleFollow={noop}
      />
    );
    expect(screen.getByTestId('live-button')).toBeTruthy();
    expect(screen.queryByTestId('fit-button')).toBeNull();
    expect(screen.queryByTestId('follow-toggle')).toBeNull();
  });

  it('renders all three when all show* are true', () => {
    render(
      <CanvasToolbar
        showLive={true} liveEngaged={false} onToggleLive={noop}
        showFit={true} onFit={noop}
        showFollow={true} follow={false} onToggleFollow={noop}
      />
    );
    expect(screen.getByTestId('live-button')).toBeTruthy();
    expect(screen.getByTestId('fit-button')).toBeTruthy();
    expect(screen.getByTestId('follow-toggle')).toBeTruthy();
  });

  it('reflects follow state via aria-pressed on the FOLLOW button', () => {
    const { rerender } = render(
      <CanvasToolbar
        showLive={false} liveEngaged={false} onToggleLive={noop}
        showFit={false} onFit={noop}
        showFollow={true} follow={false} onToggleFollow={noop}
      />
    );
    expect(screen.getByTestId('follow-toggle').getAttribute('aria-pressed')).toBe('false');
    rerender(
      <CanvasToolbar
        showLive={false} liveEngaged={false} onToggleLive={noop}
        showFit={false} onFit={noop}
        showFollow={true} follow={true} onToggleFollow={noop}
      />
    );
    expect(screen.getByTestId('follow-toggle').getAttribute('aria-pressed')).toBe('true');
  });

  it('reflects liveEngaged via aria-pressed on the LIVE button', () => {
    const { rerender } = render(
      <CanvasToolbar
        showLive={true} liveEngaged={false} onToggleLive={noop}
        showFit={false} onFit={noop}
        showFollow={false} follow={false} onToggleFollow={noop}
      />
    );
    expect(screen.getByTestId('live-button').getAttribute('aria-pressed')).toBe('false');
    rerender(
      <CanvasToolbar
        showLive={true} liveEngaged={true} onToggleLive={noop}
        showFit={false} onFit={noop}
        showFollow={false} follow={false} onToggleFollow={noop}
      />
    );
    expect(screen.getByTestId('live-button').getAttribute('aria-pressed')).toBe('true');
  });

  it('fires the right callback on each button click', () => {
    const onToggleLive = vi.fn();
    const onFit = vi.fn();
    const onToggleFollow = vi.fn();
    render(
      <CanvasToolbar
        showLive={true} liveEngaged={false} onToggleLive={onToggleLive}
        showFit={true} onFit={onFit}
        showFollow={true} follow={false} onToggleFollow={onToggleFollow}
      />
    );
    fireEvent.click(screen.getByTestId('live-button'));
    fireEvent.click(screen.getByTestId('follow-toggle'));
    fireEvent.click(screen.getByTestId('fit-button'));
    expect(onToggleLive).toHaveBeenCalledTimes(1);
    expect(onToggleFollow).toHaveBeenCalledTimes(1);
    expect(onFit).toHaveBeenCalledTimes(1);
  });

  it('renders LIVE/FOLLOW/FIT in that left-to-right order when all shown', () => {
    render(
      <CanvasToolbar
        showLive={true} liveEngaged={false} onToggleLive={noop}
        showFit={true} onFit={noop}
        showFollow={true} follow={false} onToggleFollow={noop}
      />
    );
    const buttons = Array.from(document.querySelectorAll('[data-testid="canvas-toolbar"] button'));
    expect(buttons.map((b) => b.getAttribute('data-testid'))).toEqual([
      'live-button', 'follow-toggle', 'fit-button',
    ]);
  });
});
