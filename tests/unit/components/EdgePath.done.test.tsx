import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EdgePath } from '../../../src/components/EdgePath';
import type { LaidOutEdge } from '../../../src/graph/layout';

const edge: LaidOutEdge = {
  sourceId: 's',
  targetId: 't',
  sourceX: 0,
  sourceY: 0,
  targetX: 80,
  targetY: 80,
};

function pathOf(container: HTMLElement): SVGPathElement {
  return container.querySelector('svg path') as SVGPathElement;
}

describe('EdgePath done state (trail update)', () => {
  it('recent done (freshness 1) keeps cyan stroke', () => {
    const { container } = render(
      <svg>
        <EdgePath edge={edge} state="done" progress={1} inSubagent={false} freshness={1} />
      </svg>,
    );
    expect(pathOf(container).getAttribute('stroke')).toBe('var(--edge-trail)');
  });

  it('older done (freshness 0.3) switches to mint stroke', () => {
    const { container } = render(
      <svg>
        <EdgePath edge={edge} state="done" progress={1} inSubagent={false} freshness={0.3} />
      </svg>,
    );
    expect(pathOf(container).getAttribute('stroke')).toBe('var(--node-success)');
  });

  it('older done opacity floor is at least 0.40 even at freshness 0', () => {
    const { container } = render(
      <svg>
        <EdgePath edge={edge} state="done" progress={1} inSubagent={false} freshness={0} />
      </svg>,
    );
    const op = Number(pathOf(container).getAttribute('opacity'));
    expect(op).toBeGreaterThanOrEqual(0.4);
  });

  it('drawing, idle and pruned states retain cyan stroke', () => {
    for (const state of ['drawing', 'idle', 'pruned'] as const) {
      const { container } = render(
        <svg>
          <EdgePath edge={edge} state={state} progress={0.5} inSubagent={false} freshness={1} />
        </svg>,
      );
      expect(pathOf(container).getAttribute('stroke')).toBe('var(--edge-trail)');
    }
  });

  it('subagent done edges keep subagent-accent stroke regardless of freshness', () => {
    const { container } = render(
      <svg>
        <EdgePath edge={edge} state="done" progress={1} inSubagent={true} freshness={0.2} />
      </svg>,
    );
    expect(pathOf(container).getAttribute('stroke')).toBe('var(--subagent-accent)');
  });
});
