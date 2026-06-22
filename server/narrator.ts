import type { BlockStatus, NarrativeBlock, NarratorModel } from '../src/narrative/types';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

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

// Replaces the Claude Code agent persona with a pure JSON-formatter persona.
// `claude -p` is a full coding agent: without this it sometimes treats the
// narration request as ambiguous and replies with prose / clarifying questions
// (which parse to "no valid block array"), or inspects the cwd. A replacement
// system prompt — paired with --exclude-dynamic-system-prompt-sections to drop
// the env/git context — makes it a deterministic JSON transform.
const NARRATOR_SYSTEM =
  'You are a non-interactive JSON formatter, not a coding agent. You transform a coding ' +
  'agent\'s session milestones into a JSON array of logical-phase blocks. Output ONLY a JSON ' +
  'array and nothing else: no prose, no clarifying questions, no markdown code fences, no ' +
  'explanation. Never ask questions and never use tools; the user message contains everything ' +
  'you need. Each element is an object with string fields: id, phase, title, summary, detail, ' +
  'status (one of completed, active, upcoming), startMilestoneId, endMilestoneId. ' +
  'startMilestoneId and endMilestoneId must be ids taken from the provided milestones (the ' +
  'first and last milestone the block covers). Group many milestones per block; keep it ' +
  'minimal. If you cannot produce blocks, output [].';

export function buildNarratorPrompt(input: NarratorInputMilestone[], opts: { since?: string }): string {
  const data = JSON.stringify(input);
  if (opts.since) {
    return (
      `These are NEW milestones since your last summary (after id ${opts.since}). ` +
      `Update your running narrative and return the FULL current JSON array of blocks.\n` +
      `New milestones (JSON): ${data}`
    );
  }
  return (
    `Summarize these coding-agent session milestones into a few high-level logical phases ` +
    `(e.g. Explore, Decide, Implement, Verify), grouping related milestones into blocks. ` +
    `Include startMilestoneId and endMilestoneId on every block.\n` +
    `Milestones (JSON): ${data}`
  );
}

export function buildClaudeArgs(opts: { model: 'haiku' | 'sonnet'; resumeSessionId?: string }): string[] {
  const args = [
    '-p', '--output-format', 'json', '--model', opts.model,
    '--system-prompt', NARRATOR_SYSTEM,
    '--exclude-dynamic-system-prompt-sections',
  ];
  if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId);
  return args;
}

export interface RunNarratorArgs {
  milestones: NarratorInputMilestone[];
  model: NarratorModel;
  cwd: string;
  since?: string;
  resumeSessionId?: string;
}
export interface RunNarratorResult {
  blocks: NarrativeBlock[];
  narratorSessionId: string;
}

/** Deterministic stand-in used in tests/e2e (TG_NARRATOR_FAKE) — two blocks spanning the ids. */
export function fakeBlocks(input: NarratorInputMilestone[]): NarrativeBlock[] {
  if (input.length === 0) {
    return [{ id: 'fake-empty', phase: 'Start', title: 'Starting up', summary: 'No activity yet',
              status: 'active', startMilestoneId: '', endMilestoneId: '' }];
  }
  const mid = Math.max(1, Math.ceil(input.length / 2));
  const a = input.slice(0, mid);
  const b = input.slice(mid);
  const blocks: NarrativeBlock[] = [{
    id: 'fake-1', phase: 'Explore', title: 'Explore the codebase',
    summary: 'Scanned the repo and located the relevant module.',
    detail: 'Fake narrative block A (TG_NARRATOR_FAKE).', status: 'completed',
    startMilestoneId: a[0].id, endMilestoneId: a[a.length - 1].id, thoughtCount: a.length,
  }];
  if (b.length > 0) {
    blocks.push({
      id: 'fake-2', phase: 'Implement', title: 'Implement the change',
      summary: 'Applied the edit and moved toward completion.',
      detail: 'Fake narrative block B (TG_NARRATOR_FAKE).', status: 'active',
      startMilestoneId: b[0].id, endMilestoneId: b[b.length - 1].id, thoughtCount: b.length,
    });
  }
  return blocks;
}

const SPAWN_TIMEOUT_MS = 60_000;

export async function runNarrator(args: RunNarratorArgs): Promise<RunNarratorResult> {
  if (process.env.TG_NARRATOR_FAKE) {
    return { blocks: fakeBlocks(args.milestones), narratorSessionId: args.resumeSessionId ?? 'fake-session' };
  }
  await mkdir(args.cwd, { recursive: true });
  const cliArgs = buildClaudeArgs({ model: args.model, resumeSessionId: args.resumeSessionId });
  const prompt = buildNarratorPrompt(args.milestones, { since: args.since });
  const stdout = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const child = spawn('claude', cliArgs, { cwd: args.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error('narrator timed out'));
    }, SPAWN_TIMEOUT_MS);
    child.on('error', (e: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(e.code === 'ENOENT'
        ? 'Claude Code CLI (`claude`) not found on PATH'
        : `narrator failed: ${e.message}`));
    });
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`narrator exited ${code}: ${err.slice(0, 200)}`));
      else resolve(out);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
  const { blocks, sessionId } = parseNarratorOutput(stdout);
  return { blocks, narratorSessionId: sessionId ?? args.resumeSessionId ?? '' };
}
