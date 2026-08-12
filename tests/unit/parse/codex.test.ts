import { describe, expect, it } from 'vitest';
import { parseSession } from '../../../src/parse';
import { availableSkillsAt, skillsActiveAt } from '../../../src/parse/skills';
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

function tokenCount(
  ts: string,
  last: Record<string, unknown> | undefined,
  total: Record<string, unknown> = { input_tokens: 999_999 },
): string {
  return record(ts, 'event_msg', {
    type: 'token_count',
    info: {
      total_token_usage: total,
      ...(last ? { last_token_usage: last } : {}),
      model_context_window: 258_400,
    },
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
  it('attaches the last token snapshot to every milestone in a model cycle and the preceding prompt', () => {
    const session = parseSession(payload([
      message('t0', 'user', 'Inspect it'),
      record('t1', 'event_msg', { type: 'agent_reasoning', text: 'Inspect first' }),
      message('t2', 'assistant', 'I will inspect it.'),
      record('t3', 'response_item', { type: 'custom_tool_call', call_id: 'c1', name: 'exec', input: 'read files' }),
      record('t4', 'response_item', { type: 'custom_tool_call_output', call_id: 'c1', output: 'done' }),
      tokenCount('t5', {
        input_tokens: 1_000,
        cached_input_tokens: 600,
        cache_write_input_tokens: 100,
        output_tokens: 80,
        reasoning_output_tokens: 30,
      }),
    ].join('\n')));

    const nodes = walk(session.root);
    expect(nodes).toHaveLength(4);
    for (const node of nodes) {
      expect(node.usage).toEqual({
        input: 300,
        cacheRead: 600,
        cacheCreation: 100,
        output: 80,
        reasoningOutput: 30,
      });
      expect(node.contextSize).toBe(1_000);
      expect(node.contextWindow).toBe(258_400);
      expect(node.scopeId).toBe('main');
    }
  });

  it('clamps uncached input and ignores cumulative-only or malformed token snapshots', () => {
    const session = parseSession(payload([
      message('t0', 'user', 'First'),
      message('t1', 'assistant', 'First answer'),
      tokenCount('t2', {
        input_tokens: 10,
        cached_input_tokens: 20,
        cache_write_input_tokens: 5,
        output_tokens: 3,
        reasoning_output_tokens: 1,
      }),
      message('t3', 'user', 'Second'),
      message('t4', 'assistant', 'Second answer'),
      tokenCount('t5', undefined),
      message('t6', 'user', 'Third'),
      message('t7', 'assistant', 'Third answer'),
      tokenCount('t8', {
        input_tokens: 'bad',
        cached_input_tokens: 2,
        cache_write_input_tokens: 0,
        output_tokens: 1,
      }),
    ].join('\n')));

    const nodes = walk(session.root);
    expect(nodes[0].usage?.input).toBe(0);
    expect(nodes[1].usage?.input).toBe(0);
    expect(nodes[2].usage).toBeUndefined();
    expect(nodes[3].usage).toBeUndefined();
    expect(nodes[4].usage).toBeUndefined();
    expect(nodes[5].usage).toBeUndefined();
  });

  it('extracts evidence-backed skills and isolates them by rollout scope', () => {
    const skillBody = (name: string) => `---\nname: ${name}\ndescription: Test skill\n---\n# ${name}\nLoaded instructions.`;
    const catalog = (names: string[]) => names.map((name) => `- ${name}: description`).join('\n');
    const mainJsonl = [
      message('t0', 'user', 'Use skills'),
      record('t1', 'world_state', { state: { host_skills: { body: catalog(['main-one', 'main-two']) } } }),
      record('t2', 'response_item', { type: 'custom_tool_call', call_id: 'load-main', name: 'exec', input: 'Get-Content C:/skills/main-one/SKILL.md' }),
      record('t3', 'response_item', { type: 'custom_tool_call_output', call_id: 'load-main', output: `${skillBody('main-one')}\n${skillBody('main-two')}` }),
      record('t4', 'response_item', { type: 'custom_tool_call', call_id: 'load-duplicate', name: 'exec', input: 'Get-Content C:/skills/main-one/SKILL.md' }),
      record('t5', 'response_item', { type: 'custom_tool_call_output', call_id: 'load-duplicate', output: skillBody('"main-one"') }),
      record('t6', 'response_item', { type: 'custom_tool_call', call_id: 'path-only', name: 'exec', input: 'Get-Content C:/skills/not-loaded/SKILL.md' }),
      record('t7', 'response_item', { type: 'custom_tool_call_output', call_id: 'path-only', output: 'file unavailable' }),
      record('t8', 'response_item', { type: 'custom_tool_call', call_id: 'unrelated', name: 'exec', input: 'echo text' }),
      record('t9', 'response_item', { type: 'custom_tool_call_output', call_id: 'unrelated', output: skillBody('false-positive') }),
      message('t10', 'assistant', 'Main done'),
    ].join('\n');
    const childJsonl = [
      message('t2', 'user', 'Child work'),
      record('t2.1', 'world_state', { state: { host_skills: { body: catalog(['child-one']) } } }),
      record('t2.2', 'response_item', { type: 'function_call', call_id: 'load-child', name: 'shell_command', arguments: '{"command":"Get-Content C:/skills/child-one/SKILL.md"}' }),
      record('t2.3', 'response_item', { type: 'function_call_output', call_id: 'load-child', output: skillBody('child-one') }),
      message('t3', 'assistant', 'Child done'),
    ].join('\n');
    const session = parseSession(payload(mainJsonl, [{
      threadId: 'child', parentThreadId: 'main', startedAt: 't2', lastUpdatedAt: 't3', jsonl: childJsonl,
    }]));
    const track = session.skillTrack as typeof session.skillTrack & {
      availableByScope: Record<string, number>;
      activations: Array<{ name: string; scopeId?: string; source: string; tokenCost: number }>;
    };

    expect(track.availableByScope).toEqual({ main: 2, child: 1 });
    expect(track.activations.map(({ name, scopeId, source }) => ({ name, scopeId, source }))).toEqual([
      { name: 'main-one', scopeId: 'main', source: 'resource' },
      { name: 'main-two', scopeId: 'main', source: 'resource' },
      { name: 'child-one', scopeId: 'child', source: 'resource' },
    ]);
    expect(track.activations.every((activation) => activation.tokenCost > 0)).toBe(true);

    const nodes = walk(session.root);
    const mainNode = nodes.find((node) => node.id.startsWith('main:') && node.timestamp >= 't3')!;
    const childNode = nodes.find((node) => node.id.startsWith('child:') && node.timestamp >= 't2.3')!;
    expect(skillsActiveAt(mainNode, track).map((activation) => activation.name).sort()).toEqual(['main-one', 'main-two']);
    expect(skillsActiveAt(childNode, track).map((activation) => activation.name)).toEqual(['child-one']);
    expect(availableSkillsAt(mainNode, track)).toBe(2);
    expect(availableSkillsAt(childNode, track)).toBe(1);
  });

  it('counts compatibility skill catalogs embedded in developer instructions', () => {
    const session = parseSession(payload([
      record('t0', 'response_item', {
        type: 'message', role: 'developer',
        content: [{ type: 'input_text', text: '<skills_instructions>\n### Available skills\n- one: First\n- two: Second\n</skills_instructions>' }],
      }),
      message('t1', 'user', 'Question'),
      message('t2', 'assistant', 'Answer'),
    ].join('\n')));
    const track = session.skillTrack as typeof session.skillTrack & { availableByScope: Record<string, number> };
    expect(track.availableByScope).toEqual({ main: 2 });
  });

  it('uses condensed shared summaries while preserving complete Codex text as detail', () => {
    const prompt = `Prompt ${'x'.repeat(200)}`;
    const answer = 'First sentence. Second sentence with more detail.';
    const session = parseSession(payload([
      message('t0', 'user', prompt),
      message('t1', 'assistant', answer),
    ].join('\n')));
    const nodes = walk(session.root);

    expect(nodes[0].summary).toHaveLength(160);
    expect(nodes[0].detail).toBe(prompt);
    expect(nodes[1]).toMatchObject({ kind: 'completion', summary: 'First sentence', detail: answer });
  });

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

  it('uses a child rollout reasoning summary when main rollout has visible reasoning', () => {
    const session = parseSession(payload([
      message('t1', 'user', 'Main question'),
      record('t2', 'response_item', { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Main fallback' }] }),
      record('t3', 'event_msg', { type: 'agent_reasoning', text: 'Main visible reasoning' }),
      message('t6', 'assistant', 'Main answer'),
    ].join('\n'), [{
      threadId: 'child', parentThreadId: 'main', startedAt: 't4', lastUpdatedAt: 't5',
      jsonl: [
        message('t4', 'user', 'Child question'),
        record('t5', 'response_item', { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Child fallback' }] }),
        message('t5.5', 'assistant', 'Child answer'),
      ].join('\n'),
    }]));

    const summaries = walk(session.root).map((node) => node.summary);
    expect(summaries).toContain('Main visible reasoning');
    expect(summaries).toContain('Child fallback');
    expect(summaries).not.toContain('Main fallback');
  });

  it('uses a main rollout reasoning summary when child rollout has visible reasoning', () => {
    const session = parseSession(payload([
      message('t1', 'user', 'Main question'),
      record('t2', 'response_item', { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Main fallback' }] }),
      message('t6', 'assistant', 'Main answer'),
    ].join('\n'), [{
      threadId: 'child', parentThreadId: 'main', startedAt: 't3', lastUpdatedAt: 't5',
      jsonl: [
        message('t3', 'user', 'Child question'),
        record('t4', 'response_item', { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Child fallback' }] }),
        record('t5', 'event_msg', { type: 'agent_reasoning', text: 'Child visible reasoning' }),
        message('t5.5', 'assistant', 'Child answer'),
      ].join('\n'),
    }]));

    const summaries = walk(session.root).map((node) => node.summary);
    expect(summaries).toContain('Main fallback');
    expect(summaries).toContain('Child visible reasoning');
    expect(summaries).not.toContain('Child fallback');
  });

  it('does not render both visible and fallback reasoning in the same rollout', () => {
    const session = parseSession(payload([
      message('t1', 'user', 'Question'),
      record('t2', 'response_item', { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Fallback reasoning' }] }),
      record('t3', 'event_msg', { type: 'agent_reasoning', text: 'Visible reasoning' }),
      message('t4', 'assistant', 'Answer'),
    ].join('\n')));

    expect(walk(session.root).map((node) => node.summary)).toEqual(['Question', 'Visible reasoning', 'Answer']);
  });

  it('does not render encrypted-only reasoning', () => {
    const session = parseSession(payload([
      message('t1', 'user', 'Question'),
      record('t2', 'response_item', { type: 'reasoning', encrypted_content: 'encrypted-only' }),
      message('t3', 'assistant', 'Answer'),
    ].join('\n')));

    expect(walk(session.root).map((node) => node.summary)).toEqual(['Question', 'Answer']);
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
