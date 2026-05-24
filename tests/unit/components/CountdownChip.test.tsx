import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CountdownChip } from '../../../src/components/live/CountdownChip';

describe('CountdownChip', () => {
  it('renders CLOSING IN <n>s when not frozen', () => {
    render(<CountdownChip seconds={24} frozen={false} onToggleFreeze={() => {}} />);
    expect(screen.getByTestId('countdown-chip').textContent).toContain('CLOSING IN');
    expect(screen.getByTestId('countdown-chip').textContent).toContain('24');
  });

  it('renders FROZEN · <n>s when frozen', () => {
    render(<CountdownChip seconds={18} frozen={true} onToggleFreeze={() => {}} />);
    expect(screen.getByTestId('countdown-chip').textContent).toContain('FROZEN');
    expect(screen.getByTestId('countdown-chip').textContent).toContain('18');
  });

  it('invokes onToggleFreeze when clicked', () => {
    const fn = vi.fn();
    render(<CountdownChip seconds={10} frozen={false} onToggleFreeze={fn} />);
    fireEvent.click(screen.getByTestId('countdown-chip'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
