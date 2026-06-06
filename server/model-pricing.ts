import { promises as fs } from 'node:fs';
import path from 'node:path';

export type PriceEntry = {
  input: number;        // USD per 1M input tokens
  output: number;       // USD per 1M output tokens
  cacheRead: number;    // 0.1 x input
  cacheWrite5m: number; // 1.25 x input
  cacheWrite1h: number; // 2 x input
};

export type PriceTable = {
  month?: string; // YYYY-MM for snapshots; absent on the bundled table
  currency: 'USD';
  source: string;
  perMTok: Record<string, PriceEntry>;
};

// Anthropic published API list prices (cached 2026-05-26). Update here when
// Anthropic changes pricing — future month snapshots pick the new values up,
// already-written snapshots keep theirs.
export const BUNDLED_PRICES: PriceTable = {
  currency: 'USD',
  source: 'bundled 2026-06-06',
  perMTok: {
    'claude-opus-4-8':   { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
    'claude-opus-4-7':   { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
    'claude-opus-4-6':   { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
    'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 },
    'claude-haiku-4-5':  { input: 1, output: 5,  cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2 },
  },
};

const MONTH_FILE_RE = /^(\d{4}-\d{2})\.json$/;

export async function ensureMonthSnapshot(usageDir: string, month: string): Promise<void> {
  const dir = path.join(usageDir, 'prices');
  const file = path.join(dir, `${month}.json`);
  try {
    await fs.access(file);
    return; // exists — never overwrite (user edits are respected)
  } catch {
    /* create below */
  }
  await fs.mkdir(dir, { recursive: true });
  const snapshot: PriceTable = { ...BUNDLED_PRICES, month, source: `bundled ${month}-01` };
  await fs.writeFile(file, JSON.stringify(snapshot, null, 2), 'utf8');
}

export async function loadPriceSnapshots(usageDir: string): Promise<Record<string, PriceTable>> {
  const dir = path.join(usageDir, 'prices');
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return {};
  }
  const out: Record<string, PriceTable> = {};
  for (const name of names) {
    const m = name.match(MONTH_FILE_RE);
    if (!m) continue;
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')) as PriceTable;
      if (typeof parsed !== 'object' || parsed === null || typeof parsed.perMTok !== 'object' || parsed.perMTok === null) {
        throw new Error('invalid shape');
      }
      out[m[1]] = parsed;
    } catch (err) {
      console.warn(`[thoughtgraph] skipping invalid price snapshot ${name}: ${(err as Error).message}`);
    }
  }
  return out;
}
