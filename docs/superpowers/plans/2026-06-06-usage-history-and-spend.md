# Usage History Persistence + Spend View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist token-usage history beyond Claude Code's ~1-month log retention, and add estimated-$ cost reporting (per model, per month, with input/output/cache breakdowns) to the USAGE dashboard.

**Architecture:** A repo-local `.local/usage/usage-history.json` is merged (per-key `max()`) with fresh log aggregation on dev-server boot and on every `/api/token-usage` request. A bundled price table snapshots into `.local/usage/prices/YYYY-MM.json` monthly. The client computes all $ figures at render time (`tokens × prices(month)`); history stores tokens only. UI: existing TOKENS view gains $ chips/breakdowns; a new SPEND view (BARS ⁄ MATRIX sub-views) shows monthly cost.

**Tech Stack:** TypeScript, Vite middleware (Connect), React 19, TanStack Query, d3 v7, vitest + @testing-library/react (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-06-06-usage-history-and-spend-design.md`
**Branch:** all work happens on `feat/usage-history-spend` (already created).

**Commands:**
- Unit tests (single file): `npx vitest run tests/unit/<path>`
- All unit tests: `npm run test`
- Typecheck: `npm run typecheck`
- E2E: `npm run test:e2e` (kill any stray `npm run dev` first — a stray server on 5174 makes Playwright reuse it against real data)

---

## File structure

| File | Status | Responsibility |
| --- | --- | --- |
| `server/aggregate-token-usage.ts` | modify | Parse logs → rows with split cache fields; skip `<synthetic>` |
| `server/usage-history-store.ts` | **new** | History file: read (w/ corrupt recovery), merge (per-field max), atomic write |
| `server/model-pricing.ts` | **new** | Bundled price table; monthly snapshot files; snapshot loader |
| `server/usage-sync.ts` | **new** | Orchestrates aggregate → merge → persist → prices → API payload |
| `server/vite-plugin-sessions.ts` | modify | Boot sync; `/api/token-usage` serves synced payload |
| `src/api/client.ts` | modify | Re-export new payload/price types |
| `src/tokens/aggregate.ts` | modify | `cachedOf()` helper; derive `cached` from split fields |
| `src/components/library/UsageCardsList.tsx` | modify | Use `cachedOf()` |
| `src/tokens/cost.ts` | **new** | Pure $ math: normalize, priceFor, costOfRow, costSummary, costByMonth, formatUsd |
| `src/tokens/OverallSpendList.tsx` | modify | $ chip + breakdown line per model; grand-total $; unpriced warning |
| `src/tokens/SpendBars.tsx` | **new** | Chip strip, monthly $ stacked bar chart (d3), expandable ledger table |
| `src/tokens/SpendMatrix.tsx` | **new** | Stat cards, month×model heat grid, cell-click breakdown pin |
| `src/tokens/TokensPage.tsx` | modify | `TOKENS \| SPEND` toggle, `BARS ⁄ MATRIX` switch, cost wiring |
| `.gitignore` | modify | Add `.local/` |
| `playwright.config.ts` | modify | `TG_USAGE_DIR` env + globalSetup |

---

### Task 1: Split cache fields end-to-end (server aggregation + client derivation)

The single `cached` bucket becomes `cacheRead` / `cacheWrite5m` / `cacheWrite1h` everywhere `TokenUsageRow` flows. The UI's "cached" metric is derived via a new `cachedOf()` helper.

**Files:**
- Modify: `server/aggregate-token-usage.ts`
- Modify: `src/tokens/aggregate.ts`
- Modify: `src/components/library/UsageCardsList.tsx`
- Create: `tests/unit/server/fixtures/tokens-root/C--demo-a/2026-05-25-ddd.jsonl`
- Test: `tests/unit/server/aggregate-token-usage.test.ts`
- Test: `tests/unit/tokens/aggregate.test.ts` (mechanical fixture update + `cachedOf` tests)
- Test (mechanical fixture updates only): `tests/unit/tokens/DailyUsageChart.test.tsx`, `tests/unit/tokens/TokensPage.filter.test.tsx`, `tests/unit/tokens/OverallSpendList.test.tsx`, `tests/unit/components/UsageCardsList.test.tsx`

- [ ] **Step 1: Add new unit fixture with `cache_creation` detail and a `<synthetic>` event**

Create `tests/unit/server/fixtures/tokens-root/C--demo-a/2026-05-25-ddd.jsonl` (two lines, no trailing blank line needed):

```jsonl
{"uuid":"d1","parentUuid":null,"timestamp":"2026-05-25T09:00:00Z","type":"assistant","message":{"role":"assistant","model":"claude-opus-4-8","usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":1000,"cache_creation_input_tokens":700,"cache_creation":{"ephemeral_5m_input_tokens":400,"ephemeral_1h_input_tokens":300}}}}
{"uuid":"d2","parentUuid":"d1","timestamp":"2026-05-25T09:01:00Z","type":"assistant","message":{"role":"assistant","model":"<synthetic>","usage":{"input_tokens":0,"output_tokens":0,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}
```

- [ ] **Step 2: Update server aggregation tests to the split shape**

In `tests/unit/server/aggregate-token-usage.test.ts`:

Replace the expected object in the test `groups main-session rows by (projectId, modelId, isSubagent, day)`:

```ts
    expect(aMain[0]).toEqual({
      projectId: 'C--demo-a',
      modelId: 'claude-opus-4-7',
      isSubagent: false,
      day: '2026-05-20',
      input: 110,
      output: 55,
      cacheRead: 200,
      cacheWrite5m: 300,
      cacheWrite1h: 0,
    });
```

Replace the test `sums cache_read + cache_creation into a single cached bucket` with:

```ts
  it('counts legacy cache_creation (no detail object) as 5m writes', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const row = out.rows.find(
      (r) => r.projectId === 'C--demo-a' && !r.isSubagent && r.day === '2026-05-20'
    )!;
    expect(row.cacheRead).toBe(200);
    expect(row.cacheWrite5m).toBe(300);
    expect(row.cacheWrite1h).toBe(0);
  });

  it('uses the cache_creation detail split when present', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const row = out.rows.find(
      (r) => r.modelId === 'claude-opus-4-8' && r.day === '2026-05-25'
    )!;
    expect(row.cacheRead).toBe(1000);
    expect(row.cacheWrite5m).toBe(400);   // from detail, not the 700 legacy total
    expect(row.cacheWrite1h).toBe(300);
  });

  it('skips <synthetic> model events', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    expect(out.rows.some((r) => r.modelId === '<synthetic>')).toBe(false);
  });
```

- [ ] **Step 3: Run server aggregation tests to verify they fail**

Run: `npx vitest run tests/unit/server/aggregate-token-usage.test.ts`
Expected: FAIL — expected objects have `cacheRead`/`cacheWrite5m`/`cacheWrite1h`, actual rows have `cached`.

- [ ] **Step 4: Implement the split in `server/aggregate-token-usage.ts`**

Replace the `TokenUsageRow` type (keep `TokenUsageProject` / `TokenUsageResponse` as-is for now):

```ts
export type TokenUsageRow = {
  projectId: string;
  modelId: string;
  isSubagent: boolean;
  day: string; // YYYY-MM-DD (UTC)
  input: number;
  output: number;
  cacheRead: number;     // cache_read_input_tokens
  cacheWrite5m: number;  // cache_creation.ephemeral_5m_input_tokens (or legacy total)
  cacheWrite1h: number;  // cache_creation.ephemeral_1h_input_tokens
};
```

Extend `AssistantEvent`'s usage type:

```ts
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_creation?: {
        ephemeral_5m_input_tokens?: number;
        ephemeral_1h_input_tokens?: number;
      };
    };
```

Replace the body of `accumulate()`'s per-line logic from the `const model = …` line down:

```ts
    const model = ev.message?.model;
    const u = ev.message?.usage;
    if (!model || !u) continue;
    if (model === '<synthetic>') continue; // API-error placeholder events carry no real usage
    const input = Number(u.input_tokens ?? 0);
    const output = Number(u.output_tokens ?? 0);
    const cacheRead = Number(u.cache_read_input_tokens ?? 0);
    const cc = u.cache_creation;
    let cacheWrite5m: number;
    let cacheWrite1h: number;
    if (cc && (cc.ephemeral_5m_input_tokens !== undefined || cc.ephemeral_1h_input_tokens !== undefined)) {
      cacheWrite5m = Number(cc.ephemeral_5m_input_tokens ?? 0);
      cacheWrite1h = Number(cc.ephemeral_1h_input_tokens ?? 0);
    } else {
      // Older log lines lack the TTL split — count everything as the default 5-minute TTL.
      cacheWrite5m = Number(u.cache_creation_input_tokens ?? 0);
      cacheWrite1h = 0;
    }
    if (!Number.isFinite(input + output + cacheRead + cacheWrite5m + cacheWrite1h)) continue;
    const key = `${projectId}|${model}|${isSubagent ? 1 : 0}|${day}`;
    const prev = acc.get(key);
    if (prev) {
      prev.input += input;
      prev.output += output;
      prev.cacheRead += cacheRead;
      prev.cacheWrite5m += cacheWrite5m;
      prev.cacheWrite1h += cacheWrite1h;
    } else {
      acc.set(key, { projectId, modelId: model, isSubagent, day, input, output, cacheRead, cacheWrite5m, cacheWrite1h });
    }
```

- [ ] **Step 5: Run server aggregation tests to verify they pass**

Run: `npx vitest run tests/unit/server/aggregate-token-usage.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Add `cachedOf` tests to client aggregate tests**

In `tests/unit/tokens/aggregate.test.ts`, first do the mechanical fixture update: replace every occurrence of `cached: <N>` in row-literal fixtures with `cacheRead: <N>, cacheWrite5m: 0, cacheWrite1h: 0` (same `<N>`, so all existing totals/expectations stay valid). Then add:

```ts
import { cachedOf } from '../../../src/tokens/aggregate';

describe('cachedOf', () => {
  it('sums cacheRead + cacheWrite5m + cacheWrite1h', () => {
    expect(cachedOf({
      projectId: 'p', modelId: 'm', isSubagent: false, day: '2026-06-01',
      input: 0, output: 0, cacheRead: 100, cacheWrite5m: 30, cacheWrite1h: 20,
    })).toBe(150);
  });
});
```

(Adjust the import path to match the file's existing import style.)

- [ ] **Step 7: Run client aggregate tests to verify they fail**

Run: `npx vitest run tests/unit/tokens/aggregate.test.ts`
Expected: FAIL — `cachedOf` is not exported, and row literals no longer match the (still-old) `TokenUsageRow` type.

- [ ] **Step 8: Update `src/tokens/aggregate.ts`**

Add the helper right after the imports:

```ts
export function cachedOf(r: TokenUsageRow): number {
  return r.cacheRead + r.cacheWrite5m + r.cacheWrite1h;
}
```

Update every internal use of `r.cached`:
- `modelKeysSorted`: `totals.set(k, (totals.get(k) ?? 0) + r.input + r.output + cachedOf(r));`
- `metricValue`: `if (m === 'cached') return cachedOf(r);` and `return r.input + r.output + cachedOf(r);`
- `summariesPerModel`: `prev.cached += cachedOf(r);` / in the else-branch object: `cached: cachedOf(r),` and `total: r.input + r.output + cachedOf(r),`. Note `prev.total` recompute line stays as-is (it sums the accumulated fields).

`ModelSummary` keeps its `cached` field — it is a UI summary, not a log row.

- [ ] **Step 9: Update `src/components/library/UsageCardsList.tsx`**

```ts
import { cachedOf } from '../../tokens/aggregate';
```

and change `totalOf`:

```ts
function totalOf(row: TokenUsageRow): number {
  return row.input + row.output + cachedOf(row);
}
```

- [ ] **Step 10: Mechanically update remaining test fixtures**

In `tests/unit/tokens/DailyUsageChart.test.tsx`, `tests/unit/tokens/TokensPage.filter.test.tsx`, `tests/unit/tokens/OverallSpendList.test.tsx`, `tests/unit/components/UsageCardsList.test.tsx`: replace every `cached: <N>` in `TokenUsageRow` literals with `cacheRead: <N>, cacheWrite5m: 0, cacheWrite1h: 0`. (`ModelSummary` literals in `OverallSpendList.test.tsx` keep their `cached` field — only `TokenUsageRow` literals change.)

- [ ] **Step 11: Run the full unit suite + typecheck**

Run: `npm run test && npm run typecheck`
Expected: PASS, no type errors. If typecheck flags another `r.cached` use site, fix it with `cachedOf` the same way.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(usage-spend): split cached tokens into cacheRead/cacheWrite5m/cacheWrite1h"
```

---

### Task 2: Usage history store (read / merge / atomic write)

**Files:**
- Create: `server/usage-history-store.ts`
- Test: `tests/unit/server/usage-history-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/server/usage-history-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  emptyHistory, mergeHistory, readHistory, writeHistory, rowKey,
  type UsageHistory,
} from '../../../server/usage-history-store';
import type { TokenUsageRow } from '../../../server/aggregate-token-usage';

function row(over: Partial<TokenUsageRow>): TokenUsageRow {
  return {
    projectId: 'P', modelId: 'claude-opus-4-8', isSubagent: false, day: '2026-06-01',
    input: 10, output: 20, cacheRead: 30, cacheWrite5m: 40, cacheWrite1h: 50,
    ...over,
  };
}

describe('mergeHistory', () => {
  it('takes per-field max when a key exists in both (current-day growth)', () => {
    const hist: UsageHistory = { ...emptyHistory(), rows: [row({ input: 10, output: 5 })] };
    const merged = mergeHistory(hist, { projects: [], rows: [row({ input: 25, output: 5 })] }, '2026-06-06T00:00:00Z');
    expect(merged.rows).toHaveLength(1);
    expect(merged.rows[0].input).toBe(25);
    expect(merged.rows[0].output).toBe(5);
  });

  it('keeps the larger history value when logs have partially eroded', () => {
    const hist: UsageHistory = { ...emptyHistory(), rows: [row({ input: 100, cacheRead: 900 })] };
    const merged = mergeHistory(hist, { projects: [], rows: [row({ input: 40, cacheRead: 200 })] }, '2026-06-06T00:00:00Z');
    expect(merged.rows[0].input).toBe(100);
    expect(merged.rows[0].cacheRead).toBe(900);
  });

  it('unions disjoint keys (history-only rows survive)', () => {
    const hist: UsageHistory = { ...emptyHistory(), rows: [row({ day: '2026-01-01' })] };
    const merged = mergeHistory(hist, { projects: [], rows: [row({ day: '2026-06-01' })] }, '2026-06-06T00:00:00Z');
    expect(merged.rows).toHaveLength(2);
  });

  it('treats projectId/modelId/isSubagent/day as the identity key', () => {
    const hist: UsageHistory = { ...emptyHistory(), rows: [row({ isSubagent: false })] };
    const merged = mergeHistory(hist, { projects: [], rows: [row({ isSubagent: true })] }, '2026-06-06T00:00:00Z');
    expect(merged.rows).toHaveLength(2);
    expect(rowKey(merged.rows[0])).not.toBe(rowKey(merged.rows[1]));
  });

  it('merges the projects map (fresh cwd wins, history-only ids survive)', () => {
    const hist: UsageHistory = { ...emptyHistory(), projects: { OLD: 'C:/old', P: 'C:/stale' } };
    const merged = mergeHistory(hist, { projects: [{ id: 'P', cwd: 'C:/fresh' }], rows: [] }, '2026-06-06T00:00:00Z');
    expect(merged.projects).toEqual({ OLD: 'C:/old', P: 'C:/fresh' });
  });

  it('stamps lastSyncAt', () => {
    const merged = mergeHistory(emptyHistory(), { projects: [], rows: [] }, '2026-06-06T12:00:00Z');
    expect(merged.lastSyncAt).toBe('2026-06-06T12:00:00Z');
  });
});

describe('readHistory / writeHistory', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-usage-'));
  });

  it('returns empty history when the directory or file does not exist', async () => {
    expect(await readHistory(path.join(dir, 'nope'))).toEqual(emptyHistory());
  });

  it('round-trips write → read', async () => {
    const h: UsageHistory = { ...emptyHistory(), lastSyncAt: 'X', rows: [row({})] };
    await writeHistory(dir, h);
    expect(await readHistory(dir)).toEqual(h);
  });

  it('writes a .bak of the previous version on overwrite', async () => {
    await writeHistory(dir, { ...emptyHistory(), lastSyncAt: 'v1' });
    await writeHistory(dir, { ...emptyHistory(), lastSyncAt: 'v2' });
    const bak = JSON.parse(await fs.readFile(path.join(dir, 'usage-history.json.bak'), 'utf8'));
    expect(bak.lastSyncAt).toBe('v1');
  });

  it('recovers from a corrupt live file via the backup, quarantining the bad file', async () => {
    await writeHistory(dir, { ...emptyHistory(), lastSyncAt: 'v1' });
    await writeHistory(dir, { ...emptyHistory(), lastSyncAt: 'v2' });
    await fs.writeFile(path.join(dir, 'usage-history.json'), '{not json', 'utf8');
    const recovered = await readHistory(dir);
    expect(recovered.lastSyncAt).toBe('v1'); // .bak holds v1 (pre-v2 copy)
    const names = await fs.readdir(dir);
    expect(names.some((n) => n.startsWith('usage-history.corrupt-'))).toBe(true);
  });

  it('falls back to empty history when live and backup are both unusable', async () => {
    await fs.writeFile(path.join(dir, 'usage-history.json'), '{not json', 'utf8');
    expect(await readHistory(dir)).toEqual(emptyHistory());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/server/usage-history-store.test.ts`
Expected: FAIL — module `server/usage-history-store` does not exist.

- [ ] **Step 3: Implement `server/usage-history-store.ts`**

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TokenUsageProject, TokenUsageRow } from './aggregate-token-usage';

export type UsageHistory = {
  version: 1;
  lastSyncAt: string;
  projects: Record<string, string>; // projectId -> decoded cwd (survives log expiry)
  rows: TokenUsageRow[];
};

const LIVE = 'usage-history.json';
const BAK = 'usage-history.json.bak';

export function emptyHistory(): UsageHistory {
  return { version: 1, lastSyncAt: '', projects: {}, rows: [] };
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
  return { version: 1, lastSyncAt: nowIso, projects, rows };
}

function isUsageHistory(v: unknown): v is UsageHistory {
  if (typeof v !== 'object' || v === null) return false;
  const h = v as UsageHistory;
  return h.version === 1 && typeof h.projects === 'object' && h.projects !== null && Array.isArray(h.rows);
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
  const tmp = path.join(usageDir, `${LIVE}.tmp`);
  await fs.copyFile(live, path.join(usageDir, BAK)).catch(() => undefined); // first run: no live file yet
  await fs.writeFile(tmp, JSON.stringify(history, null, 2), 'utf8');
  await fs.rename(tmp, live); // atomic replace (Node rename overwrites on Windows too)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/server/usage-history-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/usage-history-store.ts tests/unit/server/usage-history-store.test.ts
git commit -m "feat(usage-spend): add usage history store with max-merge and atomic writes"
```

---

### Task 3: Model pricing (bundled table + monthly snapshots)

**Files:**
- Create: `server/model-pricing.ts`
- Test: `tests/unit/server/model-pricing.test.ts`

> **Implementer note:** Before committing, verify the bundled dollar values against Anthropic's current published API pricing (https://www.anthropic.com/pricing or platform.claude.com docs). The values below are from pricing data cached 2026-05-26. If they changed, update `BUNDLED_PRICES` and the multiplier test stays valid (cacheRead = 0.1× input, cacheWrite5m = 1.25× input, cacheWrite1h = 2× input).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/server/model-pricing.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BUNDLED_PRICES, ensureMonthSnapshot, loadPriceSnapshots,
} from '../../../server/model-pricing';

describe('BUNDLED_PRICES', () => {
  it('derives cache prices from the input price (0.1x read, 1.25x 5m write, 2x 1h write)', () => {
    for (const [model, p] of Object.entries(BUNDLED_PRICES.perMTok)) {
      expect(p.cacheRead, model).toBeCloseTo(p.input * 0.1, 10);
      expect(p.cacheWrite5m, model).toBeCloseTo(p.input * 1.25, 10);
      expect(p.cacheWrite1h, model).toBeCloseTo(p.input * 2, 10);
    }
  });

  it('covers the models seen in real logs', () => {
    for (const id of ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5']) {
      expect(BUNDLED_PRICES.perMTok[id], id).toBeDefined();
    }
  });
});

describe('ensureMonthSnapshot / loadPriceSnapshots', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-prices-'));
  });

  it('creates prices/YYYY-MM.json from the bundled table', async () => {
    await ensureMonthSnapshot(dir, '2026-06');
    const parsed = JSON.parse(await fs.readFile(path.join(dir, 'prices', '2026-06.json'), 'utf8'));
    expect(parsed.month).toBe('2026-06');
    expect(parsed.perMTok['claude-opus-4-8'].input).toBe(BUNDLED_PRICES.perMTok['claude-opus-4-8'].input);
  });

  it('never overwrites an existing snapshot (user edits are preserved)', async () => {
    const file = path.join(dir, 'prices', '2026-06.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ month: '2026-06', currency: 'USD', source: 'hand-edit', perMTok: {} }), 'utf8');
    await ensureMonthSnapshot(dir, '2026-06');
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(parsed.source).toBe('hand-edit');
  });

  it('loads every month snapshot keyed by filename month', async () => {
    await ensureMonthSnapshot(dir, '2026-05');
    await ensureMonthSnapshot(dir, '2026-06');
    const snaps = await loadPriceSnapshots(dir);
    expect(Object.keys(snaps).sort()).toEqual(['2026-05', '2026-06']);
  });

  it('skips unparseable snapshots and non-month files', async () => {
    await ensureMonthSnapshot(dir, '2026-06');
    await fs.writeFile(path.join(dir, 'prices', '2026-07.json'), '{broken', 'utf8');
    await fs.writeFile(path.join(dir, 'prices', 'notes.txt'), 'hi', 'utf8');
    const snaps = await loadPriceSnapshots(dir);
    expect(Object.keys(snaps)).toEqual(['2026-06']);
  });

  it('returns {} when the prices directory does not exist', async () => {
    expect(await loadPriceSnapshots(path.join(dir, 'nope'))).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/server/model-pricing.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `server/model-pricing.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/server/model-pricing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/model-pricing.ts tests/unit/server/model-pricing.test.ts
git commit -m "feat(usage-spend): add bundled price table and monthly snapshots"
```

---

### Task 4: Sync orchestration + API wiring

**Files:**
- Create: `server/usage-sync.ts`
- Modify: `server/aggregate-token-usage.ts` (rename `TokenUsageResponse` → `AggregateResult`)
- Modify: `server/vite-plugin-sessions.ts`
- Modify: `src/api/client.ts`
- Modify: `.gitignore`
- Test: `tests/unit/server/usage-sync.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/server/usage-sync.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncTokenUsage } from '../../../server/usage-sync';

const EVENT = (model: string, input: number) => JSON.stringify({
  uuid: 'x', timestamp: '2026-06-01T10:00:00Z', type: 'assistant',
  message: { role: 'assistant', model, usage: { input_tokens: input, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
});

describe('syncTokenUsage', () => {
  let claudeRoot: string;
  let usageDir: string;

  beforeEach(async () => {
    claudeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-claude-'));
    usageDir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'tg-usage-')), 'usage');
    await fs.mkdir(path.join(claudeRoot, 'C--proj'), { recursive: true });
    await fs.writeFile(path.join(claudeRoot, 'C--proj', 's1.jsonl'), EVENT('claude-opus-4-8', 100), 'utf8');
  });

  it('returns merged rows, persists history, and snapshots the current month', async () => {
    const now = new Date('2026-06-06T12:00:00Z');
    const payload = await syncTokenUsage(claudeRoot, usageDir, now);
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0].modelId).toBe('claude-opus-4-8');
    expect(payload.projects).toEqual([{ id: 'C--proj', cwd: 'C:/proj' }]);
    expect(payload.bundledPrices.perMTok['claude-opus-4-8']).toBeDefined();
    expect(payload.prices['2026-06']).toBeDefined();
    // persisted on disk
    const onDisk = JSON.parse(await fs.readFile(path.join(usageDir, 'usage-history.json'), 'utf8'));
    expect(onDisk.rows).toHaveLength(1);
  });

  it('retains history rows after the source logs disappear', async () => {
    const now = new Date('2026-06-06T12:00:00Z');
    await syncTokenUsage(claudeRoot, usageDir, now);
    await fs.rm(path.join(claudeRoot, 'C--proj'), { recursive: true, force: true });
    const payload = await syncTokenUsage(claudeRoot, usageDir, now);
    expect(payload.rows).toHaveLength(1); // history kept it
    expect(payload.projects).toEqual([{ id: 'C--proj', cwd: 'C:/proj' }]); // projects map kept it
  });

  it('still serves data with unsyncedWarning when persistence fails', async () => {
    // Make usageDir unusable: create it as a FILE so mkdir/write inside it fails.
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-bad-'));
    const fileAsDir = path.join(parent, 'usage');
    await fs.writeFile(fileAsDir, 'i am a file', 'utf8');
    const payload = await syncTokenUsage(claudeRoot, fileAsDir, new Date('2026-06-06T12:00:00Z'));
    expect(payload.rows).toHaveLength(1);
    expect(payload.unsyncedWarning).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/server/usage-sync.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Rename the aggregate result type**

In `server/aggregate-token-usage.ts`, rename `TokenUsageResponse` to `AggregateResult` (type declaration and the `aggregateTokenUsage` return type). The name `TokenUsageResponse` moves to the client in Step 5.

- [ ] **Step 4: Implement `server/usage-sync.ts`**

```ts
import { aggregateTokenUsage } from './aggregate-token-usage';
import type { TokenUsageProject, TokenUsageRow } from './aggregate-token-usage';
import { mergeHistory, readHistory, writeHistory } from './usage-history-store';
import { BUNDLED_PRICES, ensureMonthSnapshot, loadPriceSnapshots } from './model-pricing';
import type { PriceTable } from './model-pricing';

export type TokenUsagePayload = {
  projects: TokenUsageProject[]; // live dirs ∪ history projects map
  rows: TokenUsageRow[];         // merged history ∪ fresh
  prices: Record<string, PriceTable>; // 'YYYY-MM' -> snapshot
  bundledPrices: PriceTable;          // fallback for months without a snapshot
  unsyncedWarning?: string;           // set when this round's persistence failed
};

export async function syncTokenUsage(
  claudeRoot: string,
  usageDir: string,
  now: Date = new Date(),
): Promise<TokenUsagePayload> {
  const fresh = await aggregateTokenUsage(claudeRoot);
  const history = await readHistory(usageDir);
  const merged = mergeHistory(history, fresh, now.toISOString());

  let unsyncedWarning: string | undefined;
  try {
    await writeHistory(usageDir, merged);
  } catch (err) {
    unsyncedWarning = `usage history not persisted: ${(err as Error).message}`;
    console.warn(`[thoughtgraph] ${unsyncedWarning}`);
  }

  try {
    await ensureMonthSnapshot(usageDir, now.toISOString().slice(0, 7));
  } catch (err) {
    console.warn(`[thoughtgraph] price snapshot failed: ${(err as Error).message}`);
  }

  const prices = await loadPriceSnapshots(usageDir);
  const projects: TokenUsageProject[] = Object.entries(merged.projects)
    .map(([id, cwd]) => ({ id, cwd }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    projects,
    rows: merged.rows,
    prices,
    bundledPrices: BUNDLED_PRICES,
    ...(unsyncedWarning ? { unsyncedWarning } : {}),
  };
}
```

- [ ] **Step 5: Wire into the vite plugin and client types**

In `server/vite-plugin-sessions.ts`:

Add the import:

```ts
import { syncTokenUsage } from './usage-sync';
```

At the top of `configureServer(server)` (before the first `server.middlewares.use`):

```ts
      const usageDir = process.env.TG_USAGE_DIR
        ?? path.join(server.config.root, '.local', 'usage');
      // Boot-time sync: top up history whenever the dev server starts. Fire and
      // forget — a failure must never block startup.
      void syncTokenUsage(root, usageDir).catch((err) => {
        console.warn(`[thoughtgraph] boot usage sync failed: ${(err as Error).message}`);
      });
```

Replace the `/api/token-usage` handler body line `const payload = await aggregateTokenUsage(root);` with:

```ts
          const payload = await syncTokenUsage(root, usageDir);
```

Remove the now-unused `import { aggregateTokenUsage } from './aggregate-token-usage';`.

In `src/api/client.ts`, replace the two token-usage type lines (the `import type { TokenUsageResponse } …` and the `export type { TokenUsageResponse, TokenUsageRow, TokenUsageProject } …`) with:

```ts
import type { TokenUsagePayload } from '../../server/usage-sync';

export type { TokenUsageRow, TokenUsageProject } from '../../server/aggregate-token-usage';
export type { PriceEntry, PriceTable } from '../../server/model-pricing';
export type TokenUsageResponse = TokenUsagePayload;
```

In `.gitignore`, add (next to the `.superpowers/` entry):

```
.local/
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run tests/unit/server/usage-sync.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev` then `curl -s http://localhost:5173/api/token-usage | head -c 400`, then stop the server.
Expected: JSON containing `"rows"`, `"prices"`, `"bundledPrices"`; a `.local/usage/usage-history.json` and `.local/usage/prices/<current-month>.json` appear in the repo; `git status` shows no new untracked files (`.local/` ignored).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(usage-spend): sync usage history on boot and per request; serve prices in payload"
```

---

### Task 5: Client cost module

**Files:**
- Create: `src/tokens/cost.ts`
- Test: `tests/unit/tokens/cost.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/tokens/cost.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { PriceTable, TokenUsageRow } from '../../../src/api/client';
import {
  normalizeModelId, priceFor, costOfRow, costSummary, costByMonth,
  modelKeysByCost, formatUsd,
} from '../../../src/tokens/cost';

const BUNDLED: PriceTable = {
  currency: 'USD', source: 'test',
  perMTok: {
    'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
    'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2 },
  },
};

const MAY_SNAPSHOT: PriceTable = {
  month: '2026-05', currency: 'USD', source: 'test-snapshot',
  perMTok: {
    'claude-opus-4-8': { input: 4, output: 20, cacheRead: 0.4, cacheWrite5m: 5, cacheWrite1h: 8 },
  },
};

function row(over: Partial<TokenUsageRow>): TokenUsageRow {
  return {
    projectId: 'P', modelId: 'claude-opus-4-8', isSubagent: false, day: '2026-06-01',
    input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0,
    ...over,
  };
}

describe('normalizeModelId', () => {
  it('strips a trailing -YYYYMMDD date suffix', () => {
    expect(normalizeModelId('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5');
  });
  it('leaves plain ids untouched', () => {
    expect(normalizeModelId('claude-opus-4-8')).toBe('claude-opus-4-8');
    expect(normalizeModelId('claude-fake')).toBe('claude-fake');
  });
});

describe('priceFor', () => {
  it('prefers the month snapshot', () => {
    expect(priceFor('claude-opus-4-8', '2026-05', { '2026-05': MAY_SNAPSHOT }, BUNDLED)!.input).toBe(4);
  });
  it('falls back to bundled when the month has no snapshot', () => {
    expect(priceFor('claude-opus-4-8', '2026-01', { '2026-05': MAY_SNAPSHOT }, BUNDLED)!.input).toBe(5);
  });
  it('falls back per-model when the snapshot lacks the model', () => {
    expect(priceFor('claude-haiku-4-5-20251001', '2026-05', { '2026-05': MAY_SNAPSHOT }, BUNDLED)!.input).toBe(1);
  });
  it('returns null for unknown models', () => {
    expect(priceFor('claude-fake', '2026-05', {}, BUNDLED)).toBeNull();
  });
});

describe('costOfRow', () => {
  it('applies all five token fields at their own prices', () => {
    const c = costOfRow(row({
      input: 1_000_000, output: 200_000, cacheRead: 10_000_000,
      cacheWrite5m: 1_000_000, cacheWrite1h: 500_000,
    }), {}, BUNDLED)!;
    expect(c.input).toBeCloseTo(5, 10);        // 1M x $5/M
    expect(c.output).toBeCloseTo(5, 10);       // 0.2M x $25/M
    expect(c.cacheRead).toBeCloseTo(5, 10);    // 10M x $0.5/M
    expect(c.cacheWrite).toBeCloseTo(11.25, 10); // 1M x $6.25/M + 0.5M x $10/M
    expect(c.total).toBeCloseTo(26.25, 10);
  });
  it('prices by the row month', () => {
    const c = costOfRow(row({ day: '2026-05-10', input: 1_000_000 }), { '2026-05': MAY_SNAPSHOT }, BUNDLED)!;
    expect(c.input).toBeCloseTo(4, 10);
  });
  it('returns null for unpriced models', () => {
    expect(costOfRow(row({ modelId: 'claude-fake', input: 5 }), {}, BUNDLED)).toBeNull();
  });
});

describe('costSummary', () => {
  it('totals priced rows by modelKey and accumulates unpriced tokens separately', () => {
    const rows = [
      row({ input: 1_000_000 }),
      row({ isSubagent: true, output: 200_000 }),
      row({ modelId: 'claude-fake', input: 7, output: 3, cacheRead: 5, cacheWrite5m: 2, cacheWrite1h: 1 }),
    ];
    const s = costSummary(rows, {}, BUNDLED);
    expect(s.total.total).toBeCloseTo(10, 10); // $5 input + $5 output
    expect(s.byModel.get('claude-opus-4-8')!.total).toBeCloseTo(5, 10);
    expect(s.byModel.get('claude-opus-4-8|sub')!.total).toBeCloseTo(5, 10);
    expect(s.unpricedTokens).toBe(18);
    expect(s.unpricedModels).toEqual(['claude-fake']);
  });
});

describe('costByMonth', () => {
  it('groups by month ascending with per-model splits', () => {
    const rows = [
      row({ day: '2026-06-02', input: 1_000_000 }),
      row({ day: '2026-05-10', output: 200_000 }),
      row({ day: '2026-05-20', modelId: 'claude-haiku-4-5-20251001', output: 1_000_000 }),
    ];
    const months = costByMonth(rows, {}, BUNDLED);
    expect(months.map((m) => m.month)).toEqual(['2026-05', '2026-06']);
    expect(months[0].total.total).toBeCloseTo(10, 10); // $5 opus output + $5 haiku output
    expect(months[0].byModel.get('claude-haiku-4-5-20251001')!.total).toBeCloseTo(5, 10);
    expect(months[1].total.total).toBeCloseTo(5, 10);
  });
});

describe('modelKeysByCost', () => {
  it('sorts keys by all-time cost descending', () => {
    const rows = [
      row({ day: '2026-05-10', input: 1_000_000 }),                                  // opus $5
      row({ day: '2026-06-10', modelId: 'claude-haiku-4-5', output: 10_000_000 }),    // haiku $50
    ];
    expect(modelKeysByCost(costByMonth(rows, {}, BUNDLED))).toEqual(['claude-haiku-4-5', 'claude-opus-4-8']);
  });
});

describe('formatUsd', () => {
  it('formats two decimals', () => {
    expect(formatUsd(26.25)).toBe('$26.25');
    expect(formatUsd(0)).toBe('$0.00');
  });
  it('floors tiny non-zero values to <$0.01', () => {
    expect(formatUsd(0.004)).toBe('<$0.01');
    expect(formatUsd(0.005)).toBe('$0.01');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/tokens/cost.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/tokens/cost.ts`**

```ts
import type { PriceEntry, PriceTable, TokenUsageRow } from '../api/client';
import { modelKey } from './aggregate';

export type CostSplit = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number; // 5m + 1h combined (prices differ; split happens at computation)
  total: number;
};

export function zeroSplit(): CostSplit {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
}

function addInto(acc: CostSplit, c: CostSplit): void {
  acc.input += c.input;
  acc.output += c.output;
  acc.cacheRead += c.cacheRead;
  acc.cacheWrite += c.cacheWrite;
  acc.total += c.total;
}

export function normalizeModelId(id: string): string {
  return id.replace(/-\d{8}$/, '');
}

export function priceFor(
  modelId: string,
  month: string, // YYYY-MM
  prices: Record<string, PriceTable>,
  bundled: PriceTable,
): PriceEntry | null {
  const norm = normalizeModelId(modelId);
  return prices[month]?.perMTok[norm] ?? bundled.perMTok[norm] ?? null;
}

export function costOfRow(
  row: TokenUsageRow,
  prices: Record<string, PriceTable>,
  bundled: PriceTable,
): CostSplit | null {
  const p = priceFor(row.modelId, row.day.slice(0, 7), prices, bundled);
  if (!p) return null;
  const input = (row.input * p.input) / 1e6;
  const output = (row.output * p.output) / 1e6;
  const cacheRead = (row.cacheRead * p.cacheRead) / 1e6;
  const cacheWrite = (row.cacheWrite5m * p.cacheWrite5m + row.cacheWrite1h * p.cacheWrite1h) / 1e6;
  return { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite };
}

export type CostSummary = {
  total: CostSplit;
  byModel: Map<string, CostSplit>; // keyed by modelKey(modelId, isSubagent)
  unpricedTokens: number;
  unpricedModels: string[]; // unique raw model ids, sorted
};

export function costSummary(
  rows: TokenUsageRow[],
  prices: Record<string, PriceTable>,
  bundled: PriceTable,
): CostSummary {
  const total = zeroSplit();
  const byModel = new Map<string, CostSplit>();
  let unpricedTokens = 0;
  const unpriced = new Set<string>();
  for (const r of rows) {
    const c = costOfRow(r, prices, bundled);
    if (!c) {
      unpricedTokens += r.input + r.output + r.cacheRead + r.cacheWrite5m + r.cacheWrite1h;
      unpriced.add(r.modelId);
      continue;
    }
    addInto(total, c);
    const k = modelKey(r.modelId, r.isSubagent);
    const prev = byModel.get(k);
    if (prev) addInto(prev, c);
    else byModel.set(k, { ...c });
  }
  return { total, byModel, unpricedTokens, unpricedModels: Array.from(unpriced).sort() };
}

export type MonthCost = {
  month: string; // YYYY-MM
  total: CostSplit;
  byModel: Map<string, CostSplit>;
};

export function costByMonth(
  rows: TokenUsageRow[],
  prices: Record<string, PriceTable>,
  bundled: PriceTable,
): MonthCost[] {
  const months = new Map<string, MonthCost>();
  for (const r of rows) {
    const c = costOfRow(r, prices, bundled);
    if (!c) continue; // unpriced rows are surfaced via costSummary, not here
    const month = r.day.slice(0, 7);
    let slot = months.get(month);
    if (!slot) {
      slot = { month, total: zeroSplit(), byModel: new Map() };
      months.set(month, slot);
    }
    addInto(slot.total, c);
    const k = modelKey(r.modelId, r.isSubagent);
    const prev = slot.byModel.get(k);
    if (prev) addInto(prev, c);
    else slot.byModel.set(k, { ...c });
  }
  return Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export function modelKeysByCost(months: MonthCost[]): string[] {
  const totals = new Map<string, number>();
  for (const m of months) {
    for (const [k, c] of m.byModel) totals.set(k, (totals.get(k) ?? 0) + c.total);
  }
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

export function formatUsd(n: number): string {
  if (n > 0 && n < 0.005) return '<$0.01';
  return `$${n.toFixed(2)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/tokens/cost.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tokens/cost.ts tests/unit/tokens/cost.test.ts
git commit -m "feat(usage-spend): add client-side cost math module"
```

---

### Task 6: $ chips and breakdowns in the TOKENS view

**Files:**
- Modify: `src/tokens/OverallSpendList.tsx`
- Modify: `src/tokens/TokensPage.tsx` (cost wiring + unsynced warning only — the SPEND toggle is Task 9)
- Test: `tests/unit/tokens/OverallSpendList.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/tokens/OverallSpendList.test.tsx`, add imports and a `costs` fixture, then new tests (keep existing tests, passing the new prop with an empty-cost default where needed):

```tsx
import type { CostSummary } from '../../../src/tokens/cost';
import { zeroSplit } from '../../../src/tokens/cost';

function emptyCosts(): CostSummary {
  return { total: zeroSplit(), byModel: new Map(), unpricedTokens: 0, unpricedModels: [] };
}

const COSTS: CostSummary = {
  total: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 0.25, total: 3.75 },
  byModel: new Map([
    ['claude-opus-4-7', { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 0.25, total: 3.75 }],
  ]),
  unpricedTokens: 0,
  unpricedModels: [],
};
```

Update every existing `render(<OverallSpendList summaries={…} />)` call to also pass `costs={emptyCosts()}`. Then add:

```tsx
it('renders a cost chip and breakdown line for priced models', () => {
  render(<OverallSpendList summaries={SUMMARIES} costs={COSTS} />);
  expect(screen.getByTestId('model-cost-claude-opus-4-7').textContent).toBe('≈ $3.75');
  expect(screen.getByTestId('model-cost-breakdown-claude-opus-4-7').textContent)
    .toBe('in $1.00 · out $2.00 · cache r $0.50 · cache w $0.25');
  expect(screen.getByTestId('model-cost-all').textContent).toBe('≈ $3.75');
});

it('omits the chip for models with no price and shows the unpriced warning', () => {
  const costs: CostSummary = { ...emptyCosts(), unpricedTokens: 1_200_000, unpricedModels: ['claude-fake'] };
  render(<OverallSpendList summaries={SUMMARIES} costs={costs} />);
  expect(screen.queryByTestId('model-cost-claude-opus-4-7')).toBeNull();
  expect(screen.getByTestId('unpriced-warning').textContent)
    .toContain('1.2M TOKENS FROM 1 UNPRICED MODEL');
});
```

(`SUMMARIES` = the file's existing summaries fixture containing a `claude-opus-4-7` row; adapt the name to what the file actually uses.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/tokens/OverallSpendList.test.tsx`
Expected: FAIL — `costs` prop and testids don't exist.

- [ ] **Step 3: Implement in `OverallSpendList.tsx`**

Update imports and props:

```tsx
import { formatUsd, type CostSummary } from './cost';

type Props = { summaries: ModelSummary[]; costs: CostSummary };

export function OverallSpendList({ summaries, costs }: Props) {
```

In the ALL MODELS row, after the `<span style={styles.total}>` element add:

```tsx
          <span data-testid="model-cost-all" style={styles.costChip}>≈ {formatUsd(costs.total.total)}</span>
```

In the per-model map, before `return` add `const cost = costs.byModel.get(k);`, then after the row's `<span style={styles.total}>` element add:

```tsx
              {cost && (
                <span data-testid={`model-cost-${k}`} style={styles.costChip}>≈ {formatUsd(cost.total)}</span>
              )}
```

After the `barTrack` div (inside the row), add:

```tsx
            {cost && (
              <div data-testid={`model-cost-breakdown-${k}`} style={styles.costLine}>
                in {formatUsd(cost.input)} · out {formatUsd(cost.output)} · cache r {formatUsd(cost.cacheRead)} · cache w {formatUsd(cost.cacheWrite)}
              </div>
            )}
```

After the `summaries.map(...)` block (still inside `styles.list`), add:

```tsx
      {costs.unpricedTokens > 0 && (
        <div data-testid="unpriced-warning" style={styles.unpriced}>
          ⚠ {formatTokens(costs.unpricedTokens)} TOKENS FROM {costs.unpricedModels.length} UNPRICED MODEL{costs.unpricedModels.length === 1 ? '' : 'S'} EXCLUDED
        </div>
      )}
```

Add styles:

```ts
  costChip: {
    color: 'var(--edge-trail)',
    border: '1px solid rgba(0,229,255,0.4)',
    borderRadius: 2,
    padding: '1px 6px',
    flexShrink: 0,
    fontSize: 10,
  },
  costLine: {
    color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 9,
    letterSpacing: 1,
  },
  unpriced: {
    color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 10,
    letterSpacing: 1,
    paddingTop: 4,
  },
```

- [ ] **Step 4: Wire costs through `TokensPage.tsx`**

Add imports:

```tsx
import { costSummary } from './cost';
```

After the `summaries` memo:

```tsx
  const costs = useMemo(
    () => costSummary(filtered, query.data?.prices ?? {}, query.data?.bundledPrices ?? { currency: 'USD' as const, source: 'none', perMTok: {} }),
    [filtered, query.data],
  );
```

Change `<OverallSpendList summaries={summaries} />` to `<OverallSpendList summaries={summaries} costs={costs} />`.

After the error display block, add the persistence warning:

```tsx
      {query.data?.unsyncedWarning && (
        <div data-testid="usage-unsynced-warning" style={styles.muted}>⚠ {query.data.unsyncedWarning}</div>
      )}
```

Update `tests/unit/tokens/TokensPage.filter.test.tsx`: extend its mocked token-usage response object with `prices: {}` and `bundledPrices: { currency: 'USD', source: 'test', perMTok: {} }` so the new fields exist.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/unit/tokens/ && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(usage-spend): cost chips, per-model breakdowns and unpriced warning in TOKENS view"
```

---

### Task 7: SPEND · BARS component

**Files:**
- Create: `src/tokens/SpendBars.tsx`
- Test: `tests/unit/tokens/SpendBars.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/tokens/SpendBars.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpendBars } from '../../../src/tokens/SpendBars';
import type { PriceTable, TokenUsageRow } from '../../../src/api/client';

const BUNDLED: PriceTable = {
  currency: 'USD', source: 'test',
  perMTok: {
    'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
    'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 },
  },
};

function row(over: Partial<TokenUsageRow>): TokenUsageRow {
  return {
    projectId: 'P', modelId: 'claude-opus-4-8', isSubagent: false, day: '2026-06-01',
    input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0,
    ...over,
  };
}

const ROWS: TokenUsageRow[] = [
  row({ day: '2026-05-10', input: 1_000_000 }),                              // opus may  $5
  row({ day: '2026-06-02', output: 200_000 }),                               // opus june $5
  row({ day: '2026-06-03', modelId: 'claude-sonnet-4-6', input: 1_000_000 }), // sonnet june $3
];

describe('SpendBars', () => {
  it('renders the summary chip strip', () => {
    render(<SpendBars rows={ROWS} prices={{}} bundled={BUNDLED} />);
    expect(screen.getByTestId('spend-chip-total').textContent).toContain('$13.00');
    expect(screen.getByTestId('spend-chip-input').textContent).toContain('$8.00');
    expect(screen.getByTestId('spend-chip-output').textContent).toContain('$5.00');
    expect(screen.getByTestId('spend-chip-cacheread').textContent).toContain('$0.00');
    expect(screen.getByTestId('spend-chip-cachewrite').textContent).toContain('$0.00');
  });

  it('renders one stacked bar segment per priced model-month', () => {
    const { container } = render(<SpendBars rows={ROWS} prices={{}} bundled={BUNDLED} />);
    // 2026-05: opus only; 2026-06: opus + sonnet = 3 segments
    expect(container.querySelectorAll('[data-role="spend-bar"]')).toHaveLength(3);
  });

  it('renders the ledger newest-month-first and expands per-model detail on click', () => {
    render(<SpendBars rows={ROWS} prices={{}} bundled={BUNDLED} />);
    const months = screen.getAllByTestId(/^spend-month-row-/);
    expect(months[0].getAttribute('data-testid')).toBe('spend-month-row-2026-06');
    expect(screen.queryByTestId('spend-month-detail-2026-06-claude-opus-4-8')).toBeNull();
    fireEvent.click(screen.getByTestId('spend-month-row-2026-06'));
    expect(screen.getByTestId('spend-month-detail-2026-06-claude-opus-4-8')).toBeTruthy();
    expect(screen.getByTestId('spend-month-detail-2026-06-claude-sonnet-4-6')).toBeTruthy();
  });

  it('shows an empty state when nothing is priced', () => {
    render(<SpendBars rows={[row({ modelId: 'claude-fake', input: 5 })]} prices={{}} bundled={BUNDLED} />);
    expect(screen.getByText('NO PRICED USAGE IN RANGE')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/tokens/SpendBars.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/tokens/SpendBars.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { PriceTable, TokenUsageRow } from '../api/client';
import {
  costByMonth, costSummary, formatUsd, modelKeysByCost, type MonthCost,
} from './cost';
import { colorFor } from './palette';
import { modelLabel } from './modelLabel';

type Props = {
  rows: TokenUsageRow[];
  prices: Record<string, PriceTable>;
  bundled: PriceTable;
};

export function SpendBars({ rows, prices, bundled }: Props) {
  const months = useMemo(() => costByMonth(rows, prices, bundled), [rows, prices, bundled]);
  const summary = useMemo(() => costSummary(rows, prices, bundled), [rows, prices, bundled]);
  const keys = useMemo(() => modelKeysByCost(months), [months]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const host = hostRef.current;
    if (!svg || !host) return;
    const width = host.clientWidth || 600;
    const height = 180;
    const margin = { top: 8, right: 12, bottom: 22, left: 52 };
    const sel = d3.select(svg);
    sel.selectAll('*').remove();
    sel.attr('width', width).attr('height', height);
    if (months.length === 0) return;

    const x = d3.scaleBand<string>()
      .domain(months.map((m) => m.month))
      .range([margin.left, width - margin.right])
      .padding(0.35);
    const yMax = d3.max(months, (m) => m.total.total) ?? 0;
    const y = d3.scaleLinear()
      .domain([0, yMax || 1]).nice()
      .range([height - margin.bottom, margin.top]);

    for (const m of months) {
      let y0 = 0;
      for (const k of keys) {
        const v = m.byModel.get(k)?.total ?? 0;
        if (v <= 0) continue;
        sel.append('rect')
          .attr('data-role', 'spend-bar')
          .attr('x', x(m.month)!)
          .attr('width', x.bandwidth())
          .attr('y', y(y0 + v))
          .attr('height', Math.max(1, y(y0) - y(y0 + v)))
          .attr('fill', colorFor(k, keys))
          .append('title')
          .text(`${m.month} · ${modelLabel(k.replace(/\|sub$/, ''))}${k.endsWith('|sub') ? ' · sub' : ''}: ${formatUsd(v)}`);
        y0 += v;
      }
      sel.append('text')
        .attr('x', x(m.month)! + x.bandwidth() / 2)
        .attr('y', height - 6)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-dim)')
        .attr('font-size', 9)
        .attr('font-family', 'ui-monospace, monospace')
        .text(m.month);
    }
    for (const t of y.ticks(3)) {
      sel.append('text')
        .attr('x', margin.left - 6)
        .attr('y', y(t) + 3)
        .attr('text-anchor', 'end')
        .attr('fill', 'var(--text-dim)')
        .attr('font-size', 9)
        .attr('font-family', 'ui-monospace, monospace')
        .text(formatUsd(t));
    }
  }, [months, keys]);

  if (months.length === 0) {
    return <div style={styles.empty}>NO PRICED USAGE IN RANGE</div>;
  }

  const monthsDesc = [...months].reverse();
  return (
    <div style={styles.wrap} data-testid="spend-bars">
      <div style={styles.chips}>
        <div style={{ ...styles.chip, ...styles.chipMain }} data-testid="spend-chip-total">
          ALL-TIME <span style={styles.chipVal}>≈ {formatUsd(summary.total.total)}</span>
        </div>
        <div style={styles.chip} data-testid="spend-chip-input">
          INPUT <span style={styles.chipVal}>{formatUsd(summary.total.input)}</span>
        </div>
        <div style={styles.chip} data-testid="spend-chip-output">
          OUTPUT <span style={styles.chipVal}>{formatUsd(summary.total.output)}</span>
        </div>
        <div style={styles.chip} data-testid="spend-chip-cacheread">
          CACHE R <span style={styles.chipVal}>{formatUsd(summary.total.cacheRead)}</span>
        </div>
        <div style={styles.chip} data-testid="spend-chip-cachewrite">
          CACHE W <span style={styles.chipVal}>{formatUsd(summary.total.cacheWrite)}</span>
        </div>
      </div>
      <div ref={hostRef} style={styles.chartHost}>
        <svg ref={svgRef} />
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.thLeft}>MONTH</th>
            <th style={styles.th}>INPUT</th>
            <th style={styles.th}>OUTPUT</th>
            <th style={styles.th}>CACHE R</th>
            <th style={styles.th}>CACHE W</th>
            <th style={styles.thRight}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {monthsDesc.map((m) => (
            <MonthRows
              key={m.month}
              m={m}
              keys={keys}
              expanded={expanded === m.month}
              onToggle={() => setExpanded(expanded === m.month ? null : m.month)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthRows({ m, keys, expanded, onToggle }: {
  m: MonthCost;
  keys: string[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr data-testid={`spend-month-row-${m.month}`} onClick={onToggle} style={styles.bodyRow}>
        <td style={styles.tdLeft}>{m.month}</td>
        <td style={styles.td}>{formatUsd(m.total.input)}</td>
        <td style={styles.td}>{formatUsd(m.total.output)}</td>
        <td style={styles.td}>{formatUsd(m.total.cacheRead)}</td>
        <td style={styles.td}>{formatUsd(m.total.cacheWrite)}</td>
        <td style={styles.tdRight}>≈ {formatUsd(m.total.total)}</td>
      </tr>
      {expanded && keys.filter((k) => m.byModel.has(k)).map((k) => {
        const c = m.byModel.get(k)!;
        return (
          <tr key={k} data-testid={`spend-month-detail-${m.month}-${k}`} style={styles.detailRow}>
            <td style={styles.tdLeftDetail}>
              ↳ {modelLabel(k.replace(/\|sub$/, ''))}{k.endsWith('|sub') ? ' · sub' : ''}
            </td>
            <td style={styles.td}>{formatUsd(c.input)}</td>
            <td style={styles.td}>{formatUsd(c.output)}</td>
            <td style={styles.td}>{formatUsd(c.cacheRead)}</td>
            <td style={styles.td}>{formatUsd(c.cacheWrite)}</td>
            <td style={styles.tdRight}>{formatUsd(c.total)}</td>
          </tr>
        );
      })}
    </>
  );
}

const mono = 'ui-monospace, monospace';
const styles = {
  wrap: { display: 'flex' as const, flexDirection: 'column' as const, gap: 12, padding: 12, overflowY: 'auto' as const, flex: 1, minHeight: 0 },
  chips: { display: 'flex' as const, gap: 8, flexWrap: 'wrap' as const },
  chip: { border: '1px solid rgba(110,224,238,0.18)', padding: '6px 10px', fontFamily: mono, fontSize: 10, letterSpacing: 1, color: 'var(--text-dim)' },
  chipMain: { borderColor: 'rgba(0,229,255,0.55)' },
  chipVal: { color: 'var(--edge-trail)' },
  chartHost: { flexShrink: 0 },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontFamily: mono, fontSize: 11 },
  thLeft: { textAlign: 'left' as const, padding: '5px 8px', color: 'var(--text-dim)', fontWeight: 400, letterSpacing: 1, borderBottom: '1px solid rgba(110,224,238,0.18)' },
  th: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--text-dim)', fontWeight: 400, letterSpacing: 1, borderBottom: '1px solid rgba(110,224,238,0.18)' },
  thRight: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--edge-trail)', fontWeight: 400, letterSpacing: 1, borderBottom: '1px solid rgba(110,224,238,0.18)' },
  bodyRow: { cursor: 'pointer' as const },
  detailRow: {},
  tdLeft: { textAlign: 'left' as const, padding: '5px 8px', color: 'var(--text)' },
  tdLeftDetail: { textAlign: 'left' as const, padding: '3px 8px 3px 20px', color: 'var(--text-dim)' },
  td: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--text-dim)' },
  tdRight: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--edge-trail)' },
  empty: { padding: 24, color: 'var(--text-dim)', fontFamily: mono, letterSpacing: 3, fontSize: 11, textAlign: 'center' as const },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/tokens/SpendBars.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tokens/SpendBars.tsx tests/unit/tokens/SpendBars.test.tsx
git commit -m "feat(usage-spend): SPEND BARS view (chip strip, monthly chart, ledger)"
```

---

### Task 8: SPEND · MATRIX component

**Files:**
- Create: `src/tokens/SpendMatrix.tsx`
- Test: `tests/unit/tokens/SpendMatrix.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/tokens/SpendMatrix.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpendMatrix } from '../../../src/tokens/SpendMatrix';
import type { PriceTable, TokenUsageRow } from '../../../src/api/client';

const BUNDLED: PriceTable = {
  currency: 'USD', source: 'test',
  perMTok: {
    'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
    'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 },
  },
};

function row(over: Partial<TokenUsageRow>): TokenUsageRow {
  return {
    projectId: 'P', modelId: 'claude-opus-4-8', isSubagent: false, day: '2026-06-01',
    input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0,
    ...over,
  };
}

const ROWS: TokenUsageRow[] = [
  row({ day: '2026-05-10', input: 1_000_000 }),                               // opus may  $5
  row({ day: '2026-06-02', output: 200_000 }),                                // opus june $5
  row({ day: '2026-06-03', modelId: 'claude-sonnet-4-6', input: 1_000_000 }),  // sonnet june $3
];

describe('SpendMatrix', () => {
  it('renders stat cards with breakdown sub-lines', () => {
    render(<SpendMatrix rows={ROWS} prices={{}} bundled={BUNDLED} todayMonth="2026-06" />);
    expect(screen.getByTestId('spend-card-alltime').textContent).toContain('$13.00');
    expect(screen.getByTestId('spend-card-thismonth').textContent).toContain('$8.00');
    expect(screen.getByTestId('spend-card-avg').textContent).toContain('$6.50'); // 13 / 2 months
    expect(screen.getByTestId('spend-card-top').textContent).toContain('Opus 4.8');
  });

  it('renders a month x model grid with totals', () => {
    render(<SpendMatrix rows={ROWS} prices={{}} bundled={BUNDLED} todayMonth="2026-06" />);
    expect(screen.getByTestId('spend-cell-claude-opus-4-8-2026-05').textContent).toBe('$5.00');
    expect(screen.getByTestId('spend-cell-claude-opus-4-8-2026-06').textContent).toBe('$5.00');
    expect(screen.getByTestId('spend-cell-claude-sonnet-4-6-2026-05').textContent).toBe('—');
    expect(screen.getByTestId('spend-cell-claude-sonnet-4-6-2026-06').textContent).toBe('$3.00');
  });

  it('pins a breakdown line when a cell is clicked', () => {
    render(<SpendMatrix rows={ROWS} prices={{}} bundled={BUNDLED} todayMonth="2026-06" />);
    expect(screen.queryByTestId('spend-cell-pin')).toBeNull();
    fireEvent.click(screen.getByTestId('spend-cell-claude-opus-4-8-2026-06'));
    const pin = screen.getByTestId('spend-cell-pin');
    expect(pin.textContent).toContain('2026-06');
    expect(pin.textContent).toContain('out $5.00');
    // clicking again unpins
    fireEvent.click(screen.getByTestId('spend-cell-claude-opus-4-8-2026-06'));
    expect(screen.queryByTestId('spend-cell-pin')).toBeNull();
  });

  it('shows an empty state when nothing is priced', () => {
    render(<SpendMatrix rows={[]} prices={{}} bundled={BUNDLED} todayMonth="2026-06" />);
    expect(screen.getByText('NO PRICED USAGE IN RANGE')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/tokens/SpendMatrix.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/tokens/SpendMatrix.tsx`**

```tsx
import { useMemo, useState } from 'react';
import type { PriceTable, TokenUsageRow } from '../api/client';
import {
  costByMonth, costSummary, formatUsd, modelKeysByCost, zeroSplit,
} from './cost';
import { colorFor } from './palette';
import { modelLabel } from './modelLabel';

type Props = {
  rows: TokenUsageRow[];
  prices: Record<string, PriceTable>;
  bundled: PriceTable;
  todayMonth: string; // YYYY-MM
};

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

function labelOf(k: string): string {
  return `${modelLabel(k.replace(/\|sub$/, ''))}${k.endsWith('|sub') ? ' · sub' : ''}`;
}

export function SpendMatrix({ rows, prices, bundled, todayMonth }: Props) {
  const months = useMemo(() => costByMonth(rows, prices, bundled), [rows, prices, bundled]);
  const summary = useMemo(() => costSummary(rows, prices, bundled), [rows, prices, bundled]);
  const keys = useMemo(() => modelKeysByCost(months), [months]);
  const [pinned, setPinned] = useState<{ key: string; month: string } | null>(null);

  const totalsByKey = useMemo(() => {
    const t = new Map<string, number>();
    for (const m of months) for (const [k, c] of m.byModel) t.set(k, (t.get(k) ?? 0) + c.total);
    return t;
  }, [months]);

  const maxCell = useMemo(() => {
    let max = 0;
    for (const m of months) for (const c of m.byModel.values()) max = Math.max(max, c.total);
    return max;
  }, [months]);

  if (months.length === 0) {
    return <div style={styles.empty}>NO PRICED USAGE IN RANGE</div>;
  }

  const thisMonth = months.find((m) => m.month === todayMonth)?.total ?? zeroSplit();
  const avg = summary.total.total / months.length;
  const topKey = keys[0];
  const topShare = summary.total.total > 0 ? ((totalsByKey.get(topKey) ?? 0) / summary.total.total) * 100 : 0;

  return (
    <div style={styles.wrap} data-testid="spend-matrix">
      <div style={styles.cards}>
        <div style={styles.card} data-testid="spend-card-alltime">
          <div style={styles.cardLabel}>ALL-TIME</div>
          <div style={styles.cardValueMain}>≈ {formatUsd(summary.total.total)}</div>
          <div style={styles.cardSub}>
            in {formatUsd(summary.total.input)} · out {formatUsd(summary.total.output)} · cache {formatUsd(summary.total.cacheRead + summary.total.cacheWrite)}
          </div>
        </div>
        <div style={styles.card} data-testid="spend-card-thismonth">
          <div style={styles.cardLabel}>THIS MONTH</div>
          <div style={styles.cardValueMain}>≈ {formatUsd(thisMonth.total)}</div>
          <div style={styles.cardSub}>
            in {formatUsd(thisMonth.input)} · out {formatUsd(thisMonth.output)} · cache {formatUsd(thisMonth.cacheRead + thisMonth.cacheWrite)}
          </div>
        </div>
        <div style={styles.card} data-testid="spend-card-avg">
          <div style={styles.cardLabel}>AVG / MONTH</div>
          <div style={styles.cardValue}>≈ {formatUsd(avg)}</div>
          <div style={styles.cardSub}>{months.length} month{months.length === 1 ? '' : 's'} of data</div>
        </div>
        <div style={styles.card} data-testid="spend-card-top">
          <div style={styles.cardLabel}>TOP MODEL</div>
          <div style={styles.cardValue}>{labelOf(topKey)} <span style={styles.cardShare}>{Math.round(topShare)}%</span></div>
          <div style={styles.cardSub}>≈ {formatUsd(totalsByKey.get(topKey) ?? 0)} all-time</div>
        </div>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.thLeft}>MODEL ▼ · MONTH ▶</th>
            {months.map((m) => <th key={m.month} style={styles.th}>{m.month}</th>)}
            <th style={styles.thRight}>Σ</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const color = colorFor(k, keys);
            const pinnedHere = pinned?.key === k ? months.find((m) => m.month === pinned.month)?.byModel.get(k) : undefined;
            return (
              <FragmentRow
                key={k}
                k={k}
                color={color}
                months={months}
                maxCell={maxCell}
                rowTotal={totalsByKey.get(k) ?? 0}
                pinnedMonth={pinned?.key === k ? pinned.month : null}
                pinnedSplit={pinnedHere}
                onCellClick={(month) =>
                  setPinned(pinned && pinned.key === k && pinned.month === month ? null : { key: k, month })}
              />
            );
          })}
          <tr>
            <td style={styles.tdLeft}>Σ</td>
            {months.map((m) => <td key={m.month} style={styles.td}>{formatUsd(m.total.total)}</td>)}
            <td style={styles.tdGrand}>≈ {formatUsd(summary.total.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({ k, color, months, maxCell, rowTotal, pinnedMonth, pinnedSplit, onCellClick }: {
  k: string;
  color: string;
  months: ReturnType<typeof costByMonth>;
  maxCell: number;
  rowTotal: number;
  pinnedMonth: string | null;
  pinnedSplit: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number } | undefined;
  onCellClick: (month: string) => void;
}) {
  return (
    <>
      <tr>
        <td style={styles.tdLeft}>{labelOf(k)}</td>
        {months.map((m) => {
          const c = m.byModel.get(k);
          if (!c) {
            return <td key={m.month} style={styles.td} data-testid={`spend-cell-${k}-${m.month}`}>—</td>;
          }
          const alpha = maxCell > 0 ? 0.04 + (c.total / maxCell) * 0.22 : 0.04;
          return (
            <td
              key={m.month}
              data-testid={`spend-cell-${k}-${m.month}`}
              onClick={() => onCellClick(m.month)}
              style={{ ...styles.tdCell, background: hexToRgba(color, alpha) }}
            >{formatUsd(c.total)}</td>
          );
        })}
        <td style={styles.tdRight}>{formatUsd(rowTotal)}</td>
      </tr>
      {pinnedMonth && pinnedSplit && (
        <tr>
          <td colSpan={months.length + 2} style={styles.pinCell} data-testid="spend-cell-pin">
            ↳ {pinnedMonth}: in {formatUsd(pinnedSplit.input)} · out {formatUsd(pinnedSplit.output)} · cache r {formatUsd(pinnedSplit.cacheRead)} · cache w {formatUsd(pinnedSplit.cacheWrite)}
          </td>
        </tr>
      )}
    </>
  );
}

const mono = 'ui-monospace, monospace';
const styles = {
  wrap: { display: 'flex' as const, flexDirection: 'column' as const, gap: 12, padding: 12, overflow: 'auto' as const, flex: 1, minHeight: 0 },
  cards: { display: 'flex' as const, gap: 10, flexWrap: 'wrap' as const },
  card: { flex: 1, minWidth: 150, border: '1px solid rgba(0,229,255,0.35)', padding: '8px 10px', fontFamily: mono },
  cardLabel: { fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 },
  cardValueMain: { fontSize: 15, color: 'var(--edge-trail)' },
  cardValue: { fontSize: 13, color: 'var(--text)' },
  cardShare: { color: 'var(--edge-trail)' },
  cardSub: { fontSize: 8, color: 'var(--text-dim)', marginTop: 2 },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontFamily: mono, fontSize: 11 },
  thLeft: { textAlign: 'left' as const, padding: '5px 8px', color: 'var(--text-dim)', fontWeight: 400, letterSpacing: 1, borderBottom: '1px solid rgba(110,224,238,0.18)' },
  th: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--text-dim)', fontWeight: 400, letterSpacing: 1, borderBottom: '1px solid rgba(110,224,238,0.18)' },
  thRight: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--edge-trail)', fontWeight: 400, letterSpacing: 1, borderBottom: '1px solid rgba(110,224,238,0.18)' },
  tdLeft: { textAlign: 'left' as const, padding: '5px 8px', color: 'var(--text)', borderTop: '1px solid rgba(110,224,238,0.08)' },
  td: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--text-dim)', borderTop: '1px solid rgba(110,224,238,0.08)' },
  tdCell: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--text)', borderTop: '1px solid rgba(110,224,238,0.08)', cursor: 'pointer' as const },
  tdRight: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--edge-trail)', borderTop: '1px solid rgba(110,224,238,0.08)' },
  tdGrand: { textAlign: 'right' as const, padding: '5px 8px', color: 'var(--edge-trail)', borderTop: '1px solid rgba(110,224,238,0.25)' },
  pinCell: { textAlign: 'left' as const, padding: '2px 8px 6px 20px', color: 'var(--text-dim)', fontSize: 9 },
  empty: { padding: 24, color: 'var(--text-dim)', fontFamily: mono, letterSpacing: 3, fontSize: 11, textAlign: 'center' as const },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/tokens/SpendMatrix.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tokens/SpendMatrix.tsx tests/unit/tokens/SpendMatrix.test.tsx
git commit -m "feat(usage-spend): SPEND MATRIX view (stat cards, heat grid, cell pin)"
```

---

### Task 9: TOKENS | SPEND toggle in TokensPage

**Files:**
- Modify: `src/tokens/TokensPage.tsx`
- Test: `tests/unit/tokens/TokensPage.view.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/tokens/TokensPage.view.test.tsx`. Mirror the mocking approach used in `tests/unit/tokens/TokensPage.filter.test.tsx` (same `useTokenUsage` mock mechanism — copy its setup), with mock data:

```tsx
// Mock response shape (adapt to the file's existing mock mechanism):
const MOCK_RESPONSE = {
  projects: [{ id: 'P', cwd: 'C:/p' }],
  rows: [{
    projectId: 'P', modelId: 'claude-opus-4-8', isSubagent: false, day: '2026-06-01',
    input: 1_000_000, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0,
  }],
  prices: {},
  bundledPrices: {
    currency: 'USD', source: 'test',
    perMTok: { 'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 } },
  },
};
```

Tests (rendering `<TokensPage family="all" preset="all" onPresetChange={() => {}} />` inside the same providers the filter test uses):

```tsx
it('defaults to the TOKENS view', () => {
  // render…
  expect(screen.getByTestId('tokens-page')).toBeTruthy();
  expect(screen.queryByTestId('spend-bars')).toBeNull();
  expect(screen.getByTestId('usage-view-tokens').getAttribute('aria-pressed')).toBe('true');
});

it('switches to SPEND · BARS and shows the disclaimer', async () => {
  // render…
  fireEvent.click(screen.getByTestId('usage-view-spend'));
  expect(await screen.findByTestId('spend-bars')).toBeTruthy();
  expect(screen.getByTestId('spend-disclaimer').textContent).toContain('API LIST PRICES');
  expect(screen.queryByTestId('model-row-claude-opus-4-8')).toBeNull(); // TOKENS panels hidden
});

it('switches between BARS and MATRIX', async () => {
  // render…
  fireEvent.click(screen.getByTestId('usage-view-spend'));
  fireEvent.click(await screen.findByTestId('spend-mode-matrix'));
  expect(await screen.findByTestId('spend-matrix')).toBeTruthy();
  expect(screen.queryByTestId('spend-bars')).toBeNull();
  fireEvent.click(screen.getByTestId('spend-mode-bars'));
  expect(await screen.findByTestId('spend-bars')).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/tokens/TokensPage.view.test.tsx`
Expected: FAIL — `usage-view-*` testids don't exist.

- [ ] **Step 3: Implement the toggle in `TokensPage.tsx`**

Add imports:

```tsx
import { SpendBars } from './SpendBars';
import { SpendMatrix } from './SpendMatrix';
```

Add state next to the existing `useState` calls:

```tsx
  const [view, setView] = useState<'tokens' | 'spend'>('tokens');
  const [spendMode, setSpendMode] = useState<'bars' | 'matrix'>('bars');
```

In the chrome row, directly after the title div, add the view toggle:

```tsx
        <div style={styles.presetGroupLeft}>
          {(['tokens', 'spend'] as const).map((v) => (
            <button
              key={v}
              type="button"
              data-testid={`usage-view-${v}`}
              onClick={() => setView(v)}
              style={{ ...styles.presetBtn, ...(view === v ? styles.presetBtnOn : null) }}
              aria-pressed={view === v}
            >{v.toUpperCase()}</button>
          ))}
        </div>
```

with style `presetGroupLeft: { display: 'flex' as const, gap: 6, flexShrink: 0 },` added to `styles`.

Replace the data-present body (`{query.data && query.data.projects.length > 0 && (<>…</>)}`) with a view switch — the existing two panels stay exactly as they are inside the `view === 'tokens'` branch:

```tsx
      {query.data && query.data.projects.length > 0 && view === 'tokens' && (
        <>
          {/* existing panelTop + panelBottom JSX unchanged */}
        </>
      )}
      {query.data && query.data.projects.length > 0 && view === 'spend' && (
        <div style={styles.panelBottom}>
          <div style={styles.subHeader}>
            <div style={styles.subTitle}>SPEND</div>
            <div data-testid="spend-disclaimer" style={styles.disclaimer}>
              EST. AT API LIST PRICES — COVERED BY YOUR SUBSCRIPTION
            </div>
            <div style={styles.presetGroup}>
              {(['bars', 'matrix'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`spend-mode-${m}`}
                  onClick={() => setSpendMode(m)}
                  style={{ ...styles.presetBtn, ...(spendMode === m ? styles.presetBtnOn : null) }}
                  aria-pressed={spendMode === m}
                >{m.toUpperCase()}</button>
              ))}
            </div>
          </div>
          {spendMode === 'bars' ? (
            <SpendBars
              rows={filtered}
              prices={query.data.prices}
              bundled={query.data.bundledPrices}
            />
          ) : (
            <SpendMatrix
              rows={filtered}
              prices={query.data.prices}
              bundled={query.data.bundledPrices}
              todayMonth={today.slice(0, 7)}
            />
          )}
        </div>
      )}
```

Add the style:

```ts
  disclaimer: {
    fontSize: 9,
    letterSpacing: 1,
    color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
  },
```

- [ ] **Step 4: Run tests + typecheck + full unit suite**

Run: `npx vitest run tests/unit/tokens/ && npm run typecheck && npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(usage-spend): TOKENS|SPEND view toggle with BARS/MATRIX switch"
```

---

### Task 10: E2E coverage

**Files:**
- Create: `tests/fixtures/claude-projects/C--demo-tokens/2026-05-18-tok3.jsonl`
- Create: `tests/e2e/global-setup.ts`
- Modify: `playwright.config.ts`
- Create: `tests/e2e/spend-view.spec.ts`

- [ ] **Step 1: Add a big-usage e2e fixture (makes $ figures readable)**

Create `tests/fixtures/claude-projects/C--demo-tokens/2026-05-18-tok3.jsonl`:

```jsonl
{"uuid":"big1","parentUuid":null,"timestamp":"2026-05-18T10:00:00Z","type":"user","message":{"role":"user","content":"big run"}}
{"uuid":"big2","parentUuid":"big1","timestamp":"2026-05-18T10:00:01Z","type":"assistant","message":{"role":"assistant","model":"claude-opus-4-8","content":[{"type":"text","text":"ok"}],"usage":{"input_tokens":1000000,"output_tokens":200000,"cache_read_input_tokens":10000000,"cache_creation_input_tokens":1500000,"cache_creation":{"ephemeral_5m_input_tokens":1000000,"ephemeral_1h_input_tokens":500000}}}}
```

Expected bundled-price cost for this row: input $5.00 + output $5.00 + cacheRead $5.00 + cacheWrite ($6.25 + $5.00) = **$26.25**. The other priced fixture rows add < $0.01 total, so the all-time total still formats as `$26.25`.

- [ ] **Step 2: Wire `TG_USAGE_DIR` + cleanup into Playwright**

Create `tests/e2e/global-setup.ts`:

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Wipe the e2e usage dir so every run starts from empty history —
// otherwise rows merged from older fixture versions linger forever.
export default async function globalSetup(): Promise<void> {
  await fs.rm(path.resolve(__dirname, '../../.local/e2e-usage'), { recursive: true, force: true });
}
```

In `playwright.config.ts`, add to the top-level config object:

```ts
  globalSetup: './tests/e2e/global-setup.ts',
```

and extend `webServer.env`:

```ts
    env: {
      CLAUDE_HOME: fixtureClaudeHome,
      TG_USAGE_DIR: path.resolve(__dirname, '.local/e2e-usage'),
    },
```

- [ ] **Step 3: Write the e2e spec**

Create `tests/e2e/spend-view.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usageDir = path.resolve(__dirname, '../../.local/e2e-usage');

test('spend view: $ figures match fixtures and history persists to disk', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-tab-usage').click();
  await page.getByTestId('tokens-preset-all').click();

  // TOKENS view: cost chip + breakdown on the opus-4-8 row
  await expect(page.getByTestId('model-cost-claude-opus-4-8')).toHaveText('≈ $26.25');
  await expect(page.getByTestId('model-cost-breakdown-claude-opus-4-8'))
    .toContainText('cache w $11.25');

  // SPEND · BARS
  await page.getByTestId('usage-view-spend').click();
  await expect(page.getByTestId('spend-disclaimer')).toBeVisible();
  await expect(page.getByTestId('spend-chip-total')).toContainText('$26.25');
  await expect(page.getByTestId('spend-chip-cachewrite')).toContainText('$11.25');
  await expect(page.locator('svg [data-role="spend-bar"]').first()).toBeVisible();

  // Ledger month row expands to per-model detail
  await page.getByTestId('spend-month-row-2026-05').click();
  await expect(page.getByTestId('spend-month-detail-2026-05-claude-opus-4-8')).toBeVisible();

  // SPEND · MATRIX
  await page.getByTestId('spend-mode-matrix').click();
  await expect(page.getByTestId('spend-cell-claude-opus-4-8-2026-05')).toContainText('$26.25');
  await page.getByTestId('spend-cell-claude-opus-4-8-2026-05').click();
  await expect(page.getByTestId('spend-cell-pin')).toContainText('cache w');

  // History persisted on disk by the server
  const raw = await fs.readFile(path.join(usageDir, 'usage-history.json'), 'utf8');
  const history = JSON.parse(raw) as { rows: Array<{ modelId: string; day: string }> };
  expect(history.rows.some((r) => r.modelId === 'claude-opus-4-8' && r.day === '2026-05-18')).toBe(true);
});
```

- [ ] **Step 4: Run the e2e suite**

First kill any stray dev server (`Get-Process node | Stop-Process` if needed, or check nothing is listening on 5174).

Run: `npm run test:e2e`
Expected: PASS — including the pre-existing `tokens-page.spec.ts` (its assertions are relative counts and named rows, unaffected by the new fixture).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(usage-spend): e2e coverage for spend views and history persistence"
```

---

### Task 11: Docs + final verification

**Files:**
- Modify: `docs/tech_docs/DEVELOPER_GUIDE.md`
- Modify: `docs/tech_docs/USER_GUIDE.md`

- [ ] **Step 1: Update developer docs**

In `docs/tech_docs/DEVELOPER_GUIDE.md`, find the section describing `/api/token-usage` (or the server endpoints list) and update/append:

```markdown
### Usage history & pricing (`.local/usage/`)

`/api/token-usage` no longer reads logs only: on dev-server boot and on every request,
fresh log aggregation is merged (per-key field-wise `max()`) into
`.local/usage/usage-history.json` (gitignored, atomic write with `.bak`). This preserves
usage data beyond Claude Code's ~1 month log retention. Cache tokens are split into
`cacheRead` / `cacheWrite5m` / `cacheWrite1h` for pricing.

Model prices live in `server/model-pricing.ts` (`BUNDLED_PRICES`, USD per MTok) and are
snapshotted once per month to `.local/usage/prices/YYYY-MM.json` (never overwritten —
hand-edits are respected). Cost is computed client-side in `src/tokens/cost.ts` as
`tokens × prices(month-of-row)`; months without a snapshot use the bundled table.
Unknown models are reported as "unpriced", never silently $0.

- Reset everything: delete `.local/usage/`.
- Tests/e2e: override the directory with `TG_USAGE_DIR`.
- When Anthropic changes prices: update `BUNDLED_PRICES`.
```

- [ ] **Step 2: Update user docs**

In `docs/tech_docs/USER_GUIDE.md`, find the USAGE dashboard section and append:

```markdown
### SPEND view

The USAGE page has a `TOKENS | SPEND` toggle. SPEND estimates what your usage would
cost at Anthropic's published API list prices (your subscription covers the actual
usage — no API calls are made; this is local arithmetic). Two sub-views:

- **BARS** — monthly cost as stacked bars per model, with a month-by-month ledger
  (input / output / cache-read / cache-write columns; click a month for per-model detail).
- **MATRIX** — stat cards (all-time, this month, avg/month, top model) plus a
  month × model grid; click a cell for that cell's full cost breakdown.

Token history is stored in `.local/usage/` inside the repo (not committed), so the
dashboard keeps data older than Claude Code's ~1-month log retention. Delete that
folder to reset. Monthly price files in `.local/usage/prices/` can be hand-edited.
```

- [ ] **Step 3: Full verification**

Run: `npm run typecheck && npm run test && npm run test:e2e`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/tech_docs/DEVELOPER_GUIDE.md docs/tech_docs/USER_GUIDE.md
git commit -m "docs(usage-spend): document usage history persistence and SPEND view"
```

---

## Spec coverage checklist (self-review)

| Spec section | Task(s) |
| --- | --- |
| §1 history location, schema, cache split, `<synthetic>` skip, fallback | 1, 2, 4 |
| §1 merge semantics (`max()`), atomic write, `.bak` | 2 |
| §2 bundled table, monthly snapshots, no-overwrite | 3 |
| §2 lookup rules (normalize, month, per-model fallback, unpriced) | 5 |
| §3 API payload shape (`prices`, `bundledPrices`, `unsyncedWarning`) | 4 |
| §3 boot + per-request sync, `TG_USAGE_DIR` | 4, 10 |
| §4 cost module | 5 |
| §5 TOKENS view $ chips/breakdowns/warning/disclaimer | 6, 9 |
| §5 SPEND BARS (chips, chart, ledger) | 7 |
| §5 SPEND MATRIX (cards, grid, pin) | 8 |
| §5 `TOKENS \| SPEND` + `BARS ⁄ MATRIX` toggles | 9 |
| §6 error handling (corrupt, write-fail, invalid snapshot) | 2, 3, 4 |
| §7 unit/component/e2e testing | 1–10 |
| `.gitignore` `.local/` | 4 |