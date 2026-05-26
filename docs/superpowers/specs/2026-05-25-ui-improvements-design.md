# UI improvements — scrollbar, Usage dropdown, transitioned trail

**Date:** 2026-05-25
**Branch:** `feat/ui-improvements-scrollbar-usage-trail`
**Status:** Spec for implementation

## Problem

Four UI rough edges hurt the daily-use feel of the app:

1. The left-panel list scrollbar is the OS default — out of place against the rest of the TRON treatment.
2. The Tokens page is reached through a separate `TOKENS` button next to the library dropdown. The button is visually awkward, and there is no per-model drill-down from the page.
3. The Tokens page defaults to the `ALL` time range, which makes the chart look noisy and unhelpful on first open.
4. In playback and live modes, visited nodes ("transitioned" state — already been highlighted but no longer current) for `tool_call` (Glob, Grep, Read, Edit, Write, generic) and `assistant_turn` ("Decided") fade into the background because their success-state styling pairs a very dark kind-tinted fill with mint stroke and mint text. The shapes are unreadable at small zoom levels even though the playhead is moving past them. Failed-tool nodes (red stroke + corner dot) and root prompts (distinctive chevron) read fine; the rest do not.

The goal is to restore visual hierarchy along the trail without changing milestone shapes or the active-node styling.

## Scope

In scope:

- New CSS for the left-panel inner scroll container in `LibraryPanel.tsx`.
- Adding a `usage` mode to `LibraryMode`, replacing the standalone `TOKENS` button.
- New `UsageCardsList` component rendered in the left panel when `mode === 'usage'`.
- Filtering pipeline in `TokensPage.tsx` extended with a family filter (`'all' | 'opus' | 'sonnet' | 'haiku'`).
- Default `RangePreset` flips from `'all'` to `'30d'`, persisted.
- `NodeShape.tsx` `success`-state colors and shimmer.
- `EdgePath.tsx` "done" trail colors and opacity floor.

Out of scope:

- Resize handle restyle.
- Scrollbars elsewhere in the app (Tokens panels, detail panel) — keep current defaults; this spec is left-panel only.
- Restyling the `active` node (current playhead). With the trail lifted, today's bright cyan fill remains the highest-contrast element in the chain; if it still feels weak after this change, address in a follow-up.
- Restyling `pruned`, `failed`, `idle`, `drawing` states.
- New backend / API endpoints. All filtering happens client-side against existing `useTokenUsage` data.

## Architecture

Four independent component changes, no shared state beyond existing localStorage keys.

```
LibraryPanel
├── <select> mode dropdown      (+ 'usage' option)
├── filter input                 (hidden in usage mode)
├── scroll container             (new TRON scrollbar styling)
└── content
    ├── SessionsList     when mode === 'sessions'
    ├── PromptsList      when mode === 'prompts'
    └── UsageCardsList   when mode === 'usage'   (NEW)
        ├── card 'ALL'
        ├── card 'OPUS'   (if any opus rows in data)
        ├── card 'SONNET'
        └── card 'HAIKU'

App
└── routing: hashes other than '#/tokens' → graph; '#/tokens' → one-shot
    redirect that sets library mode to 'usage' and clears the hash.

TokensPage
├── reads selected family from localStorage 'tg.usage.family'
├── chrome row: project select, preset chips (default '30d')
├── OverallSpendList: filtered rows
└── DailyUsageChart: filtered rows
    where filtering = projectFilter ∧ familyFilter ∧ presetCutoff

NodeShape  — success colorsFor() returns lifted-luminance fills and --text
EdgePath   — done-state stroke = mint except recent-inbound (freshness >= 0.95)
```

No new API surface. No data model changes.

## Detailed design

### 1. Left-panel scrollbar (variant A1: glass cylinder, 6px)

**Where:** `src/components/library/LibraryPanel.tsx` — the inner `<div style={styles.scroll}>`. Today it is styled inline; this change moves the scroll-rule onto a stable class name and adds rules in `src/index.css` (or a new `library-panel.css`, author's call) keyed to that class.

**New CSS class:** `.tg-library-scroll` applied to the scroll container.

**Webkit / Chromium / Edge rules:**

```css
.tg-library-scroll::-webkit-scrollbar {
  width: 6px;
}
.tg-library-scroll::-webkit-scrollbar-track {
  background: linear-gradient(
    90deg,
    var(--tg-rail-bg-edge),
    var(--tg-rail-bg-mid) 50%,
    var(--tg-rail-bg-edge)
  );
  box-shadow:
    inset 1px 0 2px rgba(0, 0, 0, 0.9),
    inset -1px 0 2px rgba(0, 0, 0, 0.9);
}
.tg-library-scroll::-webkit-scrollbar-thumb {
  background: linear-gradient(
    90deg,
    var(--tg-rail-thumb-dark) 0%,
    #00b3c8 35%,
    var(--tg-rail-thumb-bright) 50%,
    #00b3c8 65%,
    var(--tg-rail-thumb-dark) 100%
  );
  border-top: 1px solid rgba(180, 250, 255, 0.6);
  border-bottom: 1px solid rgba(0, 40, 50, 0.9);
  box-shadow:
    0 0 6px rgba(0, 229, 255, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
.tg-library-scroll::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(
    90deg,
    #004c5c 0%,
    #00d6ee 35%,
    #b8faff 50%,
    #00d6ee 65%,
    #004c5c 100%
  );
  box-shadow:
    0 0 10px rgba(0, 229, 255, 0.85),
    inset 0 1px 0 rgba(255, 255, 255, 0.45);
}
```

**Firefox fallback:**

```css
.tg-library-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--tg-rail-thumb-bright) transparent;
}
```

**New tokens in `src/theme/tokens.css`:**

```css
--tg-rail-bg-edge: rgba(0, 229, 255, 0.18);
--tg-rail-bg-mid: rgba(0, 229, 255, 0.02);
--tg-rail-thumb-dark: #003844;
--tg-rail-thumb-bright: #5cf2ff;
```

### 2. Library dropdown — add Usage as third option

**Type change in `LibraryPanel.tsx`:**

```ts
export type LibraryMode = 'sessions' | 'prompts' | 'usage';
```

`readMode()` is extended to recognize `'usage'`. Default remains `'sessions'`.

**Dropdown markup adds:** `<option value="usage">USAGE</option>` after Prompts.

**Removed:** the entire `<button data-testid="tokens-link" …>TOKENS</button>` block and its `styles.tokensLink` / `styles.tokensLinkOn` entries.

**Filter input visibility:** when `mode === 'usage'`, the filter `<input>` is not rendered (the cards have no need for free-text filtering).

**Content branch:** when `mode === 'usage'`, render `<UsageCardsList />` instead of the per-project `groups.map(...)` block.

### 3. App routing — drop the `#/tokens` route, drive page from library mode

**Files:** `src/App.tsx`, `src/components/library/LibraryPanel.tsx`, `src/util/useHashRoute.ts` (delete).

Today `useHashRoute()` returns `'tokens'` when the hash is `#/tokens` and `App.tsx` switches on that to render `<TokensPage />`. After this change, the page rendered in the main pane is driven by the library mode, not by the URL.

**Lift `LibraryMode` state into `App.tsx`.** Today `LibraryPanel` owns `mode` as internal state and reads/writes `tg.library.mode` itself. Change `LibraryPanel` to be fully controlled — receive `mode: LibraryMode` and `onModeChange: (m: LibraryMode) => void` as props. The localStorage persistence moves to `App.tsx` where the state lives.

**App.tsx initial mode:**

```ts
const [mode, setMode] = useState<LibraryMode>(() => {
  // One-shot back-compat shim: an old #/tokens bookmark forces usage mode.
  if (typeof window !== 'undefined' && window.location.hash === '#/tokens') {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return 'usage';
  }
  return readMode();          // existing localStorage read, now in App
});
useEffect(() => { writeJson('tg.library.mode', mode); }, [mode]);
```

**Render switch in App.tsx:** replace `{route === 'tokens' ? <TokensPage /> : (<>…</>)}` with `{mode === 'usage' ? <TokensPage /> : (<>…</>)}`.

**`useHashRoute` becomes unused.** Grep confirms only `App.tsx` consumes it; delete `src/util/useHashRoute.ts` and its tests in the same change.

Existing e2e tests that navigate via `#/tokens` are updated to drive the dropdown (`page.selectOption('[data-testid=library-mode]', 'usage')`).

### 4. UsageCardsList component (variant C: total + share-of-spend bar)

**Location:** `src/components/library/UsageCardsList.tsx` (new file).

**Props:**

```ts
type Props = {
  rows: TokenUsageRow[];          // already-fetched usage rows
  projectId: string | 'all';      // current project filter
  cutoffDay: string;              // already computed by presetCutoff()
  selected: Family;
  onSelect: (f: Family) => void;
};
export type Family = 'all' | 'opus' | 'sonnet' | 'haiku';
```

**Card content:**

```
┌─────────────────────────────┐
│ OPUS                        │   ← name, letter-spacing 3, cyan
│ 4.7 · 4.6                   │   ← sub: versions present, desc
│ 71.2M                       │   ← formatTokens(family total)
│ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░  │   ← bar: share of grand total
└─────────────────────────────┘
```

- Family list is fixed: `['all', 'opus', 'sonnet', 'haiku']` in that order.
- A family card with zero matching rows still renders, sub-line `(no data)`, total `0`, bar at 0%, opacity 0.55.
- `ALL` card sub-line is the literal `ALL MODELS`; its bar is always 100%.
- Versions on the sub-line are extracted from `modelId` via the same regex `modelLabel.ts` uses, sorted descending.

**Family detection helper (new in `src/tokens/family.ts`):**

```ts
export type Family = 'all' | 'opus' | 'sonnet' | 'haiku';

export function familyOf(modelId: string): Exclude<Family, 'all'> | null {
  const m = modelId.match(/^claude-(opus|sonnet|haiku)-/i);
  return m ? (m[1].toLowerCase() as Exclude<Family, 'all'>) : null;
}
```

**Styling:** matches mockup variant C — dark panel background, cyan border, hot border on selected. Bar uses `var(--edge-trail)` with a 6px box-shadow glow.

**Persistence:** the selected family is stored in `localStorage` key `tg.usage.family` (string), restored on mount.

**Ownership:** `family` lives in `App.tsx` alongside `mode`, so it can be passed both to `LibraryPanel` (→ `UsageCardsList`) and to `TokensPage`. App writes `tg.usage.family` whenever it changes; `UsageCardsList` is fully controlled.

### 5. TokensPage filtering

**File:** `src/tokens/TokensPage.tsx`.

**Props additions:** `family: Family` (passed down from App). Internal `useState<Family>` is **not** introduced here — see §4 "Ownership."

**Default preset:** `useState<RangePreset>('30d')`, persisted to `tg.usage.preset` and restored on mount.

**Filter row construction:**

```ts
const filtered = useMemo(() => {
  const cutoff = presetCutoff(preset, today);
  return filterRows(query.data?.rows ?? [], projectId, cutoff)
    .filter((r) => family === 'all' ? true : familyOf(r.modelId) === family);
}, [query.data, projectId, preset, family, today]);
```

Both `summariesPerModel(filtered)` (top spend list) and the chart receive the same `filtered` array. The chart already stacks per `modelKey(modelId, isSubagent)`, so Opus selected → 4 stacks (4.6 main, 4.6 sub, 4.7 main, 4.7 sub) automatically.

**Preset chip order:** `['7d', '30d', '90d', 'all']` — unchanged.

**Page chrome unchanged.** The page keeps its existing chrome row (title, project select, preset chips, metric chips). The card-driven family filter lives in the left panel and is consumed via the new state described above.

### 6. NodeShape — success state colors

**File:** `src/components/NodeShape.tsx`.

**Per-kind `tint.fill` for success state only** (idle still uses today's deep tint). Easiest implementation: extend `tintFor` to return `{ fill, accent, successFill }`, where `successFill` is the lifted value. Or introduce a parallel `successTintFor` — author's choice.

| Kind | idle fill (today) | success fill (new) |
|---|---|---|
| `root_prompt` / `user_followup` | `#0a2230` | `#1a4254` |
| `tool_call` | `#0f2e2a` | `#1c4a40` |
| `subagent_spawn` | `#1a1230` | `#2c1f4a` |
| `completion` | `#0d2a16` | `#194028` |
| `assistant_turn` | `#0f2632` | `#1a3d54` |

**`colorsFor` `success` case:**

```ts
case 'success':
  return {
    fill: successTintFor(kind),
    stroke: inSubagent ? 'var(--subagent-accent)' : 'var(--node-success)',
    text: 'var(--text)',     // was: 'var(--node-success)'
  };
```

**Stroke width on success path:** drop from 1.75 to 1.5 (in the `<path … strokeWidth={…}>` ternary).

**Shimmer:** remove the inline `style={state === 'success' ? { animation: 'tg-shimmer …' } : undefined}` — success nodes no longer pulse. `active` and `failed` animations are unchanged. The `@keyframes tg-shimmer` rule remains in CSS in case it's used elsewhere; if grep confirms no other consumer, delete it in this change.

**Context badge:** no code change required. The badge already reads `colors.stroke` for its border and text; once `success` returns mint stroke, the badge automatically picks it up. Geometry (`32×12`, `rx=2`, `x=W-28`, `y=-8`) is unchanged. Verify in the unit test for `NodeShape`.

### 7. EdgePath — done trail color

**File:** `src/components/EdgePath.tsx`.

**Stroke color for `state === 'done'`:**

```ts
const stroke = inSubagent
  ? 'var(--subagent-accent)'
  : isRecentDone
    ? 'var(--edge-trail)'      // recent inbound stays cyan (today's behavior)
    : 'var(--node-success)';   // older trail goes mint
```

`drawing`, `idle`, and `pruned` keep cyan.

**Tail opacity floor lifted:**

```ts
const doneOpacity = isRecentDone
  ? 0.92
  : Math.max(0.40, 0.25 + 0.55 * freshness);   // was: Math.max(0.18, 0.1 + 0.25 * freshness)
```

**Glow filter for done-tail mint edges:** update the conditional so non-recent done edges use a mint-tinted drop-shadow:

```ts
const glowFilter =
  state === 'drawing' ? `drop-shadow(0 0 6px var(--edge-trail))` :
  state === 'done' && isRecentDone ? `drop-shadow(0 0 4px var(--edge-trail))` :
  state === 'done' ? `drop-shadow(0 0 3px var(--node-success))` :
  state === 'idle' ? `drop-shadow(0 0 1.5px var(--edge-trail))` :
  `drop-shadow(0 0 1px rgba(255,255,255,0.08))`;
```

Stroke widths and dasharrays unchanged.

## Testing

- **Scrollbar:** smoke test that `.tg-library-scroll` class is applied; no visual regression test needed (CSS only). Manual check across Chromium and Firefox.
- **Library dropdown:** unit test that selecting `usage` from the dropdown hides the filter input and renders `UsageCardsList`. Existing tests for `sessions` and `prompts` remain green.
- **Routing back-compat:** unit test for the one-shot hash redirect — given `window.location.hash === '#/tokens'` on first render, library mode becomes `'usage'` and the hash is cleared.
- **UsageCardsList:** unit tests covering (a) zero-row family renders dimmed, (b) ALL bar always 100%, (c) versions displayed descending, (d) clicking a card writes `tg.usage.family` and calls `onSelect`.
- **`familyOf`:** unit tests for opus/sonnet/haiku detection and non-matching ids returning `null`.
- **TokensPage filtering:** unit test that with `family === 'opus'`, `summariesPerModel` and chart input both exclude non-opus rows. Existing e2e for `7D / 30D / 90D / ALL` presets becomes parametric over the new default of `30D`.
- **NodeShape success styling:** unit test that `colorsFor('success', false, 'tool_call')` returns the new `#1c4a40` fill and `var(--text)` text. Snapshot test for the rendered SVG path under success state — confirm context badge stroke matches new success stroke color.
- **EdgePath done trail:** unit test that a done edge with `freshness < 0.95` uses `var(--node-success)` stroke, and that opacity bottoms at 0.40 not 0.18.

## Open questions

None — answered during brainstorming. Recorded resolutions:

- Family card filters both list and chart (not list only or chart only).
- Chart stacks: full `modelKey` breakdown × main/subagent when a family is selected.
- `#/tokens` route is dropped, with a one-shot redirect for back-compat.
- Preset list stays `7D · 30D · 90D · ALL`; default flips to `30D`.
- Project filter remains on the Usage page and stacks orthogonally with the family filter.
- Scrollbar variant: A1 (glass-cylinder, 6px, soft glow).
- Active node styling is NOT restyled in this pass.