import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NarrativeBlock } from '../../../src/components/narrative/NarrativeBlock';
import { VerbosityControl } from '../../../src/components/narrative/VerbosityControl';
import { RefreshButton } from '../../../src/components/narrative/RefreshButton';

const block = {
  id: 'b1', phase: 'Explore', title: 'Explore the codebase', summary: 'scanned src',
  detail: 'the detail', status: 'active' as const, startMilestoneId: 'm1', endMilestoneId: 'm2', thoughtCount: 6,
};

describe('NarrativeBlock', () => {
  it('renders title, summary, and a running chip when active', () => {
    render(<NarrativeBlock block={block} active isNew={false} showDetail={false} onClick={() => {}} />);
    expect(screen.getByText('Explore the codebase')).toBeTruthy();
    expect(screen.getByText('running…')).toBeTruthy();
    expect(screen.queryByText('the detail')).toBeNull();
  });
  it('shows detail when showDetail is true', () => {
    render(<NarrativeBlock block={block} active={false} isNew={false} showDetail onClick={() => {}} />);
    expect(screen.getByText('the detail')).toBeTruthy();
  });
  it('fires onClick', () => {
    const onClick = vi.fn();
    render(<NarrativeBlock block={block} active={false} isNew={false} showDetail={false} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('narr-block-b1'));
    expect(onClick).toHaveBeenCalled();
  });
  it('fires onClick when Enter is pressed (a11y)', () => {
    const onClick = vi.fn();
    render(<NarrativeBlock block={block} active={false} isNew={false} showDetail={false} onClick={onClick} />);
    fireEvent.keyDown(screen.getByTestId('narr-block-b1'), { key: 'Enter' });
    expect(onClick).toHaveBeenCalled();
  });
});

describe('VerbosityControl', () => {
  it('marks the active level and reports changes', () => {
    const onChange = vi.fn();
    render(<VerbosityControl value="steps" onChange={onChange} />);
    fireEvent.click(screen.getByText('Overview'));
    expect(onChange).toHaveBeenCalledWith('overview');
  });
});

describe('RefreshButton', () => {
  it('is disabled and shows Rebuilding… while building', () => {
    render(<RefreshButton building onClick={() => {}} />);
    const btn = screen.getByTestId('narr-refresh') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText('Rebuilding…')).toBeTruthy();
  });
  it('is enabled and fires onClick when idle', () => {
    const onClick = vi.fn();
    render(<RefreshButton building={false} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('narr-refresh'));
    expect(onClick).toHaveBeenCalled();
  });
});
