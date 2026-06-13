import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ControlBar } from '../../../src/components/live/ControlBar';
import type { ControlRow } from '../../../src/components/live/controlRows';

const running: ControlRow = { target: 'main', label: 'MAIN', summary: 'fix the bug', paused: false, held: null };
const pausedRow: ControlRow = {
  target: 'agent-0', label: 'AGENT 0', summary: 'explore auth', paused: true,
  held: { toolUseId: 't1', owner: 'agent-0', toolName: 'Bash', toolInputSummary: '{"command":"npm test"}', heldSince: 0 },
};
const noop = () => {};
const baseProps = {
  installed: true, nowMs: 65_000, installing: false, allPaused: false,
  onPause: noop, onResume: noop, onPauseAll: noop, onResumeAll: noop, onInstall: noop,
};

describe('ControlBar', () => {
  it('renders collapsed by default with running count and PAUSE ALL', () => {
    render(<ControlBar rows={[running]} {...baseProps} />);
    expect(screen.getByTestId('control-bar')).toBeTruthy();
    expect(screen.getByText(/1 running/i)).toBeTruthy();
    expect(screen.getByTestId('control-pause-all')).toBeTruthy();
    expect(screen.queryByTestId('control-row-main')).toBeNull();
  });

  it('expands on toggle, showing per-row pause buttons', () => {
    render(<ControlBar rows={[running]} {...baseProps} />);
    fireEvent.click(screen.getByTestId('control-bar-toggle'));
    expect(screen.getByTestId('control-row-main')).toBeTruthy();
    expect(screen.getByTestId('control-pause-main')).toBeTruthy();
  });

  it('auto-expands when a row is paused, showing held call + elapsed timer', () => {
    render(<ControlBar rows={[running, pausedRow]} {...baseProps} />);
    const row = screen.getByTestId('control-row-agent-0');
    expect(row.textContent).toContain('Bash');
    expect(row.textContent).toContain('npm test');
    expect(row.textContent).toContain('01:05'); // heldSince 0, nowMs 65s
  });

  it('shows "engaging" for a paused row the gate has not caught yet', () => {
    render(<ControlBar rows={[{ ...pausedRow, held: null }]} {...baseProps} />);
    expect(screen.getByTestId('control-row-agent-0').textContent?.toLowerCase()).toContain('engaging');
  });

  it('resume sends the typed note, or null when empty', () => {
    const onResume = vi.fn();
    render(<ControlBar rows={[pausedRow]} {...baseProps} onResume={onResume} />);
    fireEvent.change(screen.getByTestId('control-steer-agent-0'), { target: { value: 'use fixtures' } });
    fireEvent.click(screen.getByTestId('control-resume-agent-0'));
    expect(onResume).toHaveBeenCalledWith('agent-0', 'use fixtures');
  });

  it('under PAUSE ALL, paused rows show held info but no per-row steer/resume', () => {
    render(<ControlBar rows={[{ ...pausedRow }]} {...baseProps} allPaused={true} />);
    const row = screen.getByTestId('control-row-agent-0');
    // held info still visible for inspection
    expect(row.textContent).toContain('Bash');
    // but the per-row steer input and resume button are gone (RESUME ALL is the control)
    expect(screen.queryByTestId('control-steer-agent-0')).toBeNull();
    expect(screen.queryByTestId('control-resume-agent-0')).toBeNull();
    // RESUME ALL is present (anyPaused is true)
    expect(screen.getByTestId('control-resume-all')).toBeTruthy();
  });

  it('with individual pause (not all), the per-row steer + resume ARE shown', () => {
    render(<ControlBar rows={[{ ...pausedRow }]} {...baseProps} allPaused={false} />);
    expect(screen.getByTestId('control-steer-agent-0')).toBeTruthy();
    expect(screen.getByTestId('control-resume-agent-0')).toBeTruthy();
  });

  it('pause buttons are disabled and an install prompt shows when the hook is missing', () => {
    const onInstall = vi.fn();
    render(<ControlBar rows={[running]} {...baseProps} installed={false} onInstall={onInstall} />);
    fireEvent.click(screen.getByTestId('control-bar-toggle'));
    expect((screen.getByTestId('control-pause-main') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('control-install'));
    expect(onInstall).toHaveBeenCalled();
  });
});
