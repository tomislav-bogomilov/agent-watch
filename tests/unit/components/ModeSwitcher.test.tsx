import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeSwitcher } from '../../../src/components/ModeSwitcher';

describe('ModeSwitcher', () => {
  it('renders all four mode tabs in fixed order', () => {
    render(<ModeSwitcher mode="sessions" onModeChange={() => {}} />);
    const ids = screen.getAllByRole('tab').map((t) => t.getAttribute('data-testid'));
    expect(ids).toEqual([
      'mode-tab-sessions',
      'mode-tab-prompts',
      'mode-tab-usage',
      'mode-tab-memory',
    ]);
  });

  it('marks the active mode tab with aria-selected', () => {
    render(<ModeSwitcher mode="usage" onModeChange={() => {}} />);
    expect(screen.getByTestId('mode-tab-usage').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('mode-tab-sessions').getAttribute('aria-selected')).toBe('false');
  });

  it('fires onModeChange with the clicked mode', () => {
    const onModeChange = vi.fn();
    render(<ModeSwitcher mode="sessions" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByTestId('mode-tab-memory'));
    expect(onModeChange).toHaveBeenCalledWith('memory');
  });
});
