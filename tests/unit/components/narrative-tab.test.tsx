import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NarrativeTab } from '../../../src/components/narrative/NarrativeTab';

const blocks = [
  { id: 'b1', phase: 'Explore', title: 'Explore', summary: 's1', status: 'completed', startMilestoneId: 'm1', endMilestoneId: 'm2' },
  { id: 'b2', phase: 'Implement', title: 'Implement', summary: 's2', status: 'active', startMilestoneId: 'm3', endMilestoneId: 'm4' },
];
const mutate = vi.fn();
vi.mock('../../../src/api/hooks', () => ({
  useNarrative: () => ({ data: { blocks, building: false, error: null, model: 'haiku', generatedAt: 'x' }, dataUpdatedAt: 1 }),
  useStartNarrative: () => ({ mutate, isPending: false }),
  useTickNarrative: () => ({ mutate: vi.fn() }),
  useRefreshNarrative: () => ({ mutate: vi.fn() }),
}));

const props = {
  projectId: 'p', sessionId: 's', live: false,
  milestones: [], orderIds: ['m1', 'm2', 'm3', 'm4'], currentIndex: 3, onScrubToIndex: vi.fn(),
};

describe('NarrativeTab', () => {
  it('shows the enable prompt first, then blocks after enable', () => {
    render(<NarrativeTab {...props} />);
    expect(screen.getByTestId('narr-enable')).toBeTruthy();
    fireEvent.click(screen.getByTestId('narr-enable'));
    expect(mutate).toHaveBeenCalledWith({ projectId: 'p', sessionId: 's', milestones: [] });
    expect(screen.getByTestId('narr-block-b1')).toBeTruthy();
    expect(screen.getByTestId('narr-block-b2')).toBeTruthy();
  });

  it('click on a block scrubs to its start index', () => {
    render(<NarrativeTab {...props} />);
    fireEvent.click(screen.getByTestId('narr-enable'));
    fireEvent.click(screen.getByTestId('narr-block-b2'));
    expect(props.onScrubToIndex).toHaveBeenCalledWith(2); // m3 -> index 2
  });
});
