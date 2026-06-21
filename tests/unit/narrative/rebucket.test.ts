import { describe, it, expect } from 'vitest';
import { rebucket } from '../../../src/narrative/rebucket';
import type { NarrativeBlock } from '../../../src/narrative/types';

const b = (id: string, phase: string, status: NarrativeBlock['status']): NarrativeBlock => ({
  id, phase, title: id, summary: id, status, startMilestoneId: id, endMilestoneId: id,
});

describe('rebucket', () => {
  const blocks = [b('1', 'Explore', 'completed'), b('2', 'Explore', 'completed'), b('3', 'Implement', 'active')];

  it('steps -> one item per block', () => {
    const out = rebucket(blocks, 'steps');
    expect(out).toHaveLength(3);
    expect(out.every((i) => i.kind === 'block')).toBe(true);
  });

  it('overview -> groups consecutive same-phase blocks', () => {
    const out = rebucket(blocks, 'overview');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: 'group', phase: 'Explore', status: 'completed' });
    expect((out[0] as { blocks: NarrativeBlock[] }).blocks).toHaveLength(2);
    expect(out[1]).toMatchObject({ kind: 'group', phase: 'Implement', status: 'active' });
  });

  it('group status is active when any child is active', () => {
    const out = rebucket([b('1', 'X', 'completed'), b('2', 'X', 'active')], 'overview');
    expect(out[0]).toMatchObject({ status: 'active' });
  });
});
