import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LiveButton } from '../../../src/components/live/LiveButton';

describe('LiveButton', () => {
  it('renders a LIVE label and a pulsing dot', () => {
    render(<LiveButton engaged={false} onToggle={() => {}} />);
    const btn = screen.getByTestId('live-button');
    expect(btn.textContent).toContain('LIVE');
    expect(btn.querySelector('[data-testid="live-button-dot"]')).not.toBeNull();
  });

  it('reflects engaged state via aria-pressed', () => {
    const { rerender } = render(<LiveButton engaged={false} onToggle={() => {}} />);
    expect(screen.getByTestId('live-button').getAttribute('aria-pressed')).toBe('false');
    rerender(<LiveButton engaged={true} onToggle={() => {}} />);
    expect(screen.getByTestId('live-button').getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<LiveButton engaged={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('live-button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
