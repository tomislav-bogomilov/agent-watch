import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppHeader } from '../../../src/components/AppHeader';

describe('AppHeader', () => {
  it('renders the AGENTWATCH wordmark', () => {
    render(<AppHeader mode="sessions" onModeChange={() => {}} />);
    const header = screen.getByTestId('app-header');
    expect(header.textContent).toContain('AGENT');
    expect(header.textContent).toContain('WATCH');
  });

  it('renders the logo mark svg', () => {
    render(<AppHeader mode="sessions" onModeChange={() => {}} />);
    expect(screen.getByTestId('app-header').querySelector('svg')).not.toBeNull();
  });

  it('renders the two-tone tagline reading "watch agents think"', () => {
    render(<AppHeader mode="sessions" onModeChange={() => {}} />);
    expect(screen.getByTestId('app-tagline').textContent).toBe('watch agents think');
  });

  it('renders the four mode tabs and marks the active mode', () => {
    render(<AppHeader mode="usage" onModeChange={() => {}} />);
    expect(screen.getByTestId('mode-tab-sessions')).toBeDefined();
    expect(screen.getByTestId('mode-tab-prompts')).toBeDefined();
    expect(screen.getByTestId('mode-tab-usage')).toBeDefined();
    expect(screen.getByTestId('mode-tab-memory')).toBeDefined();
    expect(screen.getByTestId('mode-tab-usage').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('mode-tab-sessions').getAttribute('aria-selected')).toBe('false');
  });
});
