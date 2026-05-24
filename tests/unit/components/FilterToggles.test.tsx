import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterToggles, type Filters } from '../../../src/components/FilterToggles';

const ALL_OFF: Filters = {
  hidePruned: false, hideSubagents: false,
  successOnly: false, showAllContext: false,
};

function renderWith(value: Filters) {
  let current = value;
  const onChange = (next: Filters) => { current = next; };
  const utils = render(<FilterToggles value={current} onChange={onChange} />);
  return { ...utils, get current() { return current; } };
}

describe('FilterToggles', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the collapsed chip by default', () => {
    renderWith(ALL_OFF);
    expect(screen.getByTestId('filter-toggle-collapsed')).toBeTruthy();
    expect(screen.queryByTestId('filter-pruned')).toBeNull();
  });

  it('shows numeric badge with count of active filters', () => {
    renderWith({ ...ALL_OFF, hidePruned: true, hideSubagents: true });
    const chip = screen.getByTestId('filter-toggle-collapsed');
    expect(chip.textContent).toContain('2');
  });

  it('hides badge when no filter is active', () => {
    renderWith(ALL_OFF);
    const chip = screen.getByTestId('filter-toggle-collapsed');
    // No number in the chip text other than the icon glyph
    expect(chip.textContent).not.toMatch(/\d/);
  });

  it('expands on chip click, collapses on close click', () => {
    renderWith(ALL_OFF);
    fireEvent.click(screen.getByTestId('filter-toggle-collapsed'));
    expect(screen.getByTestId('filter-pruned')).toBeTruthy();
    expect(screen.getByTestId('filter-subagents')).toBeTruthy();
    expect(screen.getByTestId('filter-success-only')).toBeTruthy();
    expect(screen.getByTestId('filter-show-all-context')).toBeTruthy();

    fireEvent.click(screen.getByTestId('filter-close'));
    expect(screen.queryByTestId('filter-pruned')).toBeNull();
    expect(screen.getByTestId('filter-toggle-collapsed')).toBeTruthy();
  });

  it('persists open state to localStorage', () => {
    renderWith(ALL_OFF);
    fireEvent.click(screen.getByTestId('filter-toggle-collapsed'));
    expect(localStorage.getItem('tg.filters.open')).toBe('true');

    fireEvent.click(screen.getByTestId('filter-close'));
    expect(localStorage.getItem('tg.filters.open')).toBe('false');
  });

  it('respects persisted open state on mount', () => {
    localStorage.setItem('tg.filters.open', 'true');
    renderWith(ALL_OFF);
    // Mounts already expanded — chip and panel co-exist; checkboxes are visible.
    expect(screen.getByTestId('filter-pruned')).toBeTruthy();
  });
});
