import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveTag } from '../../../src/components/library/LiveTag';

describe('LiveTag', () => {
  it('renders the LIVE label', () => {
    render(<LiveTag />);
    expect(screen.getByTestId('live-tag').textContent).toContain('LIVE');
  });

  it('renders a pulsing dot inside the tag, left of the label', () => {
    render(<LiveTag />);
    const tag = screen.getByTestId('live-tag');
    const dot = tag.querySelector('[data-testid="live-tag-dot"]');
    expect(dot).not.toBeNull();
    // Dot is the first child of the tag.
    expect(tag.firstElementChild).toBe(dot);
  });
});
