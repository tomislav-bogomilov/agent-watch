import type { BlockStatus, NarrativeBlock } from '../src/narrative/types';

const STATUSES: BlockStatus[] = ['completed', 'active', 'upcoming'];

/** Parse the `claude -p --output-format json` envelope. Falls back to raw text. */
export function extractResult(stdout: string): { text: string; sessionId: string | null } {
  try {
    const env = JSON.parse(stdout) as { result?: unknown; session_id?: unknown };
    if (env && typeof env === 'object' && typeof env.result === 'string') {
      return { text: env.result, sessionId: typeof env.session_id === 'string' ? env.session_id : null };
    }
  } catch {
    /* not an envelope — treat as raw model text */
  }
  return { text: stdout, sessionId: null };
}

function coerceBlock(raw: unknown): NarrativeBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const id = str(r.id);
  const title = str(r.title);
  const summary = str(r.summary);
  const start = str(r.startMilestoneId);
  const end = str(r.endMilestoneId);
  if (!id || !title || !summary || !start || !end) return null;
  const status = STATUSES.includes(r.status as BlockStatus) ? (r.status as BlockStatus) : 'completed';
  const block: NarrativeBlock = {
    id, title, summary, startMilestoneId: start, endMilestoneId: end, status,
    phase: str(r.phase) ?? title,
  };
  if (str(r.detail)) block.detail = str(r.detail)!;
  if (typeof r.thoughtCount === 'number') block.thoughtCount = r.thoughtCount;
  if (typeof r.toolCount === 'number') block.toolCount = r.toolCount;
  return block;
}

/** Find the first JSON array/object in `text` (tolerates fences + prose) and parse blocks. */
export function parseBlocks(text: string): NarrativeBlock[] {
  const candidates: string[] = [];
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) candidates.push(arr[0]);
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) candidates.push(obj[0]);
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      const list: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { blocks?: unknown }).blocks)
          ? (parsed as { blocks: unknown[] }).blocks
          : [];
      const blocks = list.map(coerceBlock).filter((b): b is NarrativeBlock => b !== null);
      if (blocks.length > 0) return blocks;
    } catch {
      /* try next candidate */
    }
  }
  throw new Error('narrator output: no valid block array');
}

export function parseNarratorOutput(stdout: string): { blocks: NarrativeBlock[]; sessionId: string | null } {
  const { text, sessionId } = extractResult(stdout);
  return { blocks: parseBlocks(text), sessionId };
}
