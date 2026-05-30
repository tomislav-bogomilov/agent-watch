// tests/unit/memory/renderBody.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderBody } from '../../../src/memory/renderBody';

describe('renderBody', () => {
  it('renders bold spans and clickable links', () => {
    const onLink = vi.fn();
    render(<div>{renderBody('Hello **world** see [[target-name]]', new Set(['target-name']), onLink)}</div>);
    expect(screen.getByText('world').tagName).toBe('STRONG');
    fireEvent.click(screen.getByTestId('body-link-target-name'));
    expect(onLink).toHaveBeenCalledWith('target-name');
  });

  it('marks links to unknown memories as broken', () => {
    render(<div>{renderBody('see [[ghost]]', new Set<string>(), () => {})}</div>);
    expect(screen.getByTestId('body-link-ghost').getAttribute('data-broken')).toBe('true');
  });
});
