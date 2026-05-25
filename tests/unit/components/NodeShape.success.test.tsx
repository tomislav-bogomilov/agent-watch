import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { NodeShape } from '../../../src/components/NodeShape';
import type { LaidOutNode } from '../../../src/graph/layout';

function makeNode(kind: 'tool_call' | 'assistant_turn' | 'root_prompt'): LaidOutNode {
  return {
    id: 'n1',
    x: 50,
    y: 50,
    milestone: {
      id: 'n1',
      kind,
      label: 'Sample',
      timestamp: '2026-05-25T00:00:00Z',
      contextSize: 8192,
      children: [],
    } as unknown as LaidOutNode['milestone'],
  } as LaidOutNode;
}

function fillOf(svg: SVGSVGElement, kind: string): string {
  const g = svg.querySelector(`g[data-kind="${kind}"]`);
  if (!g) throw new Error(`no node group for kind=${kind}`);
  const path = g.querySelector('path');
  return path?.getAttribute('fill') ?? '';
}

describe('NodeShape success styling (P1)', () => {
  it('tool_call success uses the lifted fill #1c4a40', () => {
    const { container } = render(
      <svg>
        <NodeShape node={makeNode('tool_call')} state="success" inSubagent={false} />
      </svg>,
    );
    expect(fillOf(container.querySelector('svg')!, 'tool_call')).toBe('#1c4a40');
  });

  it('assistant_turn success uses #1a3d54', () => {
    const { container } = render(
      <svg>
        <NodeShape node={makeNode('assistant_turn')} state="success" inSubagent={false} />
      </svg>,
    );
    expect(fillOf(container.querySelector('svg')!, 'assistant_turn')).toBe('#1a3d54');
  });

  it('root_prompt success uses #1a4254', () => {
    const { container } = render(
      <svg>
        <NodeShape node={makeNode('root_prompt')} state="success" inSubagent={false} />
      </svg>,
    );
    expect(fillOf(container.querySelector('svg')!, 'root_prompt')).toBe('#1a4254');
  });

  it('success text color uses --text (not --node-success)', () => {
    const { container } = render(
      <svg>
        <NodeShape node={makeNode('tool_call')} state="success" inSubagent={false} />
      </svg>,
    );
    const text = container.querySelector('svg g[data-kind="tool_call"] text');
    expect(text?.getAttribute('fill')).toBe('var(--text)');
  });

  it('success no longer carries the tg-shimmer animation', () => {
    const { container } = render(
      <svg>
        <NodeShape node={makeNode('tool_call')} state="success" inSubagent={false} />
      </svg>,
    );
    const path = container.querySelector('svg g[data-kind="tool_call"] path');
    const style = path?.getAttribute('style') ?? '';
    expect(style).not.toContain('tg-shimmer');
  });

  it('context badge stroke matches success stroke (mint)', () => {
    const { container } = render(
      <svg>
        <NodeShape node={makeNode('tool_call')} state="success" inSubagent={false} showContextBadge />
      </svg>,
    );
    const badge = container.querySelector('[data-testid="context-badge"] rect');
    expect(badge?.getAttribute('stroke')).toBe('var(--node-success)');
  });
});
