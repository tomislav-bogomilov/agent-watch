import { describe, it, expect } from 'vitest';
import { buildNarratorPrompt, buildClaudeArgs, toNarratorInput } from '../../../server/narrator';

const milestones = [
  { id: 'm1', kind: 'root_prompt', label: 'Prompt', summary: 'Fix routing bug', result: undefined },
  { id: 'm2', kind: 'tool_call', label: 'Read match.ts', summary: 'read file', result: 'ok' },
];

describe('toNarratorInput', () => {
  it('keeps only the fields the narrator needs', () => {
    const full = [{ ...milestones[0], extra: 'drop me' }];
    expect(toNarratorInput(full as never)).toEqual([
      { id: 'm1', kind: 'root_prompt', label: 'Prompt', summary: 'Fix routing bug' },
    ]);
  });
});

describe('buildNarratorPrompt', () => {
  it('seed prompt embeds milestones and asks for JSON only', () => {
    const p = buildNarratorPrompt(toNarratorInput(milestones as never), {});
    expect(p).toContain('"id":"m1"');
    expect(p).toMatch(/JSON/i);
    expect(p).toContain('startMilestoneId');
  });
  it('incremental prompt mentions it is a delta', () => {
    const p = buildNarratorPrompt(toNarratorInput(milestones as never), { since: 'm1' });
    expect(p).toMatch(/new|since|delta/i);
    expect(p).toMatch(/full|current list/i); // must ask for the full updated list back
  });
});

describe('buildClaudeArgs', () => {
  it('builds headless json args with the model', () => {
    expect(buildClaudeArgs({ model: 'haiku' })).toEqual(['-p', '--output-format', 'json', '--model', 'haiku']);
  });
  it('adds --resume when a session id is given', () => {
    expect(buildClaudeArgs({ model: 'haiku', resumeSessionId: 's1' })).toEqual([
      '-p', '--output-format', 'json', '--model', 'haiku', '--resume', 's1',
    ]);
  });
});
