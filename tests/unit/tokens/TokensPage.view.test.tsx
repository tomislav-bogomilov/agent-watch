import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TokensPage } from '../../../src/tokens/TokensPage';

const MOCK_RESPONSE = {
  projects: [{ id: 'P', cwd: 'C:/p' }],
  rows: [{
    projectId: 'P', modelId: 'claude-opus-4-8', isSubagent: false, day: '2026-06-01',
    input: 1_000_000, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0,
  }],
  prices: {},
  bundledPrices: {
    currency: 'USD', source: 'test',
    perMTok: { 'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 } },
  },
};

vi.mock('../../../src/api/hooks', () => ({
  useTokenUsage: () => ({
    data: MOCK_RESPONSE,
    isLoading: false,
    error: null,
  }),
}));

function renderPage() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <TokensPage family="all" preset="all" onPresetChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('TokensPage view toggle', () => {
  it('defaults to the TOKENS view', () => {
    renderPage();
    expect(screen.getByTestId('tokens-page')).toBeTruthy();
    expect(screen.queryByTestId('spend-bars')).toBeNull();
    expect(screen.getByTestId('usage-view-tokens').getAttribute('aria-pressed')).toBe('true');
  });

  it('SPEND defaults to the MATRIX mode', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('usage-view-spend'));
    expect(await screen.findByTestId('spend-matrix')).toBeTruthy();
    expect(screen.queryByTestId('spend-bars')).toBeNull();
    expect(screen.getByTestId('spend-mode-matrix').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('spend-disclaimer').textContent).toContain('API LIST PRICES');
  });

  it('switches from MATRIX to BARS and back', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('usage-view-spend'));
    fireEvent.click(await screen.findByTestId('spend-mode-bars'));
    expect(await screen.findByTestId('spend-bars')).toBeTruthy();
    expect(screen.queryByTestId('spend-matrix')).toBeNull();
    fireEvent.click(screen.getByTestId('spend-mode-matrix'));
    expect(await screen.findByTestId('spend-matrix')).toBeTruthy();
  });
});
