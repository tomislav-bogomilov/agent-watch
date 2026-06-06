import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverallSpendList } from '../../../src/tokens/OverallSpendList';
import type { ModelSummary } from '../../../src/tokens/aggregate';
import type { CostSummary } from '../../../src/tokens/cost';
import { zeroSplit } from '../../../src/tokens/cost';

const SUMMARIES: ModelSummary[] = [
  { modelId: 'claude-opus-4-7', isSubagent: false, input: 100, output: 50, cached: 200, total: 350 },
  { modelId: 'claude-opus-4-7', isSubagent: true,  input: 2,   output: 1,  cached: 10,  total: 13 },
];

function emptyCosts(): CostSummary {
  return { total: zeroSplit(), byModel: new Map(), unpricedTokens: 0, unpricedModels: [] };
}

const COSTS: CostSummary = {
  total: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 0.25, total: 3.75 },
  byModel: new Map([
    ['claude-opus-4-7', { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 0.25, total: 3.75 }],
  ]),
  unpricedTokens: 0,
  unpricedModels: [],
};

describe('OverallSpendList', () => {
  it('renders one row per summary with the model label', () => {
    render(<OverallSpendList summaries={SUMMARIES} costs={emptyCosts()} />);
    expect(screen.getByTestId('model-row-claude-opus-4-7')).toBeDefined();
    expect(screen.getByTestId('model-row-claude-opus-4-7|sub')).toBeDefined();
  });

  it('renders an empty-state message when there are no summaries', () => {
    render(<OverallSpendList summaries={[]} costs={emptyCosts()} />);
    expect(screen.getByText(/NO USAGE/i)).toBeDefined();
  });

  it('marks the subagent row with a "subagent" indicator', () => {
    render(<OverallSpendList summaries={SUMMARIES} costs={emptyCosts()} />);
    const row = screen.getByTestId('model-row-claude-opus-4-7|sub');
    expect(row.textContent).toContain('subagent');
  });

  it('renders a cost chip and breakdown line for priced models', () => {
    render(<OverallSpendList summaries={SUMMARIES} costs={COSTS} />);
    expect(screen.getByTestId('model-cost-claude-opus-4-7').textContent).toBe('≈ $3.75');
    expect(screen.getByTestId('model-cost-breakdown-claude-opus-4-7').textContent)
      .toBe('in $1.00 · out $2.00 · cache r $0.50 · cache w $0.25');
    expect(screen.getByTestId('model-cost-all').textContent).toBe('≈ $3.75');
  });

  it('omits the chip for models with no price and shows the unpriced warning', () => {
    const costs: CostSummary = { ...emptyCosts(), unpricedTokens: 1_200_000, unpricedModels: ['claude-fake'] };
    render(<OverallSpendList summaries={SUMMARIES} costs={costs} />);
    expect(screen.queryByTestId('model-cost-claude-opus-4-7')).toBeNull();
    expect(screen.getByTestId('unpriced-warning').textContent)
      .toContain('1.2M TOKENS FROM 1 UNPRICED MODEL');
  });
});
