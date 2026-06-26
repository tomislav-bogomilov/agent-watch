# USAGE / SPEND / MEMORY / Replay Fixes — Design

**Date:** 2026-06-26
**Status:** Approved (brainstorm 2026-06-26)
**Branch:** `feature/usage-memory-replay-fixes` (to be created off `main`)

## Summary

A batch of five self-contained UI fixes across the USAGE (TOKENS/SPEND),
MEMORY, and session-replay surfaces:

1. **TOKENS — TOTAL stacks by token type.** TOTAL and CACHED render
   near-identically because cache-read tokens dominate volume. Make the TOTAL
   metric stack by *token type* (Input · Output · Cache Read · Cache Write) so
   composition is visible and TOTAL is clearly distinct from CACHED.
2. **USAGE + SPEND bars — "Hologram Glass" visual.** Replace the current flat /
   isometric bars in `DailyUsageChart` and `SpendBars` with translucent glowing
   glass prisms.
3. **SPEND matrix — "Glass Mini-Bars".** Each model×month cell shows its `$`
   figure plus a small horizontal glass bar (length ∝ spend), replacing the
   flat background-alpha heatmap.
4. **Default tabs.** SPEND defaults to **MATRIX**; MEMORY defaults to **GRAPH**.
5. **Replay bottom bar.** Drop restart / next-failure / next-tool-call; add a
   speed stepper (`− [2×] +`) defaulting to a quicker **2×**.

No API, data-model, or new-dependency work. All changes are frontend-only and
confined to existing modules.

## Core principles

- **Truthful, not just cosmetic.** The TOTAL/CACHED issue is not a bug — the math
  is correct. The fix changes what TOTAL *shows* (composition by token type) so
  the chart is genuinely informative, rather than faking a difference.
- **Reuse the rendering stack.** Keep d3 scales, axes, hover, and legend
  machinery in the token charts; only the mark-drawing changes. Keep the
  HTML-table structure of the matrix; only the cell contents change.
- **One glass language, shared.** The glass gradients + glow filters live in a
  single shared SVG-defs helper so both bar charts look identical and IDs never
  collide.
- **Preserve test hooks.** Keep `data-role="bar"` / `data-role="spend-bar"` and
  existing `data-testid`s wherever possible so the change is mostly additive to
  the test suite.
- **Verify against real data.** Per project practice, run the real app and
  confirm the new TOTAL-by-type stack, glass charts, matrix mini-bars, default
  tabs, and speed control before calling it done — a green stubbed suite proves
  wiring, not look.

---

## 1. TOKENS — TOTAL stacks by token type

**Files:** `src/tokens/aggregate.ts`, `src/tokens/DailyUsageChart.tsx`,
`src/tokens/palette.ts` (token-type colors).

**Today:** `DailyUsageChart` stacks by *model* for every metric. `metricValue`
returns `input` / `output` / `cachedOf(r)` / `input+output+cachedOf(r)`. Because
cache reads dwarf input+output, the TOTAL and CACHED stacks look the same.

**Change:** Introduce a per-metric **stack dimension**:

- **`metric === 'total'` → stack by token type.** Four series:
  `Input`, `Output`, `Cache Read`, `Cache Write` (cacheWrite5m + cacheWrite1h
  combined). Per-day values summed across all models in the current
  family/project/date filter.
- **`metric === 'input' | 'output' | 'cached'` → stack by model** (unchanged).

**Aggregation:** add a helper in `aggregate.ts`, e.g.
`stackDataByType(rows, days): DayRow[]` producing per-day values keyed by the
four fixed token-type keys (`input`, `output`, `cacheRead`, `cacheWrite`). The
existing `stackData` (by model) stays for the other metrics.

**Legend / tooltip / toggles:** In TOTAL mode the legend lists the four token
types (fixed order, fixed colors) and toggles hide/show a type; in the other
modes the legend lists models as today. The `disabled` set is keyed by whichever
dimension is active. Tooltip shows the token-type name + value in TOTAL mode.

**Colors:** a small fixed token-type palette in the cyan/aqua family (e.g.
Input = bright cyan, Output = aqua, Cache Read = dim teal, Cache Write = violet-
cyan) added to `palette.ts`. Distinct from `colorFor(model)`.

**Note:** This makes TOTAL stack-by-type while other metrics stack-by-model — an
intentional asymmetry, because only TOTAL spans multiple token types.

## 2. USAGE + SPEND bars — Hologram Glass

**Files:** `src/tokens/DailyUsageChart.tsx`, `src/tokens/SpendBars.tsx`, new
`src/tokens/glassDefs.ts`.

**Glass mark (per stacked segment):**
- Translucent vertical gradient fill (aqua at top → cyan → near-transparent at
  bottom), rounded corners.
- Soft outer **bloom** (a blurred copy behind, `softglow` filter).
- Glowing aqua stroke (`glow` filter) on the segment outline.
- Bright **cap** ellipse on the topmost segment of each bar.
- Thin inner highlight stripe; faint floor reflection + a glow baseline.
- Optional faint horizontal scanlines across the plot area.

**Shared defs:** `glassDefs.ts` exports a function that appends the gradients
(`gGlass`, `gRefl`, side gradient) and filters (`glow`, `softglow`) into a given
SVG, **prefixing all ids per chart instance** (e.g. `daily-`, `spend-`) so two
charts on screen never collide on `url(#id)` references. Returns the resolved id
map for the caller to reference.

**Integration:** keep d3 band/linear scales, axes, grid, hover handlers, and the
legend. Only the per-bar drawing passes are replaced. Keep
`data-role="bar"` / `data-role="spend-bar"`, `data-key`, `data-day` attributes on
the primary (front-face) rect for test compatibility.

## 3. SPEND matrix — Glass Mini-Bars (M3)

**File:** `src/tokens/SpendMatrix.tsx`.

**Today:** each cell is a `<td>` whose background alpha encodes `cell.total`.

**Change:** each cell renders the `$` figure **and** a small horizontal glass bar
(a positioned `<div>`/`<span>` with the glass gradient + glow), width =
`cell.total / maxCell`. Hottest cells (high ratio) get a brighter bloom. Empty
cells stay `—`. The pin-on-click breakdown row, headers, Σ row/column, and the
four summary cards are unchanged.

CSS-only glass (no SVG needed inside the table): a linear-gradient background +
`box-shadow` glow on the inner bar element.

## 4. Default tabs

- **`src/tokens/TokensPage.tsx`:** `spendMode` initial state `'bars' → 'matrix'`.
  (USAGE still opens on the TOKENS view; only the SPEND sub-view default moves.)
- **`src/memory/MemoryPage.tsx`:** `view` initial state `'detail' → 'graph'`.

## 5. Replay bottom bar

**Files:** `src/components/PlaybackControls.tsx`, `src/playback/usePlayback.ts`.

**Remove** three buttons: `restart` (↺), `jump-fail` (⊘ next failure),
`jump-tool` (⚙ next tool call). `nextIndexMatching` stays (still used by
`jump-subagent`); `controls.restart` stays on the hook (no longer surfaced in
this bar).

**Keep:** ‹ step-back · play/pause · step-forward › · scrubber ·
next-subagent (⌥) · end (■).

**Add speed stepper** rendered as `−  [2×]  +`:
- `−` / `+` move along an ordered ladder and **clamp** at the ends (no wrap).
- Current speed shown as `Nx` (e.g. `2×`).
- Wired to `controls.setSpeed`.

**`usePlayback.ts`:**
- Default `speed` state `0.1 → 2`.
- Export an ordered `SPEED_STEPS: Speed[] = [0.1, 0.25, 0.5, 1, 2, 4]` and a
  helper to get the clamped neighbor (`stepSpeed(current, +1|-1)`) used by the
  −/+ buttons. `Speed` type is unchanged (0.1 stays reachable as the floor).

## Testing & cleanup

**Unit:**
- `PlaybackControls.test.tsx` — assert restart/jump-fail/jump-tool are gone,
  speed stepper present, `−`/`+` step + clamp, default label `2×`.
- `usePlayback` — default speed is `2`; `stepSpeed` clamps at both ends.
- `TokensPage.view.test.tsx` — SPEND defaults to MATRIX.
- `MemoryPage` test — defaults to GRAPH.
- `DailyUsageChart.test.tsx` — TOTAL stacks four token-type series (token-type
  legend); other metrics still stack by model; glass marks render.
- `SpendMatrix.test.tsx` — cells render a mini-bar element scaled to value;
  numbers + pin behavior intact.
- `SpendBars.test.tsx` — glass marks render; `data-role="spend-bar"` retained.

**E2E:** retarget any specs referencing restart / next-failure / next-tool-call;
add/adjust a spec for the speed stepper and the new default tabs.

**Manual:** run the app and verify TOTAL-by-type vs CACHED look distinct, the
glass bars + matrix mini-bars render correctly, SPEND opens on MATRIX, MEMORY
opens on GRAPH, and the speed stepper plays at 2× by default and adjusts.

## Out of scope

- Changing the TOTAL/CACHED *math* (it is correct).
- Making USAGE open directly on the SPEND view.
- Reworking the per-model OverallSpendList, summary cards, or pricing.
- Persisting the chosen playback speed across sessions.

## Post-review adjustments (2026-06-26, after implementation)

Two default values were changed at the user's request after the branch was built
(supersede the values written above):

- **Default play speed is `0.3×`, not `2×`.** The speed ladder replaces `0.25`
  with `0.3` → `[0.1, 0.3, 0.5, 1, 2, 4]`, and `usePlayback` defaults to `0.3`.
  (The `playback.spec.ts` speed-pin added during Task 11 was reverted, since the
  slower default already gives the spec its timing headroom.)
- **Default USAGE timeframe is `7D`, not `30D`.** `App.tsx` `readPreset()` falls
  back to `'7d'` (still persisted per-user in `localStorage`).