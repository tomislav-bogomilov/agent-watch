import { describe, it, expect } from 'vitest';
import { makeLivePlayback } from '../../../src/components/live/livePlayback';
import type { Milestone } from '../../../src/parse/types';

function m(id: string, children: Milestone[] = []): Milestone {
  return { id, kind: 'tool_call', label: id, summary: '', timestamp: '', failed: false, raw: null, children };
}

describe('makeLivePlayback', () => {
  it('returns a playback state positioned at the last DFS node', () => {
    const root = m('a', [m('b', [m('c')])]);
    const pb = makeLivePlayback(root);
    expect(pb.order.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(pb.index).toBe(2);
    expect(pb.edgeProgress).toBe(1);
    expect(pb.playing).toBe(false);
    expect(pb.finished).toBe(false);
  });

  it('handles a single-node tree', () => {
    const root = m('a');
    const pb = makeLivePlayback(root);
    expect(pb.index).toBe(0);
    expect(pb.edgeProgress).toBe(1);
    expect(pb.finished).toBe(false);
  });
});
