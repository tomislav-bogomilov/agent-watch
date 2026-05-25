import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverallSpendList } from '../../../src/tokens/OverallSpendList';
import type { ModelSummary } from '../../../src/tokens/aggregate';

const summaries: ModelSummary[] = [
  { modelId: 'opus', isSubagent: false, input: 100, output: 50, cached: 200, total: 350 },
  { modelId: 'opus', isSubagent: true,  input: 2,   output: 1,  cached: 10,  total: 13 },
];

describe('OverallSpendList', () => {
  it('renders one row per summary with the model label', () => {
    render(<OverallSpendList summaries={summaries} />);
    expect(screen.getByTestId('model-row-opus')).toBeDefined();
    expect(screen.getByTestId('model-row-opus|sub')).toBeDefined();
  });

  it('renders an empty-state message when there are no summaries', () => {
    render(<OverallSpendList summaries={[]} />);
    expect(screen.getByText(/NO USAGE/i)).toBeDefined();
  });

  it('marks the subagent row with a "subagent" indicator', () => {
    render(<OverallSpendList summaries={summaries} />);
    const row = screen.getByTestId('model-row-opus|sub');
    expect(row.textContent).toContain('subagent');
  });
});
