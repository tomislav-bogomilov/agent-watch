import { describe, it, expect } from 'vitest';
import { parseSession } from '../../../src/parse';

const mainJsonl = [
  JSON.stringify({
    uuid: 'u1', parentUuid: null, timestamp: 't0',
    type: 'user', message: { role: 'user', content: 'Delegate this' },
  }),
  JSON.stringify({
    uuid: 'u2', parentUuid: 'u1', timestamp: 't1',
    type: 'assistant',
    message: { role: 'assistant', content: [
      { type: 'tool_use', id: 'tu_task', name: 'Task',
        input: { subagent_type: 'Explore', description: 'find stuff', prompt: 'go' } },
    ] },
  }),
  JSON.stringify({
    uuid: 'u3', parentUuid: 'u2', timestamp: 't2',
    type: 'user', message: { role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_task', content: 'sub returned ok', is_error: false }] },
  }),
  JSON.stringify({
    uuid: 'u4', parentUuid: 'u3', timestamp: 't3',
    type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Continuing main.' }] },
  }),
].join('\n');

const subJsonl = [
  JSON.stringify({
    uuid: 's1', parentUuid: null, timestamp: 't1a', isSidechain: true,
    type: 'user', message: { role: 'user', content: 'go' },
    relatedToolUseId: 'tu_task',
  }),
  JSON.stringify({
    uuid: 's2', parentUuid: 's1', timestamp: 't1b', isSidechain: true,
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'Subagent thinking. Done.' }] },
  }),
].join('\n');

describe('subagent attachment', () => {
  it('attaches a subagent subtree as the first child of the spawn node', () => {
    const session = parseSession({
      projectId: 'p', sessionId: 's', cwd: '/proj', jsonl: mainJsonl,
      subagents: [{ id: 'agent-x', jsonl: subJsonl, lastUpdatedAt: '2024-01-01T00:00:00.000Z' }],
    });
    // root -> subagent_spawn
    const spawn = session.root.children[0];
    expect(spawn.kind).toBe('subagent_spawn');
    // spawn.children = [subagent_root, next_main]
    expect(spawn.children.length).toBe(2);
    expect(spawn.children[0].kind).toBe('root_prompt');
    expect(spawn.children[0].summary).toBe('go');
    expect(spawn.children[1].kind).toBe('completion');
  });
});
