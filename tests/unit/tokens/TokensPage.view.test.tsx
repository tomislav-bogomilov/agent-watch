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

  it('switches to SPEND · BARS and shows the disclaimer', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('usage-view-spend'));
    expect(await screen.findByTestId('spend-bars')).toBeTruthy();
    expect(screen.getByTestId('spend-disclaimer').textContent).toContain('API LIST PRICES');
    expect(screen.queryByTestId('model-row-claude-opus-4-8')).toBeNull(); // TOKENS panels hidden
  });

  it('switches between BARS and MATRIX', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('usage-view-spend'));
    fireEvent.click(await screen.findByTestId('spend-mode-matrix'));
    expect(await screen.findByTestId('spend-matrix')).toBeTruthy();
    expect(screen.queryByTestId('spend-bars')).toBeNull();
    fireEvent.click(screen.getByTestId('spend-mode-bars'));
    expect(await screen.findByTestId('spend-bars')).toBeTruthy();
  });
});
