import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryPage } from '../../../src/memory/MemoryPage';

vi.mock('../../../src/api/hooks', () => ({
  useMemoryList: () => ({ data: { memories: [] }, isLoading: false, error: null }),
  useCreateMemory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../../src/memory/MemoryGraph', () => ({
  MemoryGraph: () => <div data-testid="memory-graph-stub" />,
}));

function renderPage() {
  return render(
    <MemoryPage
      selected={null}
      onSelectMemory={() => {}}
      onJumpToSession={() => {}}
      creatingScope={null}
      onCreateDone={() => {}}
      knownSessionIds={new Set()}
    />,
  );
}

describe('MemoryPage default tab', () => {
  it('defaults to the GRAPH view', () => {
    renderPage();
    expect(screen.getByTestId('memory-graph-stub')).toBeTruthy();
    expect(screen.getByTestId('memory-view-graph').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('memory-view-detail').getAttribute('aria-pressed')).toBe('false');
  });
});
