import { describe, it, expect } from 'vitest';
import { diffBlocks } from '../../../src/narrative/diffBlocks';
import type { NarrativeBlock } from '../../../src/narrative/types';

const b = (id: string, status: NarrativeBlock['status'], title = id): NarrativeBlock => ({
  id, phase: 'p', title, summary: 's', status, startMilestoneId: id, endMilestoneId: id,
});

describe('diffBlocks', () => {
  it('reports added ids', () => {
    const d = diffBlocks([b('1', 'completed')], [b('1', 'completed'), b('2', 'active')]);
    expect([...d.added]).toEqual(['2']);
    expect([...d.changed]).toEqual([]);
  });
  it('reports status/title changes as changed', () => {
    const d = diffBlocks([b('1', 'active')], [b('1', 'completed')]);
    expect([...d.changed]).toEqual(['1']);
  });
  it('no diff when identical', () => {
    const same = [b('1', 'completed')];
    const d = diffBlocks(same, [b('1', 'completed')]);
    expect(d.added.size + d.changed.size).toBe(0);
  });
});
