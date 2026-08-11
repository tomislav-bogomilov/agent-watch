import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DetailPanel } from '../../../src/components/DetailPanel';
import type { Milestone } from '../../../src/parse/types';

function milestone(over: Partial<Milestone> = {}): Milestone {
  return {
    id: 'codex:1',
    kind: 'assistant_turn',
    label: 'Decided',
    summary: 'Inspect the code',
    timestamp: '2026-08-11T10:00:00Z',
    failed: false,
    raw: {},
    children: [],
    ...over,
  };
}

describe('DetailPanel', () => {
  it('shows context capacity and labels reasoning as part of output', () => {
    render(<DetailPanel
      milestone={milestone({
        usage: { input: 300, cacheRead: 600, cacheCreation: 100, output: 80, reasoningOutput: 30 },
        contextSize: 1_000,
        contextWindow: 258_400,
      })}
      onClose={() => {}}
      width={360}
      onResize={() => {}}
    />);

    expect(screen.getByTestId('detail-context-capacity').textContent).toContain('258,400');
    expect(screen.getByTestId('detail-reasoning-output').textContent).toContain('30');
    expect(screen.getByTestId('detail-reasoning-output').textContent).toContain('of output');
  });
});
