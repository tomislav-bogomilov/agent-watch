import { describe, it, expect, afterEach } from 'vitest';
import { runNarrator, fakeBlocks, toNarratorInput } from '../../../server/narrator';

const ms = [
  { id: 'm1', kind: 'root_prompt', label: 'p', summary: 's1' },
  { id: 'm2', kind: 'tool_call', label: 'r', summary: 's2' },
  { id: 'm3', kind: 'tool_call', label: 'e', summary: 's3' },
  { id: 'm4', kind: 'completion', label: 'done', summary: 's4' },
];

afterEach(() => { delete process.env.TG_NARRATOR_FAKE; });

describe('fakeBlocks', () => {
  it('spans the provided milestone ids across two blocks', () => {
    const blocks = fakeBlocks(toNarratorInput(ms as never));
    expect(blocks).toHaveLength(2);
    expect(blocks[0].startMilestoneId).toBe('m1');
    expect(blocks[blocks.length - 1].endMilestoneId).toBe('m4');
  });
});

describe('runNarrator (fake mode)', () => {
  it('returns canned blocks + a stable fake session id without spawning', async () => {
    process.env.TG_NARRATOR_FAKE = '1';
    const res = await runNarrator({ milestones: toNarratorInput(ms as never), model: 'haiku', cwd: '/tmp/x' });
    expect(res.blocks.length).toBeGreaterThan(0);
    expect(res.narratorSessionId).toMatch(/fake/);
  });

  it('reuses the resume session id in fake mode', async () => {
    process.env.TG_NARRATOR_FAKE = '1';
    const res = await runNarrator({
      milestones: toNarratorInput(ms as never), model: 'haiku', cwd: '/tmp/x', resumeSessionId: 'keep-me',
    });
    expect(res.narratorSessionId).toBe('keep-me');
  });
});
