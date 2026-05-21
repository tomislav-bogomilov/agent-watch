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
});
