import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CopyCwdButton } from '../../../src/components/CopyCwdButton';

describe('CopyCwdButton', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a button with the copy glyph at rest', () => {
    render(<CopyCwdButton value="C:/x/y" />);
    const btn = screen.getByTestId('header-copy-cwd');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe('⧉');
  });

  it('writes the value to the clipboard on click and flips to the copied glyph', async () => {
    render(<CopyCwdButton value="C:/x/y" />);
    const btn = screen.getByTestId('header-copy-cwd');

    fireEvent.click(btn);

    expect(writeText).toHaveBeenCalledWith('C:/x/y');
    await waitFor(() => expect(btn.textContent).toBe('✓'));
  });

  it('reverts to the copy glyph after the flash window', async () => {
    render(<CopyCwdButton value="C:/x/y" />);
    const btn = screen.getByTestId('header-copy-cwd');

    fireEvent.click(btn);
    await waitFor(() => expect(btn.textContent).toBe('✓'));

    vi.advanceTimersByTime(1200);
    await waitFor(() => expect(btn.textContent).toBe('⧉'));
  });
});
