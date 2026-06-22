import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { InspectorTabs } from '../../../src/components/narrative/InspectorTabs';

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
});
