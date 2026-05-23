import { describe, it, expect } from 'vitest';
import { buildMilestones } from '../../../src/parse/milestones';
import type { RawEvent } from '../../../src/parse/types';

const t = '2026-05-21T00:00:00Z';

function userMsg(uuid: string, parentUuid: string | null, text: string): RawEvent {
  return {
    uuid,
    parentUuid,
    timestamp: t,
    type: 'user',
    message: { role: 'user', content: text },
  };
}

function assistantText(uuid: string, parentUuid: string | null, text: string): RawEvent {
  return {
    uuid,
    parentUuid,
    timestamp: t,
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  };
}

function assistantTool(
  uuid: string,
  parentUuid: string | null,
  toolUseId: string,
  toolName: string,
  input: Record<string, unknown>,
  precedingText = ''
): RawEvent {
  const content = [];
  if (precedingText) content.push({ type: 'text', text: precedingText });
  content.push({ type: 'tool_use', id: toolUseId, name: toolName, input });
  return {
    uuid,
    parentUuid,
    timestamp: t,
    type: 'assistant',
    message: { role: 'assistant', content: content as any },
  };
}

function toolResult(
  uuid: string,
  parentUuid: string | null,
  toolUseId: string,
  content: string,
  isError = false
): RawEvent {
  return {
    uuid,
    parentUuid,
    timestamp: t,
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError } as any],
    },
  };
}

describe('buildMilestones', () => {
  it('treats the first non-meta user message as root_prompt', () => {
    const events: RawEvent[] = [
      userMsg('1', null, 'Hello there'),
      assistantText('2', '1', 'Hi'),
    ];
    const root = buildMilestones(events);
    expect(root.kind).toBe('root_prompt');
    expect(root.label).toBe('Prompt');
    expect(root.summary).toBe('Hello there');
  });

  it('chains assistant_turn after root_prompt', () => {
    const events: RawEvent[] = [
      userMsg('1', null, 'Hello'),
      assistantText('2', '1', 'I will help. Starting now.'),
    ];
    const root = buildMilestones(events);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].kind).toBe('completion'); // single assistant turn at end becomes completion
    expect(root.children[0].summary).toBe('I will help');
  });

  it('creates tool_call milestones with matched tool_result content', () => {
    const events: RawEvent[] = [
      userMsg('1', null, 'Read it'),
      assistantTool('2', '1', 'tu_a', 'Read', { file_path: '/tmp/x.txt' }),
      toolResult('3', '2', 'tu_a', 'alpha\nbeta\n', false),
      assistantText('4', '3', 'Done with the read.'),
    ];
    const root = buildMilestones(events);
    const tool = root.children[0];
    expect(tool.kind).toBe('tool_call');
    expect(tool.label).toBe('Read x.txt');
    expect(tool.summary).toBe('Read /tmp/x.txt');
    expect(tool.result).toMatch(/^2 lines, (9|10) bytes/);
    expect(tool.failed).toBe(false);
    expect(tool.toolName).toBe('Read');
  });

  it('flags failure on is_error tool_result', () => {
    const events: RawEvent[] = [
      userMsg('1', null, 'Try'),
      assistantTool('2', '1', 'tu_a', 'Read', { file_path: '/nope' }),
      toolResult('3', '2', 'tu_a', 'File does not exist', true),
    ];
    const root = buildMilestones(events);
    const tool = root.children[0];
    expect(tool.failed).toBe(true);
    expect(tool.result?.startsWith('⚠ error')).toBe(true);
  });

  it('detects subagent_spawn for Task tool', () => {
    const events: RawEvent[] = [
      userMsg('1', null, 'Delegate'),
      assistantTool('2', '1', 'tu_t', 'Task', {
        subagent_type: 'Explore',
        description: 'find auth code',
        prompt: 'do it',
      }),
      toolResult('3', '2', 'tu_t', 'Subagent done', false),
    ];
    const root = buildMilestones(events);
    const spawn = root.children[0];
    expect(spawn.kind).toBe('subagent_spawn');
    expect(spawn.label).toBe('→ Explore');
    expect(spawn.summary).toBe('find auth code');
  });

  it('the last milestone is tagged as completion when assistant text-only', () => {
    const events: RawEvent[] = [
      userMsg('1', null, 'q'),
      assistantText('2', '1', 'Working.'),
      assistantText('3', '2', 'All done!'),
    ];
    const root = buildMilestones(events);
    const inner = root.children[0];
    expect(inner.kind).toBe('assistant_turn');
    expect(inner.children[0].kind).toBe('completion');
    expect(inner.children[0].summary).toBe('All done');
  });

  it('captures usage on an assistant_turn milestone', () => {
    const events: RawEvent[] = [
      userMsg('1', null, 'Hello'),
      {
        uuid: '2',
        parentUuid: '1',
        timestamp: t,
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'hi' }],
          usage: {
            input_tokens: 6,
            cache_read_input_tokens: 18209,
            cache_creation_input_tokens: 28826,
            output_tokens: 389,
          },
        } as unknown as RawEvent['message'],
      },
    ];
    const root = buildMilestones(events);
    // root is root_prompt; its child is the completion (final assistant_turn promoted)
    const assistant = root.children[0];
    expect(assistant.usage).toEqual({ input: 6, cacheRead: 18209, cacheCreation: 28826, output: 389 });
    expect(assistant.contextSize).toBe(6 + 18209 + 28826);
  });

  it('shares usage across multiple tool_call milestones from the same assistant event', () => {
    const events: RawEvent[] = [
      userMsg('1', null, 'Hi'),
      {
        uuid: '2',
        parentUuid: '1',
        timestamp: t,
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: '/a' } },
            { type: 'tool_use', id: 'tu2', name: 'Grep', input: { pattern: 'x' } },
          ],
          usage: {
            input_tokens: 10,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 200,
            output_tokens: 50,
          },
        } as unknown as RawEvent['message'],
      },
      toolResult('3', '2', 'tu1', 'ok'),
      toolResult('4', '2', 'tu2', 'ok'),
    ];
    const root = buildMilestones(events);
    const t1 = root.children[0];
    const t2 = t1.children[0];
    expect(t1.kind).toBe('tool_call');
    expect(t2.kind).toBe('tool_call');
    const expected = { input: 10, cacheRead: 100, cacheCreation: 200, output: 50 };
    expect(t1.usage).toEqual(expected);
    expect(t2.usage).toEqual(expected);
    expect(t1.contextSize).toBe(310);
    expect(t2.contextSize).toBe(310);
  });

  it('leaves usage undefined when the assistant event has no usage block', () => {
    const events: RawEvent[] = [
      userMsg('1', null, 'Hi'),
      assistantText('2', '1', 'bare response, no usage field'),
    ];
    const root = buildMilestones(events);
    const child = root.children[0];
    expect(child.usage).toBeUndefined();
    expect(child.contextSize).toBeUndefined();
  });
});
