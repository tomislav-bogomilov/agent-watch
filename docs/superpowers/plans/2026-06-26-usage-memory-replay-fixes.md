# USAGE / SPEND / MEMORY / Replay Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five self-contained frontend fixes — TOTAL-by-token-type stacking, Hologram-Glass bar charts, a glass mini-bar spend matrix, MATRIX/GRAPH default tabs, and a replay speed stepper (default 2×) replacing restart/next-failure/next-tool-call.

**Architecture:** All changes are React + d3 (SVG) frontend edits in `src/tokens`, `src/memory`, `src/components`, and `src/playback`. A new shared `src/tokens/glass.ts` helper supplies the glass SVG `<defs>` and a `drawGlassBar` routine used by both bar charts so the look is identical and SVG ids never collide. Token-type stacking adds one pure aggregation helper; everything else is local component state and render changes.

**Tech Stack:** TypeScript, React 18, d3, Vitest + @testing-library/react (unit), Playwright (e2e). Spec: `docs/superpowers/specs/2026-06-26-usage-memory-replay-fixes-design.md`.

## Global Constraints

- Frontend-only. No API, server, data-model, or new-dependency changes.
- Preserve existing test hooks: keep `data-role="bar"` (daily chart) and `data-role="spend-bar"` (spend bars) on the interactive front rect; keep all existing `data-testid`s on cells/cards.
- Palette: cyan `#00E5FF`, aqua `#7FFFD4`; token-type colors Input `#00E5FF`, Output `#7FFFD4`, Cache Read `#B47FF6`, Cache Write `#FF7A1A`.
- Shared glass `<defs>` ids MUST be prefixed per chart instance (`daily-`, `spend-`) so two charts on one page don't collide on `url(#id)`.
- TDD: write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- Branch: `feature/usage-memory-replay-fixes` (already created off `main`, spec committed at `136c154`).
- Run a single test file with `npx vitest run <path>`; full suite `npm run test`; typecheck `npm run typecheck`.

## File Structure

- `src/tokens/tokenType.ts` — **new.** Token-type keys, labels, colors (Input/Output/Cache Read/Cache Write).
- `src/tokens/aggregate.ts` — **modify.** Add `stackDataByType(rows, days)`.
- `src/tokens/glass.ts` — **new.** `appendGlassDefs(svg, prefix)` + `drawGlassBar(g, opts)` shared by both bar charts.
- `src/tokens/DailyUsageChart.tsx` — **modify.** TOTAL stacks by token type; glass bars.
- `src/tokens/SpendBars.tsx` — **modify.** Glass bars.
- `src/tokens/SpendMatrix.tsx` — **modify.** Glass mini-bars in cells.
- `src/tokens/TokensPage.tsx` — **modify.** `spendMode` defaults to `'matrix'`.
- `src/memory/MemoryPage.tsx` — **modify.** `view` defaults to `'graph'`.
- `src/playback/usePlayback.ts` — **modify.** Default speed `2`; export `SPEED_STEPS` + `stepSpeed`.
- `src/components/PlaybackControls.tsx` — **modify.** Drop restart/jump-fail/jump-tool; add speed stepper.
- Tests: `tests/unit/tokens/stackByType.test.ts` (new), `tests/unit/tokens/glass.test.ts` (new), `tests/unit/tokens/DailyUsageChart.test.tsx`, `tests/unit/tokens/SpendBars.test.tsx`, `tests/unit/tokens/SpendMatrix.test.tsx`, `tests/unit/tokens/TokensPage.view.test.tsx`, `tests/unit/memory/MemoryPage.default.test.tsx` (new), `tests/unit/playback-step.test.ts`, `tests/unit/components/PlaybackControls.test.tsx` (new), e2e `tests/e2e/spend-view.spec.ts`, `tests/e2e/memory-page.spec.ts`.

---

### Task 1: Token-type aggregation + constants

**Files:**
- Create: `src/tokens/tokenType.ts`
- Modify: `src/tokens/aggregate.ts` (add export after `stackData`, ~line 86)
- Test: `tests/unit/tokens/stackByType.test.ts`

**Interfaces:**
- Produces: `TOKEN_TYPE_KEYS: readonly ['input','output','cacheRead','cacheWrite']`, `tokenTypeLabel(k: string): string`, `tokenTypeColor(k: string): string` (from `tokenType.ts`); `stackDataByType(rows: TokenUsageRow[], days: string[]): DayRow[]` (from `aggregate.ts`, reuses existing `DayRow`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/tokens/stackByType.test.ts
import { describe, it, expect } from 'vitest';
import { stackDataByType } from '../../../src/tokens/aggregate';
import { TOKEN_TYPE_KEYS, tokenTypeLabel, tokenTypeColor } from '../../../src/tokens/tokenType';
import type { TokenUsageRow } from '../../../src/api/client';

function row(over: Partial<TokenUsageRow>): TokenUsageRow {
  return { projectId: 'P', modelId: 'opus', isSubagent: false, day: '2026-06-01',
    input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, ...over };
}

describe('stackDataByType', () => {
  it('sums each token type per day, folding cacheWrite5m+1h into cacheWrite', () => {
    const rows = [
      row({ day: '2026-06-01', input: 10, output: 5, cacheRead: 100, cacheWrite5m: 2, cacheWrite1h: 3 }),
      row({ day: '2026-06-01', input: 1, modelId: 'sonnet' }),
    ];
    const out = stackDataByType(rows, ['2026-06-01', '2026-06-02']);
    expect(out.map((d) => d.day)).toEqual(['2026-06-01', '2026-06-02']);
    expect(out[0].values).toEqual({ input: 11, output: 5, cacheRead: 100, cacheWrite: 5 });
    expect(out[1].values).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  it('exposes the four token-type keys with labels and colors', () => {
    expect([...TOKEN_TYPE_KEYS]).toEqual(['input', 'output', 'cacheRead', 'cacheWrite']);
    expect(tokenTypeLabel('cacheRead')).toBe('Cache Read');
    expect(tokenTypeColor('input')).toBe('#00E5FF');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tokens/stackByType.test.ts`
Expected: FAIL — `stackDataByType` / `tokenType` module not found.

- [ ] **Step 3: Create `src/tokens/tokenType.ts`**

```ts
// src/tokens/tokenType.ts
export const TOKEN_TYPE_KEYS = ['input', 'output', 'cacheRead', 'cacheWrite'] as const;
export type TokenType = (typeof TOKEN_TYPE_KEYS)[number];

export const TOKEN_TYPE_LABELS: Record<TokenType, string> = {
  input: 'Input',
  output: 'Output',
  cacheRead: 'Cache Read',
  cacheWrite: 'Cache Write',
};

export const TOKEN_TYPE_COLORS: Record<TokenType, string> = {
  input: '#00E5FF',
  output: '#7FFFD4',
  cacheRead: '#B47FF6',
  cacheWrite: '#FF7A1A',
};

export function tokenTypeLabel(k: string): string {
  return TOKEN_TYPE_LABELS[k as TokenType] ?? k;
}

export function tokenTypeColor(k: string): string {
  return TOKEN_TYPE_COLORS[k as TokenType] ?? '#9CA3AF';
}
```

- [ ] **Step 4: Add `stackDataByType` to `src/tokens/aggregate.ts`**

Insert after the existing `stackData` function (after line 86):

```ts
// Per-day stack keyed by the four fixed token types (cacheWrite folds 5m+1h).
// Used by the daily chart's TOTAL view so the stack shows token composition
// instead of per-model bars (which look identical to CACHED — cache reads
// dominate volume).
export function stackDataByType(rows: TokenUsageRow[], days: string[]): DayRow[] {
  const dayMap = new Map<string, DayRow>();
  for (const d of days) {
    dayMap.set(d, { day: d, values: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } });
  }
  for (const r of rows) {
    const slot = dayMap.get(r.day);
    if (!slot) continue;
    slot.values.input += r.input;
    slot.values.output += r.output;
    slot.values.cacheRead += r.cacheRead;
    slot.values.cacheWrite += r.cacheWrite5m + r.cacheWrite1h;
  }
  return days.map((d) => dayMap.get(d)!);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/tokens/stackByType.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/tokens/tokenType.ts src/tokens/aggregate.ts tests/unit/tokens/stackByType.test.ts
git commit -m "feat(tokens): add token-type stacking helper + constants"
```

---

### Task 2: DailyUsageChart — TOTAL stacks by token type

**Files:**
- Modify: `src/tokens/DailyUsageChart.tsx`
- Test: `tests/unit/tokens/DailyUsageChart.test.tsx`

**Interfaces:**
- Consumes: `stackDataByType`, `TOKEN_TYPE_KEYS`, `tokenTypeColor`, `tokenTypeLabel` from Task 1.
- Behavior: when `metric === 'total'` the chart stacks by token type (4 series, fixed colors/labels, legend toggles a type); for `input`/`output`/`cached` it stacks by model exactly as today.

- [ ] **Step 1: Update the failing test**

Replace the body of `tests/unit/tokens/DailyUsageChart.test.tsx` with:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DailyUsageChart } from '../../../src/tokens/DailyUsageChart';
import type { TokenUsageRow } from '../../../src/api/client';

const rows: TokenUsageRow[] = [
  { projectId: 'p1', modelId: 'opus', isSubagent: false, day: '2026-05-20', input: 100, output: 50, cacheRead: 200, cacheWrite5m: 0, cacheWrite1h: 0 },
  { projectId: 'p1', modelId: 'opus', isSubagent: false, day: '2026-05-22', input: 10, output: 5, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
  { projectId: 'p1', modelId: 'sonnet', isSubagent: false, day: '2026-05-21', input: 7, output: 3, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
];

function chart(metric: 'total' | 'input') {
  return (
    <DailyUsageChart rows={rows} projectId="all" preset="all" today="2026-05-22" metric={metric} family="all" />
  );
}

describe('DailyUsageChart', () => {
  it('TOTAL stacks by token type: 3 days x 4 types = 12 bars + token-type legend', () => {
    render(chart('total'));
    expect(document.querySelectorAll('svg [data-role="bar"]').length).toBe(12);
    expect(screen.getByTestId('legend-chip-input')).toBeTruthy();
    expect(screen.getByTestId('legend-chip-output')).toBeTruthy();
    expect(screen.getByTestId('legend-chip-cacheRead')).toBeTruthy();
    expect(screen.getByTestId('legend-chip-cacheWrite')).toBeTruthy();
  });

  it('non-total metrics still stack by model: 3 days x 2 models = 6 bars', () => {
    render(chart('input'));
    expect(document.querySelectorAll('svg [data-role="bar"]').length).toBe(6);
    expect(screen.getByTestId('legend-chip-opus')).toBeTruthy();
    expect(screen.getByTestId('legend-chip-sonnet')).toBeTruthy();
  });

  it('renders "NO USAGE IN RANGE" when no rows match the filter', () => {
    render(<DailyUsageChart rows={[]} projectId="all" preset="all" today="2026-05-22" metric="total" family="all" />);
    expect(screen.getByText(/NO USAGE IN RANGE/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tokens/DailyUsageChart.test.tsx`
Expected: FAIL — TOTAL currently produces 6 bars and model legend chips, not 12 + token-type chips.

- [ ] **Step 3: Implement token-type stacking**

In `src/tokens/DailyUsageChart.tsx`:

a) Add imports near the existing aggregate/palette imports:

```tsx
import { stackDataByType } from './aggregate';
import { TOKEN_TYPE_KEYS, tokenTypeColor, tokenTypeLabel } from './tokenType';
```

(Keep the existing `stackData`, `colorFor`, `modelLabel` imports.)

b) Replace the `useMemo` block (currently lines ~79-93) with a dimension-aware version:

```tsx
  const byType = metric === 'total';

  const { days, allKeys, activeKeys, data, hasData } = useMemo(() => {
    const cutoff = presetCutoff(preset, today);
    const base = filterRows(rows, projectId, cutoff);
    const filtered = family === 'all' ? base : base.filter((r) => familyOf(r.modelId) === family);
    if (filtered.length === 0) {
      return { days: [] as string[], allKeys: [] as string[], activeKeys: [] as string[], data: [] as DayRow[], hasData: false };
    }
    const earliest = filtered.reduce((m, r) => (r.day < m ? r.day : m), filtered[0].day);
    const from = earliest > cutoff ? earliest : cutoff;
    const days = densifyDays(from, today);
    const allKeys = byType ? [...TOKEN_TYPE_KEYS] : modelKeysSorted(filtered);
    const activeKeys = allKeys.filter((k) => !disabled.has(k));
    const data = byType ? stackDataByType(filtered, days) : stackData(filtered, days, activeKeys, metric);
    return { days, allKeys, activeKeys, data, hasData: true };
  }, [rows, projectId, preset, today, metric, disabled, family, byType]);
```

c) Add two label/color resolvers right after that `useMemo` (used by render, legend, tooltip):

```tsx
  const colorOf = (k: string): string => (byType ? tokenTypeColor(k) : colorFor(k, allKeys));
  const labelOf = (k: string): string => {
    if (byType) return tokenTypeLabel(k);
    const isSub = k.endsWith('|sub');
    const baseId = isSub ? k.slice(0, -4) : k;
    return isSub ? `${modelLabel(baseId)} · sub` : modelLabel(baseId);
  };
```

d) In the render `useEffect`, replace every `colorFor(s.key, allKeys)` call with `colorOf(s.key)` (the three series passes). Add `metric` to the effect dependency array (so the closure's `colorOf`/`byType` stay correct):

```tsx
  }, [hasData, width, svgHeight, days, allKeys, activeKeys, data, metric]);
```

e) In the tooltip JSX, replace the inline model-label IIFE with `labelOf(hover.key)` and `colorFor(hover.key, allKeys)` with `colorOf(hover.key)`:

```tsx
            <div style={{ color: colorOf(hover.key) }}>{labelOf(hover.key)}</div>
```

f) In the legend `allKeys.map(...)` JSX, replace `colorFor(k, allKeys)` with `colorOf(k)` and the inline label IIFE with `{labelOf(k)}`. The `data-testid={`legend-chip-${k}`}` line is unchanged (now yields `legend-chip-input` etc. in TOTAL mode).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/tokens/DailyUsageChart.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean (no output).

- [ ] **Step 6: Commit**

```bash
git add src/tokens/DailyUsageChart.tsx tests/unit/tokens/DailyUsageChart.test.tsx
git commit -m "feat(tokens): TOTAL daily chart stacks by token type"
```

---

### Task 3: Shared glass helper (`glass.ts`)

**Files:**
- Create: `src/tokens/glass.ts`
- Test: `tests/unit/tokens/glass.test.ts`

**Interfaces:**
- Produces:
  - `type GlassIds = { sheen: string; glow: string; softglow: string }`
  - `appendGlassDefs(svg: SVGSVGElement, prefix: string): GlassIds` — idempotent; inserts a `<defs data-glass>` once.
  - `drawGlassBar(g, opts): d3 Selection<SVGRectElement>` where `opts = { x, y, width, height, color, ids, role }`. Always appends the interactive front rect tagged `data-role={role}` (so zero-height segments still count); when `height > 0` it also appends bloom, sheen overlay, and a `data-role="bar-cap"` top edge. Returns the front rect for the caller to attach `data-key`/handlers/`<title>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/tokens/glass.test.ts
import { describe, it, expect } from 'vitest';
import * as d3 from 'd3';
import { appendGlassDefs, drawGlassBar } from '../../../src/tokens/glass';

const NS = 'http://www.w3.org/2000/svg';

describe('glass helper', () => {
  it('appendGlassDefs inserts prefixed, idempotent defs', () => {
    const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
    const ids = appendGlassDefs(svg, 'daily');
    expect(ids.glow).toBe('daily-glass-glow');
    expect(svg.querySelector('#daily-glass-glow')).not.toBeNull();
    expect(svg.querySelector('#daily-glass-sheen')).not.toBeNull();
    appendGlassDefs(svg, 'daily'); // idempotent
    expect(svg.querySelectorAll('defs[data-glass]').length).toBe(1);
  });

  it('drawGlassBar tags the front rect and adds a cap when tall', () => {
    const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
    const ids = appendGlassDefs(svg, 'spend');
    const g = d3.select(svg).append('g');
    const front = drawGlassBar(g, { x: 0, y: 0, width: 10, height: 40, color: '#00E5FF', ids, role: 'spend-bar' });
    expect(front.attr('data-role')).toBe('spend-bar');
    expect(svg.querySelectorAll('[data-role="spend-bar"]').length).toBe(1);
    expect(svg.querySelectorAll('[data-role="bar-cap"]').length).toBe(1);
  });

  it('drawGlassBar still emits the front rect for zero-height segments (no cap)', () => {
    const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
    const ids = appendGlassDefs(svg, 'daily');
    const g = d3.select(svg).append('g');
    drawGlassBar(g, { x: 0, y: 0, width: 10, height: 0, color: '#00E5FF', ids, role: 'bar' });
    expect(svg.querySelectorAll('[data-role="bar"]').length).toBe(1);
    expect(svg.querySelectorAll('[data-role="bar-cap"]').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tokens/glass.test.ts`
Expected: FAIL — `src/tokens/glass.ts` not found.

- [ ] **Step 3: Create `src/tokens/glass.ts`**

```ts
import * as d3 from 'd3';

export type GlassIds = { sheen: string; glow: string; softglow: string };

// Inserts the glass gradient + glow filters once per <svg>. ids are prefixed
// so two charts on one page never collide on url(#id). Safe to call on every
// render (it no-ops if the defs are already present).
export function appendGlassDefs(svgEl: SVGSVGElement, prefix: string): GlassIds {
  const ids: GlassIds = {
    sheen: `${prefix}-glass-sheen`,
    glow: `${prefix}-glass-glow`,
    softglow: `${prefix}-glass-softglow`,
  };
  const svg = d3.select(svgEl);
  if (!svg.select('defs[data-glass]').empty()) return ids;
  const defs = svg.insert('defs', ':first-child').attr('data-glass', prefix);

  const sheen = defs.append('linearGradient')
    .attr('id', ids.sheen).attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
  sheen.append('stop').attr('offset', 0).attr('stop-color', 'rgba(255,255,255,0.45)');
  sheen.append('stop').attr('offset', 0.35).attr('stop-color', 'rgba(255,255,255,0.06)');
  sheen.append('stop').attr('offset', 1).attr('stop-color', 'rgba(255,255,255,0)');

  for (const [id, dev] of [[ids.glow, 1.6], [ids.softglow, 4]] as const) {
    const f = defs.append('filter').attr('id', id)
      .attr('x', '-80%').attr('y', '-80%').attr('width', '260%').attr('height', '260%');
    f.append('feGaussianBlur').attr('stdDeviation', dev).attr('result', 'b');
    const m = f.append('feMerge');
    m.append('feMergeNode').attr('in', 'b');
    m.append('feMergeNode').attr('in', 'SourceGraphic');
  }
  return ids;
}

type BarOpts = { x: number; y: number; width: number; height: number; color: string; ids: GlassIds; role: string };

// Draws one Hologram-Glass segment into group `g`. Always appends the
// interactive front rect (so callers can keep a rect per day/key, even at
// zero height); decorations are added only when the segment has height.
export function drawGlassBar(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  o: BarOpts,
): d3.Selection<SVGRectElement, unknown, null, undefined> {
  const rx = Math.min(4, o.width / 3);
  if (o.height > 0) {
    // outer bloom
    g.append('rect')
      .attr('x', o.x - 1).attr('y', o.y).attr('width', o.width + 2).attr('height', o.height).attr('rx', rx)
      .attr('fill', o.color).attr('fill-opacity', 0.12).attr('filter', `url(#${o.ids.softglow})`)
      .attr('pointer-events', 'none');
  }
  // interactive front glass (tinted by series color)
  const front = g.append('rect')
    .attr('data-role', o.role)
    .attr('x', o.x).attr('y', o.y).attr('width', o.width).attr('height', o.height).attr('rx', rx)
    .attr('fill', o.color).attr('fill-opacity', 0.20)
    .attr('stroke', o.color).attr('stroke-width', 1.1).attr('stroke-opacity', 0.9);
  if (o.height > 0) {
    // white sheen highlight
    g.append('rect')
      .attr('x', o.x).attr('y', o.y).attr('width', o.width).attr('height', o.height).attr('rx', rx)
      .attr('fill', `url(#${o.ids.sheen})`).attr('pointer-events', 'none');
    // bright glowing top cap
    g.append('rect')
      .attr('data-role', 'bar-cap')
      .attr('x', o.x).attr('y', o.y - 1).attr('width', o.width).attr('height', 2).attr('rx', 1)
      .attr('fill', o.color).attr('filter', `url(#${o.ids.glow})`).attr('pointer-events', 'none');
  }
  return front;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/tokens/glass.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tokens/glass.ts tests/unit/tokens/glass.test.ts
git commit -m "feat(tokens): shared Hologram-Glass SVG defs + drawGlassBar helper"
```

---

### Task 4: DailyUsageChart — Hologram Glass bars

**Files:**
- Modify: `src/tokens/DailyUsageChart.tsx`
- Test: `tests/unit/tokens/DailyUsageChart.test.tsx`

**Interfaces:**
- Consumes: `appendGlassDefs`, `drawGlassBar` (Task 3); the dimension-aware `colorOf` (Task 2).

- [ ] **Step 1: Add the failing test**

Append this test inside the existing `describe('DailyUsageChart', ...)` in `tests/unit/tokens/DailyUsageChart.test.tsx`:

```tsx
  it('renders glass caps on the non-zero segments', () => {
    render(chart('total'));
    // glass defs present + at least one cap drawn for the populated days
    expect(document.querySelector('svg defs[data-glass="daily"]')).not.toBeNull();
    expect(document.querySelectorAll('svg [data-role="bar-cap"]').length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tokens/DailyUsageChart.test.tsx -t "glass caps"`
Expected: FAIL — no `defs[data-glass]` / `bar-cap` yet.

- [ ] **Step 3: Replace the three bar passes with glass rendering**

In `src/tokens/DailyUsageChart.tsx`:

a) Add the import:

```tsx
import { appendGlassDefs, drawGlassBar } from './glass';
```

b) Remove the `ISO_OFF_X` / `ISO_OFF_Y` constants (no longer used) and delete the three drawing passes (the `Pass 1: side polygons`, `Pass 2: front rects`, `Pass 3: top polygons` blocks, currently ~lines 164-251). Replace them with:

```tsx
    // Hologram-Glass bars — one group per series; drawGlassBar handles the
    // glass fill, sheen, bloom and cap. The front rect stays interactive.
    const ids = appendGlassDefs(svgRef.current, 'daily');
    const barsG = svg.append('g');
    series.forEach((s) => {
      const color = colorOf(s.key);
      const sg = barsG.append('g');
      s.forEach((d) => {
        const bx = x(d.data.day) ?? 0;
        const bw = x.bandwidth();
        const yTop = y(d[1]);
        const h = Math.max(0, y(d[0]) - y(d[1]));
        const front = drawGlassBar(sg, { x: bx, y: yTop, width: bw, height: h, color, ids, role: 'bar' });
        front
          .attr('data-key', s.key)
          .attr('data-day', d.data.day)
          .style('cursor', 'crosshair')
          .on('mouseenter', () => {
            setHover({ day: d.data.day, key: s.key, value: d[1] - d[0], cx: bx + bw / 2, cy: yTop });
          })
          .on('mouseleave', () => setHover(null));
      });
    });
```

c) `appendGlassDefs` must run after `svg.selectAll('*').remove()` (it already is — that remove is near the top of the effect, before the axes). Confirm the call sits after the remove and after `svgRef.current` null-check (the effect already early-returns when `!svgRef.current`).

- [ ] **Step 4: Run the full chart test to verify it passes**

Run: `npx vitest run tests/unit/tokens/DailyUsageChart.test.tsx`
Expected: PASS (4 tests — bar counts unchanged because `drawGlassBar` always emits the front rect).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/tokens/DailyUsageChart.tsx tests/unit/tokens/DailyUsageChart.test.tsx
git commit -m "feat(tokens): Hologram-Glass bars in the daily usage chart"
```

---

### Task 5: SpendBars — Hologram Glass bars

**Files:**
- Modify: `src/tokens/SpendBars.tsx`
- Test: `tests/unit/tokens/SpendBars.test.tsx`

**Interfaces:**
- Consumes: `appendGlassDefs`, `drawGlassBar` (Task 3).

- [ ] **Step 1: Add the failing test**

Append inside the existing `describe('SpendBars', ...)` in `tests/unit/tokens/SpendBars.test.tsx`:

```tsx
  it('draws glass caps + defs for the priced segments', () => {
    const { container } = render(<SpendBars rows={ROWS} prices={{}} bundled={BUNDLED} />);
    expect(container.querySelector('svg defs[data-glass="spend"]')).not.toBeNull();
    expect(container.querySelectorAll('svg [data-role="bar-cap"]').length).toBe(3);
  });
```

(There are exactly 3 priced segments — see the existing "one stacked bar segment per priced model-month" test.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tokens/SpendBars.test.tsx -t "glass caps"`
Expected: FAIL — no glass defs/caps yet.

- [ ] **Step 3: Convert the stacked-bar loop to glass**

In `src/tokens/SpendBars.tsx`:

a) Add the import:

```tsx
import { appendGlassDefs, drawGlassBar } from './glass';
```

b) Inside the render `useEffect`, after `sel.selectAll('*').remove();` and `sel.attr('width', w).attr('height', height);`, add:

```tsx
    const ids = appendGlassDefs(svg, 'spend');
```

c) Replace the inner segment-drawing block (the `sel.append('rect')...append('title')` for each `k`, currently ~lines 66-74) with a glass segment. The loop becomes:

```tsx
    for (const m of months) {
      let y0 = 0;
      const mg = sel.append('g');
      for (const k of keys) {
        const v = m.byModel.get(k)?.total ?? 0;
        if (v <= 0) continue;
        const front = drawGlassBar(mg, {
          x: x(m.month)!,
          y: y(y0 + v),
          width: x.bandwidth(),
          height: Math.max(1, y(y0) - y(y0 + v)),
          color: colorFor(k, colorKeys),
          ids,
          role: 'spend-bar',
        });
        front.append('title').text(`${m.month} · ${modelKeyLabel(k)}: ${formatUsd(v)}`);
        y0 += v;
      }
      // month label (unchanged)
      sel.append('text')
        .attr('x', x(m.month)! + x.bandwidth() / 2)
        .attr('y', height - 6)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-dim)')
        .attr('font-size', 9)
        .attr('font-family', 'ui-monospace, monospace')
        .text(m.month);
    }
```

(The y-axis tick label loop below is unchanged.)

- [ ] **Step 4: Run the full SpendBars test to verify it passes**

Run: `npx vitest run tests/unit/tokens/SpendBars.test.tsx`
Expected: PASS (6 tests — `data-role="spend-bar"` count stays 3; titles still present on the front rect).

- [ ] **Step 5: Commit**

```bash
git add src/tokens/SpendBars.tsx tests/unit/tokens/SpendBars.test.tsx
git commit -m "feat(tokens): Hologram-Glass bars in the monthly spend chart"
```

---

### Task 6: SpendMatrix — Glass mini-bars

**Files:**
- Modify: `src/tokens/SpendMatrix.tsx`
- Test: `tests/unit/tokens/SpendMatrix.test.tsx`

**Interfaces:**
- Behavior: each populated cell shows its `$` figure plus an inner horizontal glass bar whose width is `cell.total / maxCell`. Cell `textContent` stays exactly the formatted `$` value (the bar carries no text). Pin-on-click and the empty `—` cell are unchanged.

- [ ] **Step 1: Add the failing test**

Append inside the existing `describe('SpendMatrix', ...)` in `tests/unit/tokens/SpendMatrix.test.tsx`:

```tsx
  it('renders a glass mini-bar scaled to the cell value', () => {
    render(<SpendMatrix rows={ROWS} prices={{}} bundled={BUNDLED} todayMonth="2026-06" />);
    const cell = screen.getByTestId('spend-cell-claude-opus-4-8-2026-05'); // $5 — the max cell -> full width
    const bar = cell.querySelector('[data-role="matrix-bar"]') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.style.width).toBe('100%');
    // value text is still exactly the $ figure
    expect(cell.textContent).toBe('$5.00');
    // a smaller cell gets a narrower bar
    const small = screen.getByTestId('spend-cell-claude-sonnet-4-6-2026-06'); // $3 of max $5 = 60%
    const smallBar = small.querySelector('[data-role="matrix-bar"]') as HTMLElement;
    expect(smallBar.style.width).toBe('60%');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tokens/SpendMatrix.test.tsx -t "mini-bar"`
Expected: FAIL — no `matrix-bar` element yet.

- [ ] **Step 3: Replace cell background-alpha with a glass mini-bar**

In `src/tokens/SpendMatrix.tsx`, inside `MatrixRow`, replace the populated-cell branch (currently the `const alpha = ...; return <td ... style={{ ...styles.tdCell, background: hexToRgba(color, alpha) }}>{formatUsd(c.total)}</td>;` block) with:

```tsx
          const pct = maxCell > 0 ? Math.round((c.total / maxCell) * 100) : 0;
          return (
            <td
              key={m.month}
              data-testid={`spend-cell-${k}-${m.month}`}
              onClick={() => onCellClick(m.month)}
              style={styles.tdCell}
            >
              <span style={styles.cellInner}>
                <span
                  data-role="matrix-bar"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${hexToRgba(color, 0.15)}, ${hexToRgba(color, 0.55)})`,
                    boxShadow: pct > 80 ? `0 0 6px ${hexToRgba(color, 0.7)}` : 'none',
                    borderRight: `1px solid ${hexToRgba(color, 0.9)}`,
                  }}
                />
                <span style={styles.cellNum}>{formatUsd(c.total)}</span>
              </span>
            </td>
          );
```

Add these style entries to the `styles` object (keep `tdCell`; the `background` is now set per-bar, so `tdCell` no longer needs a dynamic background):

```tsx
  cellInner: { position: 'relative' as const, display: 'block' as const, minHeight: 14 },
  cellNum: { position: 'relative' as const, zIndex: 1 },
```

And update `tdCell` to host the bar:

```tsx
  tdCell: { position: 'relative' as const, textAlign: 'right' as const, padding: '5px 8px', color: 'var(--text)', borderTop: '1px solid rgba(110,224,238,0.08)', cursor: 'pointer' as const, overflow: 'hidden' as const },
```

The mini-bar is absolutely positioned behind the number:

```tsx
  // replace the inline style on the matrix-bar span's `width` line: make it absolute
```

Use this exact span markup instead (absolute fill from the left):

```tsx
                <span
                  data-role="matrix-bar"
                  style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${hexToRgba(color, 0.15)}, ${hexToRgba(color, 0.55)})`,
                    boxShadow: pct > 80 ? `0 0 6px ${hexToRgba(color, 0.7)}` : 'none',
                    borderRight: `1px solid ${hexToRgba(color, 0.9)}`,
                  }}
                />
```

(`cellInner` can then be a plain inline wrapper; the `$` sits in `cellNum` with `zIndex:1` above the absolute bar. `hexToRgba` already exists at the top of the file.)

- [ ] **Step 4: Run the full SpendMatrix test to verify it passes**

Run: `npx vitest run tests/unit/tokens/SpendMatrix.test.tsx`
Expected: PASS (5 tests — existing grid/pin/cards tests still green; `textContent` of each cell is still the `$` figure).

- [ ] **Step 5: Commit**

```bash
git add src/tokens/SpendMatrix.tsx tests/unit/tokens/SpendMatrix.test.tsx
git commit -m "feat(tokens): glass mini-bars in the spend matrix cells"
```

---

### Task 7: TokensPage — MATRIX is the default SPEND mode

**Files:**
- Modify: `src/tokens/TokensPage.tsx:33`
- Test: `tests/unit/tokens/TokensPage.view.test.tsx`

- [ ] **Step 1: Update the failing tests**

Replace the two SPEND-related tests in `tests/unit/tokens/TokensPage.view.test.tsx` (keep the first "defaults to the TOKENS view" test as-is) with:

```tsx
  it('SPEND defaults to the MATRIX mode', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('usage-view-spend'));
    expect(await screen.findByTestId('spend-matrix')).toBeTruthy();
    expect(screen.queryByTestId('spend-bars')).toBeNull();
    expect(screen.getByTestId('spend-mode-matrix').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('spend-disclaimer').textContent).toContain('API LIST PRICES');
  });

  it('switches from MATRIX to BARS and back', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('usage-view-spend'));
    fireEvent.click(await screen.findByTestId('spend-mode-bars'));
    expect(await screen.findByTestId('spend-bars')).toBeTruthy();
    expect(screen.queryByTestId('spend-matrix')).toBeNull();
    fireEvent.click(screen.getByTestId('spend-mode-matrix'));
    expect(await screen.findByTestId('spend-matrix')).toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tokens/TokensPage.view.test.tsx`
Expected: FAIL — current default is `'bars'`, so clicking SPEND shows `spend-bars`, not `spend-matrix`.

- [ ] **Step 3: Change the default**

In `src/tokens/TokensPage.tsx` line 33:

```tsx
  const [spendMode, setSpendMode] = useState<'bars' | 'matrix'>('matrix');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/tokens/TokensPage.view.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tokens/TokensPage.tsx tests/unit/tokens/TokensPage.view.test.tsx
git commit -m "feat(tokens): default the SPEND view to the matrix mode"
```

---

### Task 8: MemoryPage — GRAPH is the default tab

**Files:**
- Modify: `src/memory/MemoryPage.tsx:28`
- Test: `tests/unit/memory/MemoryPage.default.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/memory/MemoryPage.default.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryPage } from '../../../src/memory/MemoryPage';

vi.mock('../../../src/api/hooks', () => ({
  useMemoryList: () => ({ data: { memories: [] }, isLoading: false, error: null }),
  useCreateMemory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../../src/memory/MemoryGraph', () => ({
  MemoryGraph: () => <div data-testid="memory-graph-stub" />,
}));

function renderPage() {
  return render(
    <MemoryPage
      selected={null}
      onSelectMemory={() => {}}
      onJumpToSession={() => {}}
      creatingScope={null}
      onCreateDone={() => {}}
      knownSessionIds={new Set()}
    />,
  );
}

describe('MemoryPage default tab', () => {
  it('defaults to the GRAPH view', () => {
    renderPage();
    expect(screen.getByTestId('memory-graph-stub')).toBeTruthy();
    expect(screen.getByTestId('memory-view-graph').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('memory-view-detail').getAttribute('aria-pressed')).toBe('false');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/memory/MemoryPage.default.test.tsx`
Expected: FAIL — default is `'detail'`, so `memory-graph-stub` is absent and `memory-view-graph` aria-pressed is `false`.

- [ ] **Step 3: Change the default**

In `src/memory/MemoryPage.tsx` line 28:

```tsx
  const [view, setView] = useState<View>('graph');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/memory/MemoryPage.default.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/memory/MemoryPage.tsx tests/unit/memory/MemoryPage.default.test.tsx
git commit -m "feat(memory): default the memory page to the graph tab"
```

---

### Task 9: usePlayback — default 2×, SPEED_STEPS, stepSpeed

**Files:**
- Modify: `src/playback/usePlayback.ts`
- Test: `tests/unit/playback-step.test.ts`

**Interfaces:**
- Produces: `export const SPEED_STEPS: Speed[]` (ordered `[0.1, 0.25, 0.5, 1, 2, 4]`); `export function stepSpeed(current: Speed, dir: 1 | -1): Speed` (clamps at both ends). Default `speed` state is `2`.

- [ ] **Step 1: Add the failing tests**

Append to `tests/unit/playback-step.test.ts`. First add `stepSpeed`/`SPEED_STEPS` to the import on line 3:

```ts
import { usePlayback, SPEED_STEPS, stepSpeed } from '../../src/playback/usePlayback';
```

Then add these tests inside `describe('usePlayback', ...)`:

```ts
  it('defaults to 2x (quicker than the old 0.1x)', () => {
    const root = ms('a', [ms('b')]);
    const { result } = renderHook(() => usePlayback(root));
    expect(result.current.state.speed).toBe(2);
  });

  it('stepSpeed walks the ladder and clamps at both ends', () => {
    expect(SPEED_STEPS).toEqual([0.1, 0.25, 0.5, 1, 2, 4]);
    expect(stepSpeed(1, 1)).toBe(2);
    expect(stepSpeed(1, -1)).toBe(0.5);
    expect(stepSpeed(4, 1)).toBe(4);   // clamp high
    expect(stepSpeed(0.1, -1)).toBe(0.1); // clamp low
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/playback-step.test.ts`
Expected: FAIL — `SPEED_STEPS`/`stepSpeed` not exported; default speed is `0.1`.

- [ ] **Step 3: Implement**

In `src/playback/usePlayback.ts`:

a) After the `msPerNode` function (~line 20), add:

```ts
export const SPEED_STEPS: Speed[] = [0.1, 0.25, 0.5, 1, 2, 4];

export function stepSpeed(current: Speed, dir: 1 | -1): Speed {
  const i = SPEED_STEPS.indexOf(current);
  const base = i < 0 ? SPEED_STEPS.indexOf(2) : i;
  const next = Math.max(0, Math.min(SPEED_STEPS.length - 1, base + dir));
  return SPEED_STEPS[next];
}
```

b) Change the default speed state (line 71):

```ts
  const [speed, setSpeed] = useState<Speed>(2);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/playback-step.test.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/playback/usePlayback.ts tests/unit/playback-step.test.ts
git commit -m "feat(playback): default speed 2x + SPEED_STEPS/stepSpeed ladder"
```

---

### Task 10: PlaybackControls — drop buttons, add speed stepper

**Files:**
- Modify: `src/components/PlaybackControls.tsx`
- Test: `tests/unit/components/PlaybackControls.test.tsx` (new)

**Interfaces:**
- Consumes: `stepSpeed` (Task 9). Keeps `nextIndexMatching` (still used by `jump-subagent`).
- Behavior: removes `restart`, `jump-fail`, `jump-tool`. Adds `speed-dec` / `speed-value` / `speed-inc`. `speed-value` shows `${state.speed}×`. `speed-inc` → `controls.setSpeed(stepSpeed(state.speed, 1))`; `speed-dec` → `controls.setSpeed(stepSpeed(state.speed, -1))`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/components/PlaybackControls.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlaybackControls } from '../../../src/components/PlaybackControls';
import type { PlaybackState, PlaybackControls as Controls } from '../../../src/playback/usePlayback';
import type { Milestone } from '../../../src/parse/types';

function ms(id: string, over: Partial<Milestone> = {}): Milestone {
  return { id, kind: 'tool_call', label: id, summary: id, timestamp: '', failed: false, raw: null, children: [], ...over };
}

function setup(speed: PlaybackState['speed'] = 2) {
  const controls: Controls = {
    play: vi.fn(), pause: vi.fn(), toggle: vi.fn(), setSpeed: vi.fn(),
    restart: vi.fn(), step: vi.fn(), scrubTo: vi.fn(),
  };
  const state: PlaybackState = {
    order: [ms('a'), ms('b', { kind: 'subagent_spawn' }), ms('c')],
    index: 0, edgeProgress: 0, playing: false, speed, finished: false,
  };
  render(<PlaybackControls state={state} controls={controls} />);
  return controls;
}

describe('PlaybackControls', () => {
  it('drops restart / next-failure / next-tool-call', () => {
    setup();
    expect(screen.queryByTestId('restart')).toBeNull();
    expect(screen.queryByTestId('jump-fail')).toBeNull();
    expect(screen.queryByTestId('jump-tool')).toBeNull();
  });

  it('keeps step / play / scrubber / next-subagent / end', () => {
    setup();
    for (const id of ['step-back', 'play-toggle', 'step-forward', 'scrubber-track', 'jump-subagent', 'jump-end']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });

  it('shows the current speed and steps up/down', () => {
    const controls = setup(2);
    expect(screen.getByTestId('speed-value').textContent).toContain('2');
    fireEvent.click(screen.getByTestId('speed-inc'));
    expect(controls.setSpeed).toHaveBeenCalledWith(4);
    fireEvent.click(screen.getByTestId('speed-dec'));
    expect(controls.setSpeed).toHaveBeenCalledWith(1);
  });

  it('clamps at the top of the ladder', () => {
    const controls = setup(4);
    fireEvent.click(screen.getByTestId('speed-inc'));
    expect(controls.setSpeed).toHaveBeenCalledWith(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/PlaybackControls.test.tsx`
Expected: FAIL — `restart`/`jump-fail`/`jump-tool` still present; no `speed-*` controls.

- [ ] **Step 3: Edit `src/components/PlaybackControls.tsx`**

a) Update the import to add `stepSpeed`:

```tsx
import {
  nextIndexMatching,
  stepSpeed,
  type PlaybackControls as Controls,
  type PlaybackState,
} from '../playback/usePlayback';
```

b) In the returned `<div style={styles.bar}>`, delete the `jump-fail` button, the `jump-tool` button, and the `restart` button. Keep `jump-subagent` and `jump-end`. After the `jumpGroup` div, add the speed stepper:

```tsx
      <div style={styles.speedGroup}>
        <button
          style={styles.btn}
          data-testid="speed-dec"
          aria-label="slower"
          title="slower"
          onClick={() => controls.setSpeed(stepSpeed(state.speed, -1))}
        >−</button>
        <span style={styles.speedValue} data-testid="speed-value">{state.speed}×</span>
        <button
          style={styles.btn}
          data-testid="speed-inc"
          aria-label="faster"
          title="faster"
          onClick={() => controls.setSpeed(stepSpeed(state.speed, 1))}
        >+</button>
      </div>
```

c) The resulting `jumpGroup` keeps only `jump-subagent` (⌥) and `jump-end` (■):

```tsx
      <div style={styles.jumpGroup}>
        <button
          style={styles.btn}
          data-testid="jump-subagent"
          title="next subagent"
          aria-label="next subagent"
          onClick={() => {
            const i = nextIndexMatching(state.order, state.index, (m) => m.kind === 'subagent_spawn');
            if (i != null) controls.scrubTo(i);
          }}
        >⌥</button>
        <button
          style={styles.btn}
          data-testid="jump-end"
          title="end"
          aria-label="end"
          onClick={() => controls.scrubTo(state.order.length - 1)}
        >■</button>
      </div>
```

d) Add styles to the `styles` object:

```tsx
  speedGroup: { display: 'flex' as const, gap: 4, alignItems: 'center' as const, marginLeft: 6 },
  speedValue: { color: 'var(--edge-trail)', fontSize: 11, minWidth: 30, textAlign: 'center' as const, letterSpacing: 1 },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/PlaybackControls.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/PlaybackControls.tsx tests/unit/components/PlaybackControls.test.tsx
git commit -m "feat(playback): replace restart/next-failure/next-tool-call with a speed stepper"
```

---

### Task 11: Retarget e2e specs + full verification

**Files:**
- Modify: `tests/e2e/spend-view.spec.ts`
- Modify: `tests/e2e/memory-page.spec.ts`

**Context:** Per the e2e dev-server gotcha, kill any stray `npm run dev` on port 5174 before running Playwright, or it reuses a real-data server instead of the fixture server.

- [ ] **Step 1: Update `spend-view.spec.ts` for the MATRIX default**

The SPEND view now opens on MATRIX. Replace the block from `// SPEND · BARS` through the `// SPEND · MATRIX` matrix-cell assertion (lines ~23-38) with:

```ts
  // SPEND opens on MATRIX by default
  await page.getByTestId('usage-view-spend').click();
  await expect(page.getByTestId('spend-disclaimer')).toBeVisible();
  await expect(page.getByTestId('spend-cell-claude-opus-4-8-2026-05')).toContainText('$26.25');
  await page.getByTestId('spend-cell-claude-opus-4-8-2026-05').click();
  await expect(page.getByTestId('spend-cell-pin')).toContainText('cache w');

  // Switch to BARS
  await page.getByTestId('spend-mode-bars').click();
  await expect(page.getByTestId('spend-chip-total')).toContainText('$26.25');
  await expect(page.getByTestId('spend-chip-cachewrite')).toContainText('$11.25');
  await expect.poll(async () => page.locator('svg [data-role="spend-bar"]').count()).toBeGreaterThan(0);
  await page.getByTestId('spend-month-row-2026-05').click();
  await expect(page.getByTestId('spend-month-detail-2026-05-claude-opus-4-8')).toBeVisible();
```

(The TOKENS-view assertions above and the on-disk history assertion below stay unchanged.)

- [ ] **Step 2: Update `memory-page.spec.ts` for the GRAPH default**

In the first test (`memory page: browse, connections, graph, stats`), the page now opens on GRAPH, so select the DETAIL tab before asserting the detail panel. After `await page.getByTestId('mode-tab-memory').click();` and the `memory-page` visibility check, insert:

```ts
  await page.getByTestId('memory-view-detail').click();
```

In the second test (`jump to origin session...`), after `await page.getByTestId('mode-tab-memory').click();` insert the same line before clicking the memory item:

```ts
  await page.getByTestId('memory-view-detail').click();
```

- [ ] **Step 3: Typecheck + full unit suite**

Run: `npm run typecheck`
Expected: clean.

Run: `npm run test`
Expected: all green. (If `tests/unit/server/usage-history-store.test.ts` times out under load, re-run it alone — `npx vitest run tests/unit/server/usage-history-store.test.ts` — it is a known flaky 5 s I/O timeout, not a regression.)

- [ ] **Step 4: Run the affected e2e specs**

Ensure no stray dev server is running, then:

Run: `npm run test:e2e -- spend-view.spec.ts memory-page.spec.ts playback.spec.ts scrubber-step.spec.ts`
Expected: pass (mind the known pre-existing e2e baseline failures, which are unrelated to these specs).

- [ ] **Step 5: Manual verification in the real app**

Run: `npm run dev`, open the app, and confirm:
- USAGE → TOKENS → TOTAL shows a four-color token-type stack visibly different from CACHED; INPUT/OUTPUT/CACHED still stack by model.
- USAGE daily chart + SPEND bars render as glowing glass bars.
- USAGE → SPEND opens on MATRIX; cells show glass mini-bars next to the `$` figures.
- MEMORY opens on the GRAPH tab.
- A session replay bottom bar shows `− 2× +` (no restart/next-failure/next-tool-call); playback runs at 2× and the −/+ buttons change speed and clamp.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/spend-view.spec.ts tests/e2e/memory-page.spec.ts
git commit -m "test(e2e): retarget spend-view + memory-page for new default tabs"
```

---

## Self-Review

**Spec coverage:**
- TOTAL stacks by token type → Tasks 1–2. ✔
- Hologram-Glass bars (daily + spend) → Tasks 3–5. ✔
- Glass mini-bar matrix → Task 6. ✔
- SPEND default MATRIX → Task 7; MEMORY default GRAPH → Task 8. ✔
- Replay: drop restart/next-failure/next-tool-call, add speed stepper, default 2× → Tasks 9–10. ✔
- Test + e2e retargeting + manual check → Task 11. ✔
- Out-of-scope items (math unchanged, USAGE still opens on TOKENS, pricing/cards untouched, speed not persisted) are respected — no task touches them.

**Placeholder scan:** No TBD/TODO; every code and test step shows full content. ✔

**Type consistency:** `GlassIds`, `drawGlassBar(g, opts)`, `appendGlassDefs(svg, prefix)` used identically in Tasks 3–5. `stackDataByType(rows, days)` signature matches Task 1 ↔ Task 2 usage. `SPEED_STEPS`/`stepSpeed(current, dir)` defined in Task 9, consumed in Task 10. Token-type keys/labels/colors defined in Task 1, consumed in Task 2. ✔
