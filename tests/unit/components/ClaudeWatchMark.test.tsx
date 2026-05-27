import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ClaudeWatchMark } from '../../../src/components/ClaudeWatchMark';

describe('ClaudeWatchMark', () => {
  it('renders an svg at the requested size', () => {
    const { container } = render(<ClaudeWatchMark size={40} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('width')).toBe('40');
    expect(svg!.getAttribute('height')).toBe('40');
  });

  it('marks the sweep group with the cw-sweep class when animated (default)', () => {
    const { container } = render(<ClaudeWatchMark size={22} />);
    expect(container.querySelector('.cw-sweep')).not.toBeNull();
  });

  it('omits the cw-sweep class when animated={false}', () => {
    const { container } = render(<ClaudeWatchMark size={22} animated={false} />);
    expect(container.querySelector('.cw-sweep')).toBeNull();
    expect(container.querySelector('[data-testid="cw-sweep-arm"]')).not.toBeNull();
  });
});