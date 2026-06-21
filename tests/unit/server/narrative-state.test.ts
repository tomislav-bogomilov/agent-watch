import { describe, it, expect, vi } from 'vitest';
import { createNarrativeStore } from '../../../server/narrative-state';
import type { RunNarratorResult } from '../../../server/narrator';

const ms = (ids: string[]) => ids.map((id) => ({ id, kind: 'tool_call', label: id, summary: id }));
const result = (ids: string[], session = 'sess'): RunNarratorResult => ({
  narratorSessionId: session,
  blocks: [{ id: 'b', phase: 'P', title: 'T', summary: 'S', status: 'completed',
             startMilestoneId: ids[0], endMilestoneId: ids[ids.length - 1] }],
});

describe('createNarrativeStore', () => {
  it('start runs the runner once and stores blocks (building toggles)', async () => {
    const run = vi.fn(async () => result(['m1', 'm2']));
    const store = createNarrativeStore({ run, now: () => 1000 });
    store.start('k', { milestones: ms(['m1', 'm2']), cwd: '/tmp/n' });
    expect(store.get('k').building).toBe(true);
    await store.whenIdle('k');
    expect(run).toHaveBeenCalledTimes(1);
    expect((run.mock.calls as unknown[][])[0]![0]).toMatchObject({ model: 'haiku' });
    expect(store.get('k').blocks).toHaveLength(1);
    expect(store.get('k').building).toBe(false);
    expect(store.get('k').generatedAt).not.toBeNull();
  });

  it('tick is a no-op when no new milestones', async () => {
    const run = vi.fn(async () => result(['m1', 'm2']));
    const store = createNarrativeStore({ run, now: () => 1 });
    store.start('k', { milestones: ms(['m1', 'm2']), cwd: '/n' });
    await store.whenIdle('k');
    store.tick('k', { milestones: ms(['m1', 'm2']), cwd: '/n' });
    await store.whenIdle('k');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('tick resumes with a delta when new milestones arrive', async () => {
    const run = vi.fn(async () => result(['m1', 'm3']));
    const store = createNarrativeStore({ run, now: () => 1 });
    store.start('k', { milestones: ms(['m1', 'm2']), cwd: '/n' });
    await store.whenIdle('k');
    store.tick('k', { milestones: ms(['m1', 'm2', 'm3']), cwd: '/n' });
    await store.whenIdle('k');
    expect(run).toHaveBeenCalledTimes(2);
    expect((run.mock.calls as unknown[][])[1]![0]).toMatchObject({ since: 'm2', resumeSessionId: 'sess', model: 'haiku' });
  });

  it('refresh runs sonnet from scratch (no resume id)', async () => {
    const run = vi.fn(async () => result(['m1', 'm2'], 's2'));
    const store = createNarrativeStore({ run, now: () => 1 });
    store.start('k', { milestones: ms(['m1', 'm2']), cwd: '/n' });
    await store.whenIdle('k');
    store.refresh('k', { milestones: ms(['m1', 'm2']), cwd: '/n' });
    await store.whenIdle('k');
    const call1 = (run.mock.calls as unknown[][])[1]![0] as Record<string, unknown>;
    expect(call1).toMatchObject({ model: 'sonnet' });
    expect(call1['resumeSessionId']).toBeUndefined();
  });

  it('runner rejection sets error and keeps prior blocks', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce(result(['m1', 'm2']))
      .mockRejectedValueOnce(new Error('boom'));
    const store = createNarrativeStore({ run, now: () => 1 });
    store.start('k', { milestones: ms(['m1', 'm2']), cwd: '/n' });
    await store.whenIdle('k');
    store.refresh('k', { milestones: ms(['m1', 'm2']), cwd: '/n' });
    await store.whenIdle('k');
    expect(store.get('k').error).toContain('boom');
    expect(store.get('k').blocks).toHaveLength(1); // prior blocks retained
    expect(store.get('k').building).toBe(false);
  });
});
