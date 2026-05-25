import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TokensPage } from '../../../src/tokens/TokensPage';

vi.mock('../../../src/api/hooks', () => ({
  useTokenUsage: () => ({
    data: {
      projects: [{ id: 'p1', cwd: '/repo/a' }],
      rows: [
        { projectId: 'p1', modelId: 'claude-opus-4-7',   isSubagent: false, day: '2026-05-20', input: 1, output: 1, cached: 0 },
        { projectId: 'p1', modelId: 'claude-sonnet-4-6', isSubagent: false, day: '2026-05-20', input: 1, output: 1, cached: 0 },
      ],
    },
    isLoading: false,
    error: null,
  }),
}));

function renderWithFamily(family: 'all' | 'opus' | 'sonnet' | 'haiku') {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <TokensPage family={family} preset="all" onPresetChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('TokensPage family filter', () => {
  it('shows both models when family === all', () => {
    renderWithFamily('all');
    expect(screen.queryByTestId('model-row-claude-opus-4-7')).not.toBeNull();
    expect(screen.queryByTestId('model-row-claude-sonnet-4-6')).not.toBeNull();
  });
  it('hides non-opus rows when family === opus', () => {
    renderWithFamily('opus');
    expect(screen.queryByTestId('model-row-claude-opus-4-7')).not.toBeNull();
    expect(screen.queryByTestId('model-row-claude-sonnet-4-6')).toBeNull();
  });
});
