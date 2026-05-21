import { describe, it, expect } from 'vitest';
import { layoutTree } from '../../../src/graph/layout';
import type { Milestone } from '../../../src/parse/types';

function ms(id: string, children: Milestone[] = []): Milestone {
  return {
    id, kind: 'tool_call', label: id, summary: id,
    timestamp: '', failed: false, raw: null, children,
  };
}

describe('layoutTree', () => {
  it('produces one node per milestone and N-1 edges for a linear tree', () => {
    const root = ms('a', [ms('b', [ms('c')])]);
    const { nodes, edges } = layoutTree(root);
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);
  });

  it('node positions advance vertically as depth increases', () => {
    const root = ms('a', [ms('b', [ms('c')])]);
    const { nodes } = layoutTree(root);
    const a = nodes.find((n) => n.id === 'a')!;
    const b = nodes.find((n) => n.id === 'b')!;
    const c = nodes.find((n) => n.id === 'c')!;
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y);
  });

  it('edges reference nodes by id', () => {
    const root = ms('a', [ms('b')]);
    const { edges } = layoutTree(root);
    expect(edges[0].sourceId).toBe('a');
    expect(edges[0].targetId).toBe('b');
  });

  it('handles a two-child node (subagent_spawn)', () => {
    const root = ms('a', [ms('sub'), ms('next')]);
    const { nodes, edges } = layoutTree(root);
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);
    const sub = nodes.find((n) => n.id === 'sub')!;
    const next = nodes.find((n) => n.id === 'next')!;
    expect(sub.x).not.toBe(next.x);
  });
});
