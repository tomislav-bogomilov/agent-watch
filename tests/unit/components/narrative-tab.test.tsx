import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NarrativeTab } from '../../../src/components/narrative/NarrativeTab';

// Mutable holder so individual tests can flip `building` without re-mocking.
const H = vi.hoisted(() => {
  const blocks = [
    { id: 'b1', phase: 'Explore', title: 'Explore', summary: 's1', status: 'completed', startMilestoneId: 'm1', endMilestoneId: 'm2' },
    { id: 'b2', phase: 'Implement', title: 'Implement', summary: 's2', status: 'active', startMilestoneId: 'm3', endMilestoneId: 'm4' },
  ];
  return { blocks, building: { value: false }, startMutate: { fn: (..._a: unknown[]) => {} } };
});

vi.mock('../../../src/api/hooks', () => ({
  useNarrative: () => ({
    data: { blocks: H.blocks, building: H.building.value, error: null, model: 'haiku', generatedAt: 'x' },
    dataUpdatedAt: 1,
  }),
  useStartNarrative: () => ({ mutate: H.startMutate.fn, isPending: false }),
  useTickNarrative: () => ({ mutate: vi.fn() }),
  useRefreshNarrative: () => ({ mutate: vi.fn() }),
}));

const props = {
  projectId: 'p', sessionId: 's', live: false,
  milestones: [], orderIds: ['m1', 'm2', 'm3', 'm4'], currentIndex: 3,
  onScrubToIndex: vi.fn(), onSelectNode: vi.fn(),
};

beforeEach(() => {
  H.building.value = false;
  H.startMutate.fn = vi.fn();
});

describe('NarrativeTab', () => {
  it('shows the enable prompt first, then blocks after enable', () => {
    render(<NarrativeTab {...props} />);
    expect(screen.getByTestId('narr-enable')).toBeTruthy();
    fireEvent.click(screen.getByTestId('narr-enable'));
    expect(H.startMutate.fn).toHaveBeenCalledWith({ projectId: 'p', sessionId: 's', milestones: [] });
    expect(screen.getByTestId('narr-block-b1')).toBeTruthy();
    expect(screen.getByTestId('narr-block-b2')).toBeTruthy();
  });

  it('click on a block scrubs to its start index AND selects its start node', () => {
    render(<NarrativeTab {...props} />);
    fireEvent.click(screen.getByTestId('narr-enable'));
    fireEvent.click(screen.getByTestId('narr-block-b2'));
    expect(props.onScrubToIndex).toHaveBeenCalledWith(2);  // m3 -> index 2
    expect(props.onSelectNode).toHaveBeenCalledWith('m3'); // b2.startMilestoneId
  });

  it('keeps the already-generated steps visible while a refresh/rebuild is in flight', () => {
    H.building.value = true; // an auto-refresh (LIVE tick) or manual rebuild is running
    render(<NarrativeTab {...props} enabled />);
    // existing blocks stay rendered — they must not be swapped for a full loader
    expect(screen.getByTestId('narr-block-b1')).toBeTruthy();
    expect(screen.getByTestId('narr-block-b2')).toBeTruthy();
    // the flow is flagged as building so the UI can show a subtle in-flight cue
    expect(screen.getByTestId('narr-flow').getAttribute('data-building')).toBe('true');
    // the RefreshButton carries the in-flight cue ("Rebuilding…")…
    expect(screen.getByText(/Rebuilding…/)).toBeTruthy();
    // …but the full-screen ArmillaryLoader (role="status") did NOT replace the steps
    expect(screen.queryByRole('status')).toBeNull();
  });
});
