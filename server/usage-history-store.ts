import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TokenUsageProject, TokenUsageRow } from './aggregate-token-usage';

// Bump when the meaning of stored token counts changes so a corrected
// aggregation isn't masked by stale per-field maxes. v2: message.id dedup
// (counts that were inflated by multi-block/re-logged turns under v1).
const HISTORY_VERSION = 2;

export type UsageHistory = {
  version: typeof HISTORY_VERSION;
  lastSyncAt: string;
  projects: Record<string, string>; // projectId -> decoded cwd (survives log expiry)
  rows: TokenUsageRow[];
};

const LIVE = 'usage-history.json';
const BAK = 'usage-history.json.bak';

export function emptyHistory(): UsageHistory {
  return { version: HISTORY_VERSION, lastSyncAt: '', projects: {}, rows: [] };
}

export function rowKey(r: Pick<TokenUsageRow, 'projectId' | 'modelId' | 'isSubagent' | 'day'>): string {
  return `${r.projectId}|${r.modelId}|${r.isSubagent ? 1 : 0}|${r.day}`;
}

const TOKEN_FIELDS = ['input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h'] as const;

// max() per field, never overwrite: a past day's history total was recorded while the
// day's logs were complete; retention can only shrink the fresh aggregation. For the
// current (still-growing) day, fresh >= stored, so max() is correct there too.
export function mergeHistory(
  history: UsageHistory,
  fresh: { projects: TokenUsageProject[]; rows: TokenUsageRow[] },
  nowIso: string,
): UsageHistory {
  const byKey = new Map<string, TokenUsageRow>();
  for (const r of history.rows) byKey.set(rowKey(r), { ...r });
  for (const f of fresh.rows) {
    const key = rowKey(f);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...f });
      continue;
    }
    for (const field of TOKEN_FIELDS) prev[field] = Math.max(prev[field], f[field]);
  }
  const projects: Record<string, string> = { ...history.projects };
  for (const p of fresh.projects) projects[p.id] = p.cwd;
  const rows = Array.from(byKey.values()).sort((a, b) => rowKey(a).localeCompare(rowKey(b)));
  return { version: HISTORY_VERSION, lastSyncAt: nowIso, projects, rows };
}

function isUsageHistory(v: unknown): v is UsageHistory {
  if (typeof v !== 'object' || v === null) return false;
  const h = v as UsageHistory;
  return h.version === HISTORY_VERSION && typeof h.projects === 'object' && h.projects !== null && Array.isArray(h.rows);
}

/** undefined = file missing; throws on unparseable JSON. */
async function readJsonFile(p: string): Promise<unknown | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(p, 'utf8');
  } catch {
    return undefined;
  }
  return JSON.parse(raw) as unknown; // SyntaxError propagates to caller
}

export async function readHistory(usageDir: string): Promise<UsageHistory> {
  const live = path.join(usageDir, LIVE);
  try {
    const parsed = await readJsonFile(live);
    if (parsed === undefined) return emptyHistory();
    if (isUsageHistory(parsed)) return parsed;
    throw new Error(`invalid history shape: ${live}`);
  } catch (err) {
    // Quarantine the bad live file, then try the backup.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.rename(live, path.join(usageDir, `usage-history.corrupt-${stamp}.json`)).catch(() => undefined);
    console.warn(`[thoughtgraph] usage history unreadable (${(err as Error).message}); trying backup`);
    try {
      const bak = await readJsonFile(path.join(usageDir, BAK));
      if (bak !== undefined && isUsageHistory(bak)) return bak;
    } catch {
      /* fall through to empty */
    }
    return emptyHistory();
  }
}

export async function writeHistory(usageDir: string, history: UsageHistory): Promise<void> {
  await fs.mkdir(usageDir, { recursive: true });
  const live = path.join(usageDir, LIVE);
  const tmp = path.join(usageDir, `${LIVE}.${process.pid}-${Math.random().toString(36).slice(2, 8)}.tmp`);
  await fs.copyFile(live, path.join(usageDir, BAK)).catch(() => undefined); // first run: no live file yet
  await fs.writeFile(tmp, JSON.stringify(history, null, 2), 'utf8');
  try {
    await fs.rename(tmp, live); // atomic replace (Node rename overwrites on Windows too)
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
}
