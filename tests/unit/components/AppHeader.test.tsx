import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppHeader } from '../../../src/components/AppHeader';

describe('AppHeader', () => {
  it('renders the CLAUDEWATCH wordmark', () => {
    render(<AppHeader />);
    const header = screen.getByTestId('app-header');
    expect(header.textContent).toContain('CLAUDE');
    expect(header.textContent).toContain('WATCH');
  });

  it('renders the logo mark svg', () => {
    render(<AppHeader />);
    expect(screen.getByTestId('app-header').querySelector('svg')).not.toBeNull();
  });

  it('renders the tagline', () => {
    render(<AppHeader />);
    expect(screen.getByText('watch claude think')).toBeTruthy();
  });
});
