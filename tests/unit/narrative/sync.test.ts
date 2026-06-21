import { describe, it, expect } from 'vitest';
import { buildIndexMap, indexForBlockStart, activeBlockId } from '../../../src/narrative/sync';
import type { NarrativeBlock } from '../../../src/narrative/types';

const order = ['m1', 'm2', 'm3', 'm4', 'm5'];
const map = buildIndexMap(order);
const blocks: NarrativeBlock[] = [
  { id: 'b1', phase: 'p', title: 'A', summary: 's', status: 'completed', startMilestoneId: 'm1', endMilestoneId: 'm2' },
  { id: 'b2', phase: 'p', title: 'B', summary: 's', status: 'active', startMilestoneId: 'm3', endMilestoneId: 'm5' },
];

describe('sync', () => {
  it('buildIndexMap maps ids to positions', () => {
    expect(map.get('m3')).toBe(2);
  });
  it('indexForBlockStart returns the start index', () => {
    expect(indexForBlockStart(blocks[1], map)).toBe(2);
  });
  it('indexForBlockStart returns -1 for unknown id', () => {
    expect(indexForBlockStart({ ...blocks[0], startMilestoneId: 'zzz' }, map)).toBe(-1);
  });
  it('activeBlockId picks the block whose index range contains current', () => {
    expect(activeBlockId(blocks, map, 0)).toBe('b1'); // m1
    expect(activeBlockId(blocks, map, 3)).toBe('b2'); // m4 within m3..m5
  });
  it('activeBlockId returns null when before all ranges', () => {
    const shifted = [{ ...blocks[0], startMilestoneId: 'm2', endMilestoneId: 'm2' }];
    expect(activeBlockId(shifted, map, 0)).toBeNull();
  });
});
