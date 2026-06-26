import type { NarrativeBlock } from './types';

export function buildIndexMap(orderIds: string[]): Map<string, number> {
  return new Map(orderIds.map((id, i) => [id, i]));
}

export function indexForBlockStart(block: NarrativeBlock, indexMap: Map<string, number>): number {
  return indexMap.get(block.startMilestoneId) ?? -1;
}

export function activeBlockId(
  blocks: NarrativeBlock[], indexMap: Map<string, number>, currentIndex: number,
): string | null {
  for (const b of blocks) {
    const start = indexMap.get(b.startMilestoneId);
    const end = indexMap.get(b.endMilestoneId);
    if (start === undefined || end === undefined) continue;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    if (currentIndex >= lo && currentIndex <= hi) return b.id;
  }
  return null;
}
