import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useNarrative, useTickNarrative, useStartNarrative } from '../../../src/api/hooks';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify({ blocks: [{ id: 'b', phase: 'P', title: 'T', summary: 'S',
      status: 'completed', startMilestoneId: 'm1', endMilestoneId: 'm2' }],
      building: false, error: null, model: 'haiku', generatedAt: '2026-06-21T00:00:00Z' }),
      { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTickNarrative / useStartNarrative invalidation', () => {
  it('useTickNarrative does not invalidate the narrative query (no poll storm)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const w = ({ children }: { children: React.ReactNode }) =>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useTickNarrative(), { wrapper: w });
    result.current.mutate({ projectId: 'p', sessionId: 's', milestones: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).not.toHaveBeenCalled();
  });

  it('useStartNarrative does invalidate the narrative query', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const w = ({ children }: { children: React.ReactNode }) =>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useStartNarrative(), { wrapper: w });
    result.current.mutate({ projectId: 'p', sessionId: 's', milestones: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['narrative', 'p', 's'] });
  });
});

describe('useNarrative', () => {
  it('does not fetch until enabled', () => {
    const { result } = renderHook(() => useNarrative('p', 's', false, false), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('fetches state when enabled', async () => {
    const { result } = renderHook(() => useNarrative('p', 's', true, false), { wrapper });
    await waitFor(() => expect(result.current.data?.blocks).toHaveLength(1));
  });
});
