import type { BlockStatus, NarrativeBlock, Verbosity } from './types';

export type RebucketedItem =
  | { kind: 'group'; phase: string; blocks: NarrativeBlock[]; status: BlockStatus }
  | { kind: 'block'; block: NarrativeBlock };

function groupStatus(blocks: NarrativeBlock[]): BlockStatus {
  if (blocks.some((b) => b.status === 'active')) return 'active';
  if (blocks.every((b) => b.status === 'upcoming')) return 'upcoming';
  return 'completed';
}

export function rebucket(blocks: NarrativeBlock[], level: Verbosity): RebucketedItem[] {
  if (level !== 'overview') return blocks.map((block) => ({ kind: 'block', block }));
  const out: RebucketedItem[] = [];
  let run: NarrativeBlock[] = [];
  const flush = () => {
    if (run.length) out.push({ kind: 'group', phase: run[0].phase, blocks: run, status: groupStatus(run) });
    run = [];
  };
  for (const block of blocks) {
    if (run.length && run[0].phase !== block.phase) flush();
    run.push(block);
  }
  flush();
  return out;
}
