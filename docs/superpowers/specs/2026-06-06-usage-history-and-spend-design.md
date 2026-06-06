# Usage History Persistence + Spend View — Design

**Date:** 2026-06-06
**Status:** Approved (brainstorm with user, mockups validated in visual companion)
**Predecessor:** `2026-05-25-token-usage-page-design.md` (the USAGE dashboard this extends)

## Problem

1. **Log retention.** The USAGE dashboard aggregates `~/.claude/projects/**/*.jsonl` on every request. Claude Code retains those logs for roughly a month, so the dashboard's history silently erodes — `ALL` only means "the last ~30 days".
2. **No cost signal.** The dashboard shows token counts but not what they would cost. The user wants an *estimated* dollar figure — what this usage would cost at Anthropic's published API list prices — as a point of comparison against their subscription. The app itself makes **zero** Anthropic API calls; all $ figures are arithmetic on local data.

## Decisions (from brainstorm)

| Question | Decision |
| --- | --- |
| Where does persistent history live? | In the repo: `.local/usage/` (gitignored, user-owned, never committed) |
| When does sync happen? | Dev-server boot + every `GET /api/token-usage` request. No timers, no watchers. |
| Where do prices come from? | Bundled table in repo code, snapshotted to a monthly price file; user-editable |
| Storage shape | Single merged history JSON (Approach A) — not monthly ledgers, not a DB |
| Cost computed where? | Client-side, at render time, from token history × month prices. History stores tokens only, never dollars. |
| SPEND layout | Both mockup options: SPEND tab with a `BARS ⁄ MATRIX` sub-view switch |
| $ breakdowns | First-class everywhere: input / output / cache-read / cache-write splits, not just totals |

## Architecture overview

```
~/.claude/projects/**/*.jsonl          .local/usage/usage-history.json
        │  (fresh aggregation,                 │  (persisted history)
        │   split cache fields)                │
        ▼                                      ▼
   aggregate-token-usage.ts ──► usage-history-store.ts (merge: per-key max, atomic write)
                                               │
   model-pricing.ts ──► .local/usage/prices/YYYY-MM.json (snapshot once per month)
                                               │
                              GET /api/token-usage ──► { projects, rows, prices, bundledPrices }
                                               │
                       client: aggregate.ts (unchanged filters) + cost.ts (new, pure $ math)
                                               │
                        TokensPage: TOKENS view (+$ chips/breakdowns) | SPEND view (BARS ⁄ MATRIX)
```

## 1. Persistent usage history

### Location

```
<repo root>/.local/usage/
├── usage-history.json        merged token history
├── usage-history.json.bak    previous version (written before each overwrite)
└── prices/
    └── YYYY-MM.json          one price snapshot per month
```

- `.local/` added to `.gitignore`.
- Directory created on demand; deleting it is the documented full reset.
- Root overridable via env var `TG_USAGE_DIR` (used by tests; defaults to `<vite root>/.local/usage`).

### History file schema (v1)

```jsonc
{
  "version": 1,
  "lastSyncAt": "2026-06-06T12:34:56Z",
  "projects": { "<projectId>": "<decoded cwd>" },   // survives log expiry; feeds project filter
  "rows": [
    {
      "projectId": "C--Users-...",
      "modelId": "claude-opus-4-8",
      "isSubagent": false,
      "day": "2026-06-06",            // UTC, matching existing chart bucketing
      "input": 1234,
      "output": 5678,
      "cacheRead": 250000,            // usage.cache_read_input_tokens
      "cacheWrite5m": 9000,           // usage.cache_creation.ephemeral_5m_input_tokens
      "cacheWrite1h": 3000            // usage.cache_creation.ephemeral_1h_input_tokens
    }
  ]
}
```

- Granularity: `projectId × modelId × isSubagent × day` — identical to today's `TokenUsageRow`, so every existing filter (project, preset, family, subagent) works across full history unchanged.
- The legacy `cached` metric is **derived**: `cacheRead + cacheWrite5m + cacheWrite1h`. The existing chart and metric switcher keep working without visual change.
- The cache split exists because prices differ ~20×: reads are 0.1× input price; 5m writes 1.25×; 1h writes 2×.
- Size: years of data ≈ a few thousand rows ≈ tens of KB. No pagination, no compaction needed.

### Aggregation changes (`server/aggregate-token-usage.ts`)

- Emit `cacheRead`, `cacheWrite5m`, `cacheWrite1h` per row (replacing the single `cached` accumulator).
- Fallback for log lines lacking the `usage.cache_creation` detail object: count all of `cache_creation_input_tokens` as `cacheWrite5m` (Claude Code's default TTL).
- Skip events with `message.model === "<synthetic>"` (API-error placeholders; zero usage).

### Merge semantics (`server/usage-history-store.ts`, new)

- `readHistory(dir)` — load + validate; missing file → empty history.
- `mergeRows(history, fresh)` — keyed by `projectId|modelId|isSubagent|day`:
  - key in both → **per-field `max()`** (each of the 5 token fields independently)
  - key only in history → keep (logs aged out)
  - key only in fresh → add
- `writeHistory(dir, history)` — copy live file to `.bak` → write `*.tmp` → rename over live file (atomic; a crash mid-write can never corrupt the live file).
- `projects` map is merged the same way (union; fresh cwd wins on conflict).

**Why `max()`:** retention deletes whole session files, so a *past* day's fresh aggregation can only be ≤ what history recorded when the day was fully present; for the *current* day fresh ≥ stored. `max()` is correct for both and guarantees history never shrinks.

### Sync triggers (`server/vite-plugin-sessions.ts`)

1. **Boot** (`configureServer`): fire-and-forget `syncUsageHistory()` + `ensureMonthSnapshot(currentMonth)`. Async; failure logs a warning, never blocks or crashes startup.
2. **Every `GET /api/token-usage`**: same sync, then respond with the merged dataset.

Consequence: history is topped up whenever the app runs. Gaps only occur if the app isn't run for longer than log retention (~1 month) — accepted limitation.

## 2. Pricing

### Bundled table (`server/model-pricing.ts`, new)

Per-model USD per **million tokens**, five fields each. Seed values (Anthropic published API pricing, cached 2026-05-26 — **re-verify against the live pricing page during implementation**):

| Model | input | output | cacheRead (0.1×) | cacheWrite5m (1.25×) | cacheWrite1h (2×) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `claude-opus-4-8` | 5.00 | 25.00 | 0.50 | 6.25 | 10.00 |
| `claude-opus-4-7` | 5.00 | 25.00 | 0.50 | 6.25 | 10.00 |
| `claude-opus-4-6` | 5.00 | 25.00 | 0.50 | 6.25 | 10.00 |
| `claude-sonnet-4-6` | 3.00 | 15.00 | 0.30 | 3.75 | 6.00 |
| `claude-haiku-4-5` | 1.00 | 5.00 | 0.10 | 1.25 | 2.00 |

### Monthly snapshots

```jsonc
// .local/usage/prices/2026-06.json
{ "month": "2026-06", "currency": "USD", "source": "bundled 2026-06-01",
  "perMTok": { "claude-opus-4-8": { "input": 5.0, "output": 25.0, "cacheRead": 0.5, "cacheWrite5m": 6.25, "cacheWrite1h": 10.0 }, ... } }
```

- `ensureMonthSnapshot(dir, month)` writes the file from the bundled table **only if absent** — user hand-edits are never overwritten.
- When Anthropic changes prices, the bundled table is updated in code; future months snapshot the new values, past months keep theirs.

### Lookup rules (client, `priceFor`)

1. Normalize model ID: strip trailing date suffix (`claude-haiku-4-5-20251001` → `claude-haiku-4-5`).
2. Look in `prices[month]` for the row's month (`day.slice(0,7)`).
3. Model missing from that snapshot (or month has no snapshot, i.e. pre-dates the feature) → bundled table.
4. Still missing → **unpriced**: excluded from all $ totals, but accumulated and surfaced in the UI ("⚠ N tokens from M unpriced models"). Never silently $0.

## 3. API changes

`GET /api/token-usage` response (extends existing shape; `useTokenUsage()` hook unchanged):

```ts
type TokenUsageRow = {
  projectId: string; modelId: string; isSubagent: boolean; day: string;
  input: number; output: number;
  cacheRead: number; cacheWrite5m: number; cacheWrite1h: number;  // replaces `cached`
};

type PriceEntry = { input: number; output: number; cacheRead: number; cacheWrite5m: number; cacheWrite1h: number };
type PriceTable = { month?: string; currency: 'USD'; source: string; perMTok: Record<string, PriceEntry> };

type TokenUsageResponse = {
  projects: TokenUsageProject[];          // live dirs ∪ history projects map
  rows: TokenUsageRow[];                  // merged history ∪ fresh
  prices: Record<string, PriceTable>;     // 'YYYY-MM' → snapshot
  bundledPrices: PriceTable;              // fallback
  unsyncedWarning?: string;               // set when persistence failed this round
};
```

## 4. Client cost module (`src/tokens/cost.ts`, new)

Pure functions, no React (mirrors `aggregate.ts`):

- `normalizeModelId(id): string`
- `priceFor(modelId, month, prices, bundled): PriceEntry | null`
- `costOfRow(row, prices, bundled): { usd: CostSplit } | { unpriced: true; tokens: number }`
  where `CostSplit = { input, output, cacheRead, cacheWrite, total }` and
  `usd.total = (input·pIn + output·pOut + cacheRead·pRead + cacheWrite5m·pW5m + cacheWrite1h·pW1h) / 1e6`
- `costByModel(rows, ...)` → per-model `CostSplit` + `unpricedTokens` (Section A chips + breakdown lines)
- `costByMonth(rows, ...)` → per-month, per-model `CostSplit` (SPEND views)

`aggregate.ts` changes: derive `cached` from the three new fields; everything else untouched.

## 5. UI

All $ figures render as estimates (`≈ $12.40`). The SPEND header carries a one-line disclaimer: *"estimated at API list prices — your subscription covers this."*

### TOKENS view (existing, additions only)

- Section A header gains `TOTAL ≈ $X` for the current filter selection.
- Each model row gains a `≈ $` chip after the token count, and a dim breakdown line under the bar: `in $a · out $b · cache r $c · cache w $d`.
- Unpriced-model warning line at the bottom of Section A when applicable.

### SPEND view (new; sub-view toggle in the USAGE page header: `TOKENS | SPEND`, then `BARS ⁄ MATRIX` within SPEND)

Both views respect the existing project / preset / family filters.

**SPEND · BARS (time-first):**
- Summary chip strip: `ALL-TIME ≈ $X · INPUT $a · OUTPUT $b · CACHE R $c · CACHE W $d` (for current filters).
- Stacked bar chart: $ per **month**, one segment per model, same palette as the token chart (d3, same imperative-in-useEffect pattern as `DailyUsageChart`).
- Ledger table beneath: one row per month with INPUT / OUTPUT / CACHE R / CACHE W / TOTAL columns; clicking a month row expands per-model detail with the same columns.

**SPEND · MATRIX (model-first):**
- Stat cards: ALL-TIME, THIS MONTH, AVG/MONTH (each with an `in · out · cache` sub-line), TOP MODEL (share % + all-time $).
- Month × model grid: each cell a $ amount with heat-glow proportional to cost (per-model family color); `Σ` row and column.
- Clicking a cell pins that model+month's full `in / out / cache r / cache w` breakdown line under the row.

Mockups validated in the visual companion session (`.superpowers/brainstorm/2158-1780743333/content/spend-view-layout-v2.html`).

## 6. Error handling & edge cases

| Case | Behavior |
| --- | --- |
| History file corrupt | Rename to `usage-history.corrupt-<ts>.json`, try `.bak`, else rebuild from logs. Console warning + `unsyncedWarning`. Never crashes. |
| History write fails | Serve merged data from memory; skip persistence this round; `unsyncedWarning` set. |
| Price snapshot unparseable | Bundled fallback for that month; console warning naming the file. |
| Two dev servers (stray `npm run dev`) | Atomic rename → last-writer-wins, no corruption; `max()` merge re-absorbs on next sync. |
| Log line without `cache_creation` detail | All `cache_creation_input_tokens` counted as 5m writes. |
| Model released mid-month after snapshot exists | Per-model fallback to bundled table (lookup is per-model, not per-file). |
| First run | No history → fresh aggregation is the history. Zero setup. |
| Reset | Delete `.local/usage/`. |

Days and months are UTC throughout, matching existing chart bucketing.

## 7. Testing

- **Unit (vitest):**
  - `mergeRows`: growth on current day; partial log erosion (fresh < history → history wins); disjoint keys; projects-map union.
  - `normalizeModelId`: date suffixes, exact IDs, unknowns.
  - `priceFor`: snapshot hit, bundled fallback (missing month / missing model), null for unknown.
  - `costOfRow`: 5-field formula incl. distinct 5m/1h write prices; unpriced path.
  - History store: atomic write leaves valid file; corrupt-file recovery chain (live → bak → fresh).
  - Aggregation: cache split fields, `cache_creation` fallback, `<synthetic>` skipped.
- **Component:** Section A chip + breakdown line; SPEND `BARS ⁄ MATRIX` switch; unpriced warning with `claude-fake` fixture; ledger row expand; matrix cell pin.
- **E2E (Playwright):** `TG_USAGE_DIR` → temp dir; assert history file created on load; simulate log deletion between loads → old day survives; fixture price file → SPEND shows expected $ figures. (Kill stray dev servers first — port 5174 gotcha.)

## 8. Non-goals (v1)

- No live price fetching from Anthropic (bundled table only).
- No currency other than USD.
- No per-session cost attribution (day-level only).
- No history import/merge across machines.
- No Anthropic API calls of any kind — all $ figures are local arithmetic.

## File-by-file change list

| File | Change |
| --- | --- |
| `server/usage-history-store.ts` | **new** — read/merge/atomic-write history |
| `server/model-pricing.ts` | **new** — bundled table, `ensureMonthSnapshot`, `loadPriceSnapshots` |
| `server/aggregate-token-usage.ts` | cache split fields, `cache_creation` fallback, skip `<synthetic>` |
| `server/vite-plugin-sessions.ts` | boot sync, per-request sync, extended response |
| `src/api/client.ts` | extended `TokenUsageRow` / `TokenUsageResponse` types |
| `src/tokens/cost.ts` | **new** — pure cost math |
| `src/tokens/aggregate.ts` | derive `cached` from split fields |
| `src/tokens/TokensPage.tsx` | `TOKENS \| SPEND` toggle; Section A $ additions |
| `src/tokens/SpendBars.tsx` | **new** — chip strip, monthly $ chart, ledger table |
| `src/tokens/SpendMatrix.tsx` | **new** — stat cards, heat grid, cell pinning |
| `src/tokens/OverallSpendList.tsx` | $ chip + breakdown line per model row |
| `.gitignore` | add `.local/` |