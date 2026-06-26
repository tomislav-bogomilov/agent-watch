import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { InspectorTabs } from '../../../src/components/narrative/InspectorTabs';

// Deterministic narrative data: the gate is NarrativeTab's `enabled`, which is now
// owned by InspectorTabs so it survives a Details/Logical Steps round-trip.
vi.mock('../../../src/api/hooks', () => ({
  useNarrative: () => ({
    data: {
      blocks: [{ id: 'b1', phase: 'Explore', title: 'Explore', summary: 's1', status: 'completed', startMilestoneId: 'm1', endMilestoneId: 'm2' }],
      building: false, error: null, model: 'haiku', generatedAt: 'x',
    },
    dataUpdatedAt: 1,
  }),
  useStartNarrative: () => ({ mutate: vi.fn(), isPending: false }),
  useTickNarrative: () => ({ mutate: vi.fn() }),
  useRefreshNarrative: () => ({ mutate: vi.fn() }),
}));

type Props = React.ComponentProps<typeof InspectorTabs>;

function renderTabs(overrides: Partial<Props>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = {
    milestone: null,
    onClose: () => {},
    width: 420,
    onResize: () => {},
    projectId: 'p',
    sessionId: 's',
    live: false,
    milestones: [],
    orderIds: [],
    currentIndex: 0,
    onScrubToIndex: () => {},
    ...overrides,
  } as Props;
  return render(
    <QueryClientProvider client={qc}>
      <InspectorTabs {...props} />
    </QueryClientProvider>,
  );
}

describe('InspectorTabs visibility', () => {
  it('playback + no selected Thought renders nothing (canvas stays full-bleed)', () => {
    const { container } = renderTabs({ live: false, milestone: null });
    expect(container.querySelector('[data-testid="inspector-tabs"]')).toBeNull();
  });

  it('LIVE + no selected Thought docks and exposes the Logical Steps tab', () => {
    renderTabs({ live: true, milestone: null });
    expect(screen.getByTestId('inspector-tabs')).toBeTruthy();
    expect(screen.getByTestId('tab-narrative')).toBeTruthy();
    // live defaults to the narrative tab, so the opt-in prompt is shown
    expect(screen.getByTestId('narr-enable')).toBeTruthy();
  });

  it('keeps generated steps after switching to Details and back (enabled is host-owned)', () => {
    renderTabs({ live: true, milestone: null }); // defaults to the narrative tab
    // opt in → steps render
    fireEvent.click(screen.getByTestId('narr-enable'));
    expect(screen.getByTestId('narr-block-b1')).toBeTruthy();
    // round-trip through Details (this unmounts NarrativeTab)
    fireEvent.click(screen.getByTestId('tab-details'));
    fireEvent.click(screen.getByTestId('tab-narrative'));
    // steps are back immediately — no re-enable prompt
    expect(screen.getByTestId('narr-block-b1')).toBeTruthy();
    expect(screen.queryByTestId('narr-enable')).toBeNull();
  });
});
