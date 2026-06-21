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

export interface NarratorInputMilestone {
  id: string;
  kind: string;
  label: string;
  summary: string;
  result?: string;
}

export function toNarratorInput(
  milestones: Array<{ id: string; kind: string; label: string; summary: string; result?: string }>,
): NarratorInputMilestone[] {
  return milestones.map((m) => {
    const out: NarratorInputMilestone = { id: m.id, kind: m.kind, label: m.label, summary: m.summary };
    if (m.result) out.result = m.result;
    return out;
  });
}

const SCHEMA_LINE =
  'Each block: {"id","phase","title","summary","detail","status","startMilestoneId","endMilestoneId"}. ' +
  '"status" is one of completed|active|upcoming. "phase" is a coarse group label reused across related blocks. ' +
  'startMilestoneId/endMilestoneId are the first/last milestone id the block covers.';

export function buildNarratorPrompt(input: NarratorInputMilestone[], opts: { since?: string }): string {
  const data = JSON.stringify(input);
  const head = opts.since
    ? `These are NEW milestones since your last summary (delta after id ${opts.since}). ` +
      `Update or extend your running narrative and return the FULL current list of blocks.`
    : `You are narrating a coding agent's session as a few high-level logical phases ` +
      `(e.g. Explore -> Decide -> Implement -> Verify). Keep it minimal — group many milestones per block.`;
  return (
    `${head}\n` +
    `Output ONLY a JSON array of blocks, no prose. ${SCHEMA_LINE}\n` +
    `Milestones (JSON): ${data}`
  );
}

export function buildClaudeArgs(opts: { model: 'haiku' | 'sonnet'; resumeSessionId?: string }): string[] {
  const args = ['-p', '--output-format', 'json', '--model', opts.model];
  if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId);
  return args;
}
