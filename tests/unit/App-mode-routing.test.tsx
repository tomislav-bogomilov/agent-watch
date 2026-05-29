import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../../src/App';

// Light mocks so the page doesn't try to fetch live data in jsdom.
vi.mock('../../src/api/hooks', async () => {
  const actual = await vi.importActual<object>('../../src/api/hooks');
  return {
    ...actual,
    useSessionList: () => ({ data: [], isLoading: false, error: null }),
    usePromptList:  () => ({ data: [], isLoading: false, error: null }),
    useTokenUsage:  () => ({ data: { projects: [], rows: [] }, isLoading: false, error: null }),
    useSession:     () => ({ data: null, isLoading: false, error: null }),
    isLiveMeta:     () => false,
    useMemoryList: () => ({
      data: {
        memories: [
          { scopeKey: 'C--demo', scope: { kind: 'project', projectId: 'C--demo', cwd: 'C:/demo' },
            name: 'alpha', description: 'A', type: 'feedback', originSessionId: null,
            links: [], body: 'body', mtimeMs: 0, inIndex: true },
        ],
        indexes: [],
      },
      isLoading: false, error: null,
    }),
    useCreateMemory: () => ({ mutateAsync: async () => {}, isPending: false }),
    useUpdateMemory: () => ({ mutateAsync: async () => {}, isPending: false }),
    useDeleteMemory: () => ({ mutateAsync: async () => ({ brokenBacklinks: [] }), isPending: false }),
  };
});

function renderApp() {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}><App /></QueryClientProvider>);
}

describe('App: mode-driven routing + #/tokens shim', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1600 });
  });
  afterEach(() => { window.location.hash = ''; });

  it('renders the TokensPage when localStorage mode is "usage"', () => {
    localStorage.setItem('tg.library.mode', 'usage');
    renderApp();
    expect(screen.getByTestId('tokens-page')).toBeDefined();
  });

  it('in usage mode the filter input is hidden and the family cards render', () => {
    localStorage.setItem('tg.library.mode', 'usage');
    renderApp();
    expect(screen.queryByTestId('session-filter')).toBeNull();
    expect(screen.getByTestId('usage-card-all')).toBeDefined();
    expect(screen.getByTestId('usage-card-opus')).toBeDefined();
    expect(screen.getByTestId('usage-card-sonnet')).toBeDefined();
    expect(screen.getByTestId('usage-card-haiku')).toBeDefined();
  });

  it('in sessions mode the filter input is visible and no usage cards render', () => {
    localStorage.setItem('tg.library.mode', 'sessions');
    renderApp();
    expect(screen.getByTestId('session-filter')).toBeDefined();
    expect(screen.queryByTestId('usage-card-all')).toBeNull();
  });

  it('one-shot upgrades #/tokens to usage mode and clears the hash', () => {
    window.location.hash = '#/tokens';
    renderApp();
    expect(window.location.hash).toBe('');
    expect(screen.getByTestId('tokens-page')).toBeDefined();
  });

  it('does NOT render TokensPage by default', () => {
    renderApp();
    expect(screen.queryByTestId('tokens-page')).toBeNull();
  });

  it('renders the MemoryPage and sidebar list when mode is "memory"', () => {
    localStorage.setItem('tg.library.mode', 'memory');
    renderApp();
    expect(screen.getByTestId('memory-page')).toBeDefined();
    expect(screen.getByTestId('memory-item-C--demo-alpha')).toBeDefined();
  });
});
