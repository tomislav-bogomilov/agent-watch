import { describe, it, expect } from 'vitest';
import { flattenDFS } from '../../src/playback/usePlayback';
import type { Milestone } from '../../src/parse/types';

function ms(id: string, children: Milestone[] = []): Milestone {
  return {
    id, kind: 'tool_call', label: id, summary: id,
    timestamp: '', failed: false, raw: null, children,
  };
}

describe('flattenDFS', () => {
  it('linear tree -> in-order ids', () => {
    const root = ms('a', [ms('b', [ms('c')])]);
    expect(flattenDFS(root).map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('subagent spawn (2 children) -> subagent subtree visited before main next', () => {
    // a -> [sub_root -> sub_leaf, next_main -> done]
    const sub = ms('sub_root', [ms('sub_leaf')]);
    const main = ms('next_main', [ms('done')]);
    const spawn = ms('spawn', [sub, main]);
    const root = ms('root', [spawn]);
    expect(flattenDFS(root).map((n) => n.id)).toEqual([
      'root',
      'spawn',
      'sub_root',
      'sub_leaf',
      'next_main',
      'done',
    ]);
  });
});
