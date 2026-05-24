import { describe, it, expect } from 'vitest';
import { extractSubagentPaneRoot } from '../../../src/components/live/extractSubagentPaneRoot';
import type { Milestone } from '../../../src/parse/types';

function m(id: string, kind: Milestone['kind'], children: Milestone[] = []): Milestone {
  return { id, kind, label: id, summary: '', timestamp: '', failed: false, raw: null, children };
}

describe('extractSubagentPaneRoot', () => {
  it('returns a Milestone rooted at the spawn with the inner subtree as its only child branch', () => {
    const innerRoot = m('s1', 'assistant_turn', [m('s2', 'tool_call')]);
    const mainAfter = m('after', 'assistant_turn');
    const spawn = m('spawn', 'subagent_spawn', [innerRoot, mainAfter]);
    const root = extractSubagentPaneRoot(spawn);
    expect(root).not.toBeNull();
    expect(root!.id).toBe('spawn');
    expect(root!.children).toHaveLength(1);
    expect(root!.children[0].id).toBe('s1');
    expect(root!.children[0].children[0].id).toBe('s2');
  });

  it('returns null if the spawn has no inner subtree yet', () => {
    const spawn = m('spawn', 'subagent_spawn', []);
    expect(extractSubagentPaneRoot(spawn)).toBeNull();
  });
});
