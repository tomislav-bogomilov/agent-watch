# Token Usage Page — Design

## Summary

A new top-level page in ThoughtGraph that shows model-level token consumption across all Claude Code sessions on this machine. Two sections: per-model overall spend (input / output / cached), and a day-by-day stacked bar chart of usage per model. Filterable by project; time range presets `7D / 30D / 90D / ALL`. Aggregation runs server-side in the Vite plugin; the page is rendered with existing dependencies only (React + d3 + TanStack Query).

## Goals

- See total token spend per Claude model used by Claude Code, broken into input / output / cached.
- See how usage shifts day by day, with each model as its own stack segment.
- Scope the view to a single project when needed.
- No new runtime dependencies.

## Non-goals

- Cost estimation in dollars. (Pricing varies by model and tier; out of scope until requested.)
- Live polling. The page fetches once per mount and on tab refocus via TanStack Query's defaults.
- Per-prompt or per-session drilldown from this page. (The graph view is already that.)
- Trend analytics beyond raw daily totals (no week-over-week deltas, no forecasting).

## Data source

Real Claude Code JSONL files under `~/.claude/projects/<projectId>/...`:

- Main session file: `~/.claude/projects/<projectId>/<sessionId>.jsonl`
- Subagent files: `~/.claude/projects/<projectId>/<sessionId>/subagents/*.jsonl`

Each assistant event in a JSONL has shape:

```json
{
  "type": "assistant",
  "timestamp": "2026-05-25T06:19:39.336Z",
  "message": {
    "role": "assistant",
    "model": "claude-opus-4-7",
    "usage": {
      "input_tokens": 8,
      "output_tokens": 20,
      "cache_read_input_tokens": 2300,
      "cache_creation_input_tokens": 900
    }
  }
}
```

`cached = cache_read_input_tokens + cache_creation_input_tokens`. The four-bucket split is preserved in the source data; the UI collapses it to three.

Events without `model` or `usage` are skipped (some internal Claude Code events lack them).

## Architecture

### Server: `/api/token-usage`

Added to the existing `sessionsPlugin()` in `server/vite-plugin-sessions.ts`.

`GET /api/token-usage` returns:

```ts
type TokenUsageResponse = {
  projects: { id: string; cwd: string }[];   // for the filter dropdown
  rows: TokenUsageRow[];
};

type TokenUsageRow = {
  projectId: string;
  modelId: string;            // raw, e.g. "claude-opus-4-7"
  isSubagent: boolean;
  day: string;                // "YYYY-MM-DD" in UTC
  input: number;
  output: number;
  cached: number;             // cache_read + cache_creation
};
```

One row per `(projectId, modelId, isSubagent, day)`.

**Aggregation logic** (new function `aggregateTokenUsage(root)`):

1. List `~/.claude/projects` directories. For each project:
   1. Read `*.jsonl` directly under it (main sessions). `isSubagent = false`.
   2. Read `<sessionId>/subagents/*.jsonl` recursively only one level. `isSubagent = true`.
2. For each file, read as UTF-8, split on `\n`, `JSON.parse` each line inside try/catch (skip bad lines — same pattern as `extractTitle`).
3. Keep only events with `type === 'assistant'`, `message.usage`, `message.model`, and a valid `timestamp`.
4. Sum into a `Map<string, TokenUsageRow>` keyed by `${projectId}|${modelId}|${isSub ? 1 : 0}|${day}`. `day = timestamp.slice(0, 10)`.
5. Collect distinct projectIds (including those with zero usage rows) for the `projects` field; `cwd` derived via the existing `decodeProjectId`.

No caching. If first-page latency becomes a problem we will add an mtime-keyed cache, but YAGNI for now.

### Client

New folder `src/tokens/`:

- `TokensPage.tsx` — page component. Owns local UI state: project filter (`'all' | projectId`), time-range preset, chart metric.
- `DailyUsageChart.tsx` — the d3 SVG chart.
- `OverallSpendList.tsx` — Section A: one row per `(modelId, isSubagent)`.
- `aggregate.ts` — pure functions (filtering, day densification, stacking input prep, per-model summary). Unit-tested in isolation from React.
- `palette.ts` — fixed TRON-flavored color list mapped onto model keys. Subagent variants use the same hue with reduced lightness.

API surface added to existing files:

- `src/api/client.ts` — `fetchTokenUsage(): Promise<TokenUsageResponse>`.
- `src/api/hooks.ts` — `useTokenUsage()` (TanStack Query, `staleTime: 60_000`, no polling).

### Routing

Hash-based, hand-rolled. Two routes only: `''` (default → main view) and `#/tokens` → tokens page.

New `src/util/useHashRoute.ts`:

```ts
export function useHashRoute(): 'main' | 'tokens' { /* listens to hashchange */ }
```

`App.tsx` reads the hash; if `'tokens'`, render `<TokensPage />` in the main content area instead of the current session/canvas content. The `<LibraryPanel>` stays mounted in both routes (the same chrome surrounds both views — only the centerpiece changes).

Navigation:
- A new `TOKENS` link in the LibraryPanel header (next to the existing collapse toggle) sets `location.hash = '#/tokens'`.
- The same link, when already on the tokens route, sets `location.hash = ''` (toggle behavior). Visual indicator (active style) on the link when on `#/tokens`.
- Browser back / forward works because `hashchange` is the source of truth.

## Page layout

The page mounts inside the same `contentFrame` as the main view, so it inherits the centered max-width and TRON shell.

### Top chrome (sticky inside the page)

```
┌───────────────────────────────────────────────────────────────┐
│ TOKEN USAGE      [ALL PROJECTS ▾]      [7D] [30D] [90D] [ALL] │
└───────────────────────────────────────────────────────────────┘
```

- Title `TOKEN USAGE` reuses `sessionTitle` style.
- Project select rendered as a native `<select>` with TRON-styled borders. Includes `ALL PROJECTS` then one option per project (label = decoded cwd via existing `formatPath`).
- Time-range preset buttons reuse `headerToolBtn` / `headerToolBtnOn` styles. `ALL` highlighted by default.

### Section A — Overall spend per model

A vertical list of rows inside a framed panel (same `canvasCard` border + clip-path, no breathing animation). One row per `(modelId, isSubagent)`, sorted by `total = input + output + cached` descending.

Per row:

```
claude-opus-4-7                          IN 1.2M · OUT 340k · CACHED 8.4M
[━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━]                                9.9M

claude-opus-4-7 · subagent               IN 80k · OUT 18k · CACHED 1.1M
[━━━━━━━━━━]                                                       1.2M
```

- Left: model label. Subagent variant appended as `· subagent` in dimmer text.
- Middle: a single horizontal bar split into three colored segments (input / output / cached). Bar widths are scaled across rows: the row with the largest `total` fills 100%; other rows scale proportionally.
- Right: grand total in accent color.

Section A scrolls vertically internally if there are many rows. Most users will have ≤ 5 rows.

### Section B — Daily usage chart

Framed panel below Section A. Header row inside the panel:

```
DAILY USAGE                              [TOTAL] [IN] [OUT] [CACHED]
```

- Metric switcher reuses preset button styles. `TOTAL` highlighted by default.
- Chart fills the remaining height.

Layout spacing: 8px gap between Sections A and B. Section A has fixed minimum height (~200px), Section B grows to fill.

## Chart rendering (d3 SVG)

`DailyUsageChart.tsx` mounts an SVG via `useRef` + `useEffect`. Same imperative-inside-effect pattern as `src/graph/layout.ts`.

### Data prep

Pure functions in `aggregate.ts`, memoized in the component:

1. `filterRows(rows, projectId, cutoffDay)` — apply project filter and time-range cutoff. `cutoffDay` is a `YYYY-MM-DD` string in UTC, derived from `presetCutoff(preset, today)` (see below). For preset `'all'`, cutoffDay is the earliest `day` present in the data.
2. `densifyDays(filtered, today, cutoffDay)` — return a continuous list of days (`YYYY-MM-DD` UTC strings) from `max(cutoffDay, earliestRowDay)` through `today`, even if intermediate days have no rows. Uniform x-axis spacing.
3. `presetCutoff(preset, today)` — `'7d' → today − 7 UTC days`, `'30d' → today − 30`, `'90d' → today − 90`, `'all' → '0000-01-01'`. `today` comes from `new Date().toISOString().slice(0, 10)`.
4. `modelKeysSorted(filtered)` — distinct `modelKey` (= `modelId` or `modelId|sub`), sorted by total tokens descending across the window. Largest model ends up at the bottom of the stack.
5. `stackData(filtered, days, modelKeys, metric)` — produce `{ day, values: Record<modelKey, number> }[]` where `values[modelKey]` is the metric-specific value (`total = input + output + cached`, or one of those three).

### d3 wiring

- `x = d3.scaleBand().domain(days).range([margin.left, width - margin.right]).padding(0.2)`.
- `y = d3.scaleLinear().domain([0, maxStackTotal]).nice().range([height - margin.bottom, margin.top])`.
- `color = d3.scaleOrdinal<string, string>().domain(modelKeys).range(palette(modelKeys))`. Palette: hand-picked TRON-flavored hues (cyan, magenta, amber, mint, violet, …); subagent variants get the same hue at reduced lightness.
- `stack = d3.stack<DayRow>().keys(modelKeys)` applied to densified rows.
- One `<g>` per series, each containing one `<rect>` per day. Positions/sizes from the stack output.
- X axis: `d3.axisBottom(x)` with thinned tick values (cap at ~8 ticks regardless of range — for 90D show roughly weekly ticks; for ALL show evenly-spaced milestone dates).
- Y axis: `d3.axisLeft(y).ticks(4).tickFormat(d => formatTokens(d as number))` (reusing the existing `formatTokens` helper).
- Grid lines: `d3.axisLeft(y).tickSize(-innerWidth)` styled subtly.
- No transitions in v1; rects redraw instantly on metric / filter changes.

### Tooltip

On `mouseenter` of each `<rect>`, set local React state `hover = { day, modelKey, value }`. Render a small absolutely-positioned `<div>` above the chart (not via d3) with `day`, `modelKey`, and `formatTokens(value)`.

### Legend

Rendered as a React row below the chart, one chip per `modelKey`. Each chip = 10px colored square + label. Clicking a chip toggles it off (visual: `opacity: 0.15` on the chip; semantic: that series is excluded from the stack and from the y-axis max calculation, so other series scale up). Toggle state lives in component-local React state.

### Resize

`ResizeObserver` on the container element triggers a redraw with the new width. Same pattern as `useCamera`.

### Empty state

If `filterRows(...)` returns no rows in the current window, render `"NO USAGE IN RANGE"` centered in the chart area instead of the SVG.

## Error handling & edge cases

- `~/.claude/projects` missing → server returns `{ projects: [], rows: [] }`; page shows `"NO SESSIONS FOUND"` centered.
- Bad JSONL lines → skipped silently per line (`JSON.parse` in try/catch).
- Assistant events missing `model` or `usage` → skipped.
- Empty session files → produce zero rows, no error.
- Subagent files for a deleted parent session → still counted under the project; no reconciliation attempted.
- Server fetch fails → TanStack Query exposes the error; page shows `"FAILED TO LOAD USAGE: <message>"` in the `--node-failed` color.
- Day with no rows in the middle of the range → dense-fill produces a zero-height slot; axis tick still drawn.
- Hundreds of projects in dropdown → native `<select>` scrolls; no virtual list.
- Hash route `#/tokens` typed before queries resolve → page shows its own loading state; doesn't block on the sessions query.

## Testing

### Unit

- `server/vite-plugin-sessions.test.ts`:
  - `aggregateTokenUsage` walks main + subagent JSONLs and sums correctly.
  - Groups by `(projectId, modelId, isSubagent, day)`.
  - `cached = cache_read + cache_creation`.
  - Skips events without `model` or `usage`.
  - Subagent rows have `isSubagent: true`.
  - Returns empty when `~/.claude/projects` is missing.

- `src/tokens/aggregate.test.ts`:
  - `filterRows` applies project + day filters correctly.
  - `densifyDays` returns a continuous range with no gaps.
  - `stackData` produces the per-day-per-modelKey shape the chart consumes (covering total / input / output / cached metrics).
  - `summariesPerModel` (Section A input): sorted desc by total, splits preserved.

- `src/tokens/DailyUsageChart.test.tsx` (light render test):
  - Mounts; renders the expected number of `<rect>` for a known input.
  - Renders `"NO USAGE IN RANGE"` for empty input.

### E2E

`tests/e2e/tokens-page.spec.ts` — one focused test:

1. Navigate to `/#/tokens`.
2. Assert `TOKEN USAGE` header is present.
3. Assert at least one model row in Section A (`data-testid="model-row-<modelKey>"`) with expected model id from the fixture.
4. Assert the chart SVG has the expected number of `<rect>` elements (= days × models present in fixture).
5. Click the `7D` preset button; assert the rect count drops to the expected smaller number.

Fixtures: new directory `tests/fixtures/claude-projects/C--demo-tokens/` with two main session JSONLs (different models, days spanning ~10 days) and one subagent JSONL. Reuses the existing `CLAUDE_HOME` override the playwright config already does for the other e2e tests.

Not tested: visual regression / screenshots, d3 axis tick layout, color palette assignments.

## File map

New files:

- `server/` — no new files; modify `vite-plugin-sessions.ts`.
- `src/tokens/TokensPage.tsx`
- `src/tokens/DailyUsageChart.tsx`
- `src/tokens/OverallSpendList.tsx`
- `src/tokens/aggregate.ts`
- `src/tokens/palette.ts`
- `src/tokens/aggregate.test.ts`
- `src/tokens/DailyUsageChart.test.tsx`
- `src/util/useHashRoute.ts`
- `tests/e2e/tokens-page.spec.ts`
- `tests/fixtures/claude-projects/C--demo-tokens/` (+ JSONL files)

Modified files:

- `server/vite-plugin-sessions.ts` — add `aggregateTokenUsage` and `/api/token-usage` middleware.
- `server/vite-plugin-sessions.test.ts` — add coverage for new function.
- `src/api/client.ts` — add `fetchTokenUsage`.
- `src/api/hooks.ts` — add `useTokenUsage`.
- `src/App.tsx` — wire `useHashRoute` and render `<TokensPage />` when route is `'tokens'`. Add `TOKENS` link in sidebar chrome.

## Open questions

None at this time.