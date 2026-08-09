import { describe, expect, it } from 'vitest';
import { parseSession } from '../../../src/parse';
import type { CodexSessionPayload, Milestone } from '../../../src/parse/types';

function record(timestamp: string, type: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ timestamp, type, payload });
}

function payload(jsonl: string, subagents: CodexSessionPayload['subagents'] = []): CodexSessionPayload {
  return {
    provider: 'codex',
    projectId: 'project',
    sessionId: 'main',
    cwd: 'D:/project',
    jsonl,
    subagents,
  };
}

function message(ts: string, role: 'user' | 'assistant', text: string): string {
  return record(ts, 'response_item', {
    type: 'message', role,
    content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }],
  });
}

function walk(root: Milestone): Milestone[] {
  const result: Milestone[] = [];
  const visit = (node: Milestone) => {
    result.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  return result;
}

describe('Codex session parsing', () => {
  it('maps user, visible reasoning, and assistant messages in JSONL order', () => {
    const session = parseSession(payload([
      record('t0', 'session_meta', { id: 'main', cwd: 'D:/project' }),
      message('t1', 'user', 'Build it'),
      record('t2', 'event_msg', { type: 'agent_reasoning', text: 'Inspect the code first' }),
      message('t3', 'assistant', 'Implemented'),
      record('t4', 'event_msg', { type: 'agent_message', message: 'Implemented' }),
      record('t5', 'world_state', { ignored: true }),
      'not-json',
    ].join('\n')));

    const nodes = walk(session.root);
    expect(nodes.map((node) => [node.kind, node.label, node.summary])).toEqual([
      ['root_prompt', 'Prompt', 'Build it'],
      ['assistant_turn', 'Decided', 'Inspect the code first'],
      ['completion', 'Done', 'Implemented'],
    ]);
    expect(nodes.every((node) => node.id.startsWith('main:'))).toBe(true);
  });

  it('uses response reasoning summaries only when visible reasoning is absent', () => {
    const reasoning = record('t2', 'response_item', {
      type: 'reasoning', summary: [{ type: 'summary_text', text: 'Fallback reasoning' }],
      encrypted_content: 'ignored',
    });
    const fallback = parseSession(payload([message('t1', 'user', 'Question'), reasoning, message('t3', 'assistant', 'Answer')].join('\n')));
    expect(walk(fallback.root).map((node) => node.summary)).toEqual(['Question', 'Fallback reasoning', 'Answer']);

    const visible = parseSession(payload([
      message('t1', 'user', 'Question'), reasoning,
      record('t2.5', 'event_msg', { type: 'agent_reasoning', text: 'Visible reasoning' }),
      message('t3', 'assistant', 'Answer'),
    ].join('\n')));
    expect(walk(visible.root).map((node) => node.summary)).toEqual(['Question', 'Visible reasoning', 'Answer']);

    const visibleInChild = parseSession(payload([
      message('t1', 'user', 'Question'), reasoning, message('t4', 'assistant', 'Answer'),
    ].join('\n'), [{
      threadId: 'child', parentThreadId: 'main', startedAt: 't2', lastUpdatedAt: 't3',
      jsonl: [
        message('t2', 'user', 'Child question'),
        record('t2.5', 'event_msg', { type: 'agent_reasoning', text: 'Child visible reasoning' }),
        message('t3', 'assistant', 'Child answer'),
      ].join('\n'),
    }]));
    expect(walk(visibleInChild.root).map((node) => node.summary)).not.toContain('Fallback reasoning');
  });

  it('ignores environment/plugin envelopes and non-user message roles', () => {
    const session = parseSession(payload([
      message('t0', 'user', '<environment_context><cwd>D:/project</cwd></environment_context>'),
      message('t1', 'user', '<recommended_plugins><plugin>x</plugin></recommended_plugins>'),
      record('t2', 'response_item', { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'internal instructions' }] }),
      message('t3', 'user', 'Actual request'),
      message('t4', 'assistant', 'Actual answer'),
    ].join('\n')));
    expect(walk(session.root).map((node) => node.summary)).toEqual(['Actual request', 'Actual answer']);
  });

  it('correlates both tool call shapes with outputs and only marks explicit failures', () => {
    const session = parseSession(payload([
      message('t0', 'user', 'Run tools'),
      record('t1', 'response_item', { type: 'function_call', call_id: 'c1', name: 'shell_command', arguments: '{"command":"ok"}' }),
      record('t2', 'response_item', { type: 'function_call_output', call_id: 'c1', output: { exit_code: 0, text: 'contains the word error but succeeded' } }),
      record('t3', 'response_item', { type: 'custom_tool_call', call_id: 'c2', name: 'apply_patch', input: 'patch' }),
      record('t4', 'response_item', { type: 'custom_tool_call_output', call_id: 'c2', output: { status: 'failed', error: 'rejected' } }),
      message('t5', 'assistant', 'Finished'),
    ].join('\n')));
    const tools = walk(session.root).filter((node) => node.kind === 'tool_call');

    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({ toolName: 'shell_command', failed: false });
    expect(tools[0].result).toContain('contains the word error');
    expect(tools[1]).toMatchObject({ toolName: 'apply_patch', failed: true });
  });

  it('recognizes explicit nonzero exit text and is_error without prose inference', () => {
    const session = parseSession(payload([
      message('t0', 'user', 'Run'),
      record('t1', 'response_item', { type: 'function_call', call_id: 'c1', name: 'one', arguments: '{}' }),
      record('t2', 'response_item', { type: 'function_call_output', call_id: 'c1', output: 'Exit code: 2\nfailed command' }),
      record('t3', 'response_item', { type: 'function_call', call_id: 'c2', name: 'two', arguments: '{}' }),
      record('t4', 'response_item', { type: 'function_call_output', call_id: 'c2', output: { is_error: true } }),
      message('t5', 'assistant', 'Done'),
    ].join('\n')));
    const tools = walk(session.root).filter((node) => node.kind === 'tool_call');
    expect(tools.map((node) => node.failed)).toEqual([true, true]);
  });

  it('attaches recursively nested children to exact start events with branch labels', () => {
    const child = [message('t2', 'user', 'Research'), record('t3', 'event_msg', { type: 'sub_agent_activity', kind: 'started', agent_thread_id: 'grandchild' }), message('t6', 'assistant', 'Research done')].join('\n');
    const grandchild = [message('t4', 'user', 'Inspect'), message('t5', 'assistant', 'Inspected')].join('\n');
    const session = parseSession(payload([
      message('t0', 'user', 'Delegate'),
      record('t1', 'event_msg', { type: 'sub_agent_activity', kind: 'started', agent_thread_id: 'child' }),
      message('t7', 'assistant', 'All done'),
    ].join('\n'), [
      { threadId: 'child', parentThreadId: 'main', agentPath: 'researcher', agentNickname: 'Scout', startedAt: 't2', lastUpdatedAt: 't6', jsonl: child },
      { threadId: 'grandchild', parentThreadId: 'child', agentPath: 'reviewer', agentNickname: 'Auditor', startedAt: 't4', lastUpdatedAt: 't5', jsonl: grandchild },
    ]));

    const mainSpawn = session.root.children[0];
    expect(mainSpawn).toMatchObject({ kind: 'subagent_spawn', label: '→ Scout' });
    const childRoot = mainSpawn.children[0];
    const nestedSpawn = childRoot.children[0];
    expect(nestedSpawn).toMatchObject({ kind: 'subagent_spawn', label: '→ Auditor' });
    expect(nestedSpawn.children[0].id.startsWith('grandchild:')).toBe(true);
    expect(mainSpawn.children[1]).toMatchObject({ kind: 'completion', summary: 'All done' });
  });

  it('synthesizes a chronologically placed spawn for guardian-style child metadata', () => {
    const session = parseSession(payload([
      message('t0', 'user', 'Start'),
      record('t1', 'event_msg', { type: 'agent_reasoning', text: 'Before child' }),
      message('t4', 'assistant', 'After child'),
    ].join('\n'), [{
      threadId: 'guardian-child', parentThreadId: 'main', agentPath: 'guardian',
      startedAt: 't2', lastUpdatedAt: 't3',
      jsonl: [message('t2', 'user', 'Guard'), message('t3', 'assistant', 'Guarded')].join('\n'),
    }]));

    const mainTrail = [session.root, session.root.children[0], session.root.children[0].children[0]];
    expect(mainTrail.map((node) => node.kind)).toEqual(['root_prompt', 'assistant_turn', 'subagent_spawn']);
    expect(mainTrail[2]).toMatchObject({ label: '→ guardian' });
    expect(mainTrail[2].children[0].id.startsWith('guardian-child:')).toBe(true);
    expect(mainTrail[2].children[1]).toMatchObject({ kind: 'completion', summary: 'After child' });
  });
});
