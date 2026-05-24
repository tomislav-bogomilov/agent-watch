import { describe, it, expect, beforeEach } from 'vitest';
import { layoutTree, _resetLayoutCacheForTests } from '../../../src/graph/layout';
import type { Milestone } from '../../../src/parse/types';

function ms(id: string, kind: Milestone['kind'] = 'tool_call', children: Milestone[] = []): Milestone {
  return { id, kind, label: id, summary: id, timestamp: '', failed: false, raw: null, children };
}

function clone(node: Milestone): Milestone {
  return { ...node, children: node.children.map(clone) };
}

describe('layoutTree cache', () => {
  beforeEach(() => { _resetLayoutCacheForTests(); });

  it('returns the same LayoutResult object identity for the same root ref', () => {
    const root = ms('a', 'tool_call', [ms('b'), ms('c')]);
    const r1 = layoutTree(root);
    const r2 = layoutTree(root);
    expect(r2).toBe(r1);
    expect(r2.nodes).toBe(r1.nodes);
    expect(r2.edges).toBe(r1.edges);
  });

  it('returns the same identity for structurally identical but cloned roots', () => {
    const root = ms('a', 'tool_call', [ms('b'), ms('c')]);
    const cloned = clone(root);
    const r1 = layoutTree(root);
    const r2 = layoutTree(cloned);
    expect(r2).toBe(r1);
  });

  it('returns a different identity when structure changes', () => {
    const r1 = layoutTree(ms('a', 'tool_call', [ms('b')]));
    const r2 = layoutTree(ms('a', 'tool_call', [ms('b'), ms('c')]));
    expect(r2).not.toBe(r1);
  });

  it('returns a different identity when a node kind changes', () => {
    const r1 = layoutTree(ms('a', 'tool_call', [ms('b', 'tool_call')]));
    const r2 = layoutTree(ms('a', 'tool_call', [ms('b', 'subagent_spawn')]));
    expect(r2).not.toBe(r1);
  });

  it('evicts old entries past the LRU cap (smoke)', () => {
    // Make 17 unique trees; the first should be evicted by the 17th insert.
    const trees: Milestone[] = [];
    for (let i = 0; i < 17; i++) trees.push(ms(`root-${i}`));
    const first = trees[0];
    const r1 = layoutTree(first);
    for (let i = 1; i < 17; i++) layoutTree(trees[i]);
    // Re-querying with a cloned `first` should NOT return r1 anymore (evicted).
    const r1Again = layoutTree(clone(first));
    expect(r1Again).not.toBe(r1);
  });
});
