import { describe, it, expect } from 'vitest';
import { extractMainTrail } from '../../../src/components/live/extractMainTrail';
import type { Milestone } from '../../../src/parse/types';

function m(id: string, kind: Milestone['kind'], children: Milestone[] = []): Milestone {
  return {
    id, kind,
    label: id, summary: '', timestamp: '', failed: false, raw: null,
    children,
  };
}

describe('extractMainTrail', () => {
  it('returns root + descendants for a simple chain', () => {
    const root = m('a', 'root_prompt', [m('b', 'assistant_turn', [m('c', 'tool_call')])]);
    expect(extractMainTrail(root).map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the subagent_spawn node but excludes its inner content', () => {
    // subagent_spawn's children[0] is the sub-agent root (inner); children[1+] is the rest of the main trail.
    const subAgentInner = m('s1', 'assistant_turn', [m('s2', 'tool_call')]);
    const root = m('a', 'root_prompt', [
      m('spawn', 'subagent_spawn', [
        subAgentInner,
        m('after', 'assistant_turn'),
      ]),
    ]);
    expect(extractMainTrail(root).map((n) => n.id)).toEqual(['a', 'spawn', 'after']);
  });

  it('handles a subagent_spawn with no main continuation', () => {
    const root = m('a', 'root_prompt', [
      m('spawn', 'subagent_spawn', [m('s1', 'assistant_turn')]),
    ]);
    expect(extractMainTrail(root).map((n) => n.id)).toEqual(['a', 'spawn']);
  });
});
