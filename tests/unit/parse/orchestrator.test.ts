import { describe, it, expect } from 'vitest';
import { parseSession } from '../../../src/parse';

const jsonl = [
  JSON.stringify({
    uuid: '1', parentUuid: null, timestamp: '2026-05-21T00:00:00Z',
    type: 'user', message: { role: 'user', content: 'Please add a feature' },
  }),
  JSON.stringify({
    uuid: '2', parentUuid: '1', timestamp: '2026-05-21T00:00:01Z',
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'On it. Reading first.' }, { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: '/x.txt' } }] },
  }),
  JSON.stringify({
    uuid: '3', parentUuid: '2', timestamp: '2026-05-21T00:00:02Z',
    type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'hello\nworld\n', is_error: false }] },
  }),
  JSON.stringify({
    uuid: '4', parentUuid: '3', timestamp: '2026-05-21T00:00:03Z',
    type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'All done!' }] },
  }),
].join('\n');

describe('parseSession orchestrator', () => {
  it('returns a Session with expected structure', () => {
    const session = parseSession({
      provider: 'claude',
      projectId: 'p', sessionId: 's', cwd: '/proj', jsonl, subagents: [],
    });
    expect(session.id).toBe('s');
    // buildMilestones: assistant with text+tool_use only emits tool_call (not a separate assistant_turn)
    // chain: root_prompt -> tool_call -> completion = 3 milestones
    expect(session.totalMilestones).toBe(3);
    expect(session.root.kind).toBe('root_prompt');
    // root -> tool_call -> completion
    const chain: string[] = [];
    let node = session.root;
    while (node) {
      chain.push(node.kind);
      node = node.children[0];
    }
    expect(chain).toEqual(['root_prompt', 'tool_call', 'completion']);
    expect(session.successPath.size).toBe(3);
  });
});
