# ThoughtGraph Performance — Smoother & Lighter Rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce render and paint cost across the app while preserving visuals exactly. Eliminate LIVE-mode flicker, hold ≥55fps playback at large N, lower idle CPU.

**Architecture:** Five independent layers landed in order: (1) extract per-element timers and add `React.memo` so the React tree stops re-rendering on every poll/tick; (2) cache layout results by structural fingerprint so the 7s LIVE refetch becomes a no-op for unchanged trees; (3) cull off-screen nodes/edges so SVG paint is bounded; (4) consolidate SVG filters at the group level and animate opacity instead of `drop-shadow`; (5) RAF-debounce camera follow updates.

**Tech Stack:** React 19, TypeScript 5.6, Vite 6, Vitest 3, @testing-library/react, d3-zoom/d3-hierarchy/d3-selection, jsdom. Tests live in `tests/unit/...` mirroring `src/...`.

**Branch:** `feat/perf-smoother-render` (already created; spec at `docs/superpowers/specs/2026-05-24-perf-smoother-render-design.md`).

**Test commands**
- Unit tests: `npm test` (= `vitest run`). Single file: `npm test -- tests/unit/path/to/file.test.ts`.
- Type-check: `npm run typecheck` (= `tsc -b`).
- E2E: `npm run test:e2e`.
- Dev server: `npm run dev` (visual verification).

---

## File Structure

**Create:**
- `src/components/live/useNowMs.ts` — shared 1Hz ticker hook (interval-aware).
- `src/components/live/useStatusMap.ts` — extracted pane-status computation with equality guard.
- `src/graph/viewport.ts` — visible-rect math + AABB intersection helpers.
- `tests/unit/live/useNowMs.test.ts`
- `tests/unit/live/useStatusMap.test.ts`
- `tests/unit/graph/viewport.test.ts`
- `tests/unit/graph/layoutCache.test.ts`

**Modify:**
- `src/components/EdgePath.tsx` — wrap in `React.memo`; drop direct `filter` attribute (Task 12).
- `src/components/NodeShape.tsx` — wrap in `React.memo`; drop direct `filter` attribute (Task 12).
- `src/components/live/LivePanes.tsx` — use `useNowMs`/`useStatusMap`; unify N=1 vs N≥2 render path.
- `src/components/live/LivePane.tsx` — accept `borderless`/`showHeader`/etc. consistently (no structural divergence).
- `src/components/live/CountdownChip.tsx` — use `useNowMs` for its own per-second redraws instead of relying on parent rerender.
- `src/components/GraphCanvas.tsx` — apply viewport culling; split zoom layer into filter cohorts; RAF-debounce follow.
- `src/graph/layout.ts` — add fingerprint + WeakMap + bounded LRU.
- `src/theme/live-pane.css` — adjust keyframes to animate opacity (no filter animation).
- `src/index.css` — adjust `tg-edge-pulse`, `tg-edge-trail`, `tg-shimmer` keyframes.

---

## Task 1: Extract `useNowMs` hook

**Files:**
- Create: `src/components/live/useNowMs.ts`
- Test: `tests/unit/live/useNowMs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/live/useNowMs.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNowMs } from '../../../src/components/live/useNowMs';

describe('useNowMs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T12:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('returns Date.now() at mount', () => {
    const { result } = renderHook(() => useNowMs(1000));
    expect(result.current).toBe(new Date('2026-05-24T12:00:00Z').getTime());
  });

  it('updates after the interval elapses', () => {
    const { result } = renderHook(() => useNowMs(1000));
    const t0 = result.current;
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(t0 + 1000);
  });

  it('clears its interval on unmount', () => {
    const { unmount } = renderHook(() => useNowMs(1000));
    const clearSpy = vi.spyOn(global, 'clearInterval');
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('two subscribers with the same interval update together', () => {
    const a = renderHook(() => useNowMs(1000));
    const b = renderHook(() => useNowMs(1000));
    const before = a.result.current;
    act(() => { vi.advanceTimersByTime(1000); });
    expect(a.result.current).toBe(before + 1000);
    expect(b.result.current).toBe(before + 1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/live/useNowMs.test.ts`
Expected: FAIL with "Cannot find module ... useNowMs".

- [ ] **Step 3: Implement the hook**

```ts
// src/components/live/useNowMs.ts
import { useEffect, useState } from 'react';

/** Returns Date.now() at mount, then updates every `intervalMs` ms.
 *  Each call sets up its own interval — keep this hook localized to the
 *  smallest subtree that actually needs to re-render on the tick. */
export function useNowMs(intervalMs: number): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/live/useNowMs.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/live/useNowMs.ts tests/unit/live/useNowMs.test.ts
git commit -m "feat(live): extract useNowMs ticker hook"
```

---

## Task 2: Extract `useStatusMap` hook with equality guard

**Files:**
- Create: `src/components/live/useStatusMap.ts`
- Test: `tests/unit/live/useStatusMap.test.ts`

This hook owns the per-pane status map, derives it on each tick, and returns the *same object reference* when the computed map equals the previous map. That stops downstream rerenders on idle ticks.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/live/useStatusMap.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStatusMap } from '../../../src/components/live/useStatusMap';

type Entry = { key: string };

const TICK = 1000;

describe('useStatusMap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T12:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('returns a status for every entry', () => {
    const entries: Entry[] = [{ key: 'a' }, { key: 'b' }];
    const keyToFileId = new Map([['a', 'fa'], ['b', 'fb']]);
    const mtimes = { fa: '2026-05-24T12:00:00Z', fb: '2026-05-24T12:00:00Z' };
    const userClosed = new Set<string>();
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, TICK)
    );
    expect(Object.keys(result.current)).toEqual(['a', 'b']);
    expect(result.current.a.status).toBe('active');
    expect(result.current.b.status).toBe('active');
  });

  it('returns the SAME object reference across ticks when nothing changed', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    const mtimes = { fa: '2026-05-24T12:00:00Z' };
    const userClosed = new Set<string>();
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, TICK)
    );
    const first = result.current;
    act(() => { vi.advanceTimersByTime(TICK); });
    expect(result.current).toBe(first); // reference-equal: no rerender propagation
  });

  it('returns a new reference when an entry transitions state', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    const mtimes = { fa: '2026-05-24T12:00:00Z' };
    const userClosed = new Set<string>();
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, TICK)
    );
    const first = result.current;
    // 31s of inactivity → transitions to 'closing'
    act(() => { vi.advanceTimersByTime(31_000); });
    expect(result.current).not.toBe(first);
    expect(result.current.a.status).toBe('closing');
  });

  it('marks user-closed entries as closed regardless of mtime activity', () => {
    const entries: Entry[] = [{ key: 'a' }];
    const keyToFileId = new Map([['a', 'fa']]);
    const mtimes = { fa: '2026-05-24T12:00:00Z' };
    const userClosed = new Set(['a']);
    const { result } = renderHook(() =>
      useStatusMap(entries, keyToFileId, mtimes, userClosed, TICK)
    );
    expect(result.current.a.status).toBe('closed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/live/useStatusMap.test.ts`
Expected: FAIL with "Cannot find module ... useStatusMap".

- [ ] **Step 3: Implement the hook**

```ts
// src/components/live/useStatusMap.ts
import { useMemo, useRef } from 'react';
import { useNowMs } from './useNowMs';
import { nextPaneStatus, type PaneState } from './paneStatus';
import { SUBAGENT_STABLE_MS, TICK_MS } from './liveness';

type Entry = { key: string };

function stateEqual(a: PaneState, b: PaneState): boolean {
  return (
    a.status === b.status &&
    a.closingStartedAt === b.closingStartedAt &&
    a.frozenAt === b.frozenAt &&
    a.frozenRemainingMs === b.frozenRemainingMs
  );
}

function mapsEqual(a: Record<string, PaneState>, b: Record<string, PaneState>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    const av = a[k];
    const bv = b[k];
    if (!bv) return false;
    if (!stateEqual(av, bv)) return false;
  }
  return true;
}

/** Status map for the LIVE subagent panes. Returns the same object reference
 *  when the derived map is value-equal to the previous one, so memoized
 *  consumers don't rerender on idle 1Hz ticks. */
export function useStatusMap(
  entries: Entry[],
  keyToFileId: Map<string, string>,
  subagentMtimes: Record<string, string>,
  userClosedKeys: Set<string>,
  intervalMs: number = TICK_MS,
): Record<string, PaneState> {
  const nowMs = useNowMs(intervalMs);
  const prevRef = useRef<Record<string, PaneState>>({});

  return useMemo(() => {
    const next: Record<string, PaneState> = {};
    const prev = prevRef.current;
    for (const e of entries) {
      if (userClosedKeys.has(e.key)) {
        next[e.key] = { status: 'closed', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null };
        continue;
      }
      const fileId = keyToFileId.get(e.key);
      const mtimeIso = fileId ? subagentMtimes[fileId] : undefined;
      const lastUpdatedMs = mtimeIso ? new Date(mtimeIso).getTime() : nowMs;
      const staleAtOpen = (nowMs - lastUpdatedMs) >= SUBAGENT_STABLE_MS;
      const prevState: PaneState =
        prev[e.key] ?? (staleAtOpen
          ? { status: 'closed', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null }
          : { status: 'active', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null });
      next[e.key] = nextPaneStatus(prevState, lastUpdatedMs, nowMs);
    }
    if (mapsEqual(prev, next)) return prev;
    prevRef.current = next;
    return next;
  }, [entries, keyToFileId, subagentMtimes, userClosedKeys, nowMs]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/live/useStatusMap.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/live/useStatusMap.ts tests/unit/live/useStatusMap.test.ts
git commit -m "feat(live): extract useStatusMap with reference-stable equality guard"
```

---

## Task 3: Refactor `LivePanes` to use the new hooks

Move the 1Hz timer and the status-map computation out of `LivePanes` so the pane structure no longer rerenders on every tick. Also: add a `setStatusOverride` callback so `closePane` / `freezeToggle` can still write into the map. Existing `LivePanes` tests must keep passing.

**Files:**
- Modify: `src/components/live/LivePanes.tsx`
- Modify: `src/components/live/useStatusMap.ts` (add overrides parameter)

- [ ] **Step 1: Extend `useStatusMap` to accept manual overrides**

Edit `src/components/live/useStatusMap.ts` to take an `overrides` map and an `overridesVersion` number that bumps whenever overrides change:

```ts
// signature becomes:
export function useStatusMap(
  entries: Entry[],
  keyToFileId: Map<string, string>,
  subagentMtimes: Record<string, string>,
  userClosedKeys: Set<string>,
  overrides: Record<string, PaneState>,
  intervalMs: number = TICK_MS,
): Record<string, PaneState>
```

Inside the `useMemo`, after computing the natural status for `e.key`, override it if `overrides[e.key]` is set:

```ts
const computed = userClosedKeys.has(e.key)
  ? ({ status: 'closed' as const, closingStartedAt: null, frozenAt: null, frozenRemainingMs: null })
  : nextPaneStatus(prevState, lastUpdatedMs, nowMs);
next[e.key] = overrides[e.key] ?? computed;
```

Add `overrides` to the memo's dependency list.

- [ ] **Step 2: Update Task 2 tests for the new signature**

Open `tests/unit/live/useStatusMap.test.ts`. For each `renderHook` call, add an empty `{}` overrides argument after `userClosed`. Add one new case asserting that overrides take precedence:

```ts
it('honors explicit overrides over derived state', () => {
  const entries: Entry[] = [{ key: 'a' }];
  const keyToFileId = new Map([['a', 'fa']]);
  const mtimes = { fa: '2026-05-24T12:00:00Z' };
  const userClosed = new Set<string>();
  const overrides = {
    a: { status: 'frozen' as const, closingStartedAt: null, frozenAt: 0, frozenRemainingMs: 5000 },
  };
  const { result } = renderHook(() =>
    useStatusMap(entries, keyToFileId, mtimes, userClosed, overrides, TICK)
  );
  expect(result.current.a.status).toBe('frozen');
});
```

- [ ] **Step 3: Run the hook tests to verify they pass**

Run: `npm test -- tests/unit/live/useStatusMap.test.ts`
Expected: PASS (now five cases).

- [ ] **Step 4: Refactor `LivePanes` to use the hooks**

Edit `src/components/live/LivePanes.tsx`:

1. Remove these from the top of the function body:
   - `const [statusMap, setStatusMap] = useState<...>({});`
   - `const [nowMs, setNowMs] = useState(Date.now());`
   - `const intervalRef = useRef<...>(null);`
   - The `useEffect` that runs `setInterval(() => setNowMs(Date.now()), TICK_MS)`.
   - The `useEffect` that derives `statusMap` from `nowMs`.

2. Replace them with:

```ts
import { useNowMs } from './useNowMs';
import { useStatusMap } from './useStatusMap';
// ...
const nowMs = useNowMs(TICK_MS);
const [statusOverrides, setStatusOverrides] = useState<Record<string, PaneState>>({});
const statusMap = useStatusMap(
  subagentEntries, keyToFileId, subagentMtimes, userClosedKeys, statusOverrides
);
```

3. Update `closePane`:

```ts
function closePane(key: string): void {
  setUserClosedKeys((prev) => { const next = new Set(prev); next.add(key); return next; });
  // userClosedKeys path in useStatusMap will produce the closed state automatically;
  // no override needed here.
}
```

4. Update `freezeToggle` to write into `statusOverrides` instead of `setStatusMap`:

```ts
function freezeToggle(key: string): void {
  const current = statusMap[key];
  if (!current) return;
  if (current.status === 'frozen') {
    const newClosingStartedAt = nowMs - (CLOSING_MS - (current.frozenRemainingMs ?? CLOSING_MS));
    setStatusOverrides((prev) => ({
      ...prev,
      [key]: { ...current, status: 'closing', frozenAt: null, frozenRemainingMs: null, closingStartedAt: newClosingStartedAt },
    }));
  } else if (current.status === 'closing') {
    const elapsed = nowMs - (current.closingStartedAt ?? nowMs);
    const remaining = Math.max(0, CLOSING_MS - elapsed);
    setStatusOverrides((prev) => ({
      ...prev,
      [key]: { ...current, status: 'frozen', frozenAt: nowMs, frozenRemainingMs: remaining },
    }));
  }
}
```

5. When `session.id` changes, also clear `statusOverrides`:

```ts
useEffect(() => {
  mainFittedRef.current = false;
  mainCameraRef.current = null;
  setUserClosedKeys(new Set());
  setStatusOverrides({});
}, [session.id]);
```

- [ ] **Step 5: Run all unit tests to make sure existing LivePanes tests still pass**

Run: `npm test`
Expected: all pass. In particular, `tests/unit/components/LivePanes.test.tsx` cases (N=1, N=3, 30s→closing→closed, hides stale subagents) still pass with identical outcomes.

- [ ] **Step 6: Commit**

```bash
git add src/components/live/LivePanes.tsx src/components/live/useStatusMap.ts tests/unit/live/useStatusMap.test.ts
git commit -m "refactor(live): drive LivePanes status from useNowMs/useStatusMap

Removes the 1Hz parent rerender. Pane structure now rerenders only
when subagent membership or session changes. Existing behavioral
tests unchanged."
```

---

## Task 4: Unify N=1 vs N≥2 render paths in `LivePanes`

Today `LivePanes` early-returns a completely different DOM tree when `total === 1`. Each flip remounts the MAIN canvas, which is the most visible flicker. Goal: render the same wrapper structure regardless of N. The MAIN `<LivePane>` lives in the same JSX position; chrome differences become props.

**Files:**
- Modify: `src/components/live/LivePanes.tsx`

- [ ] **Step 1: Add a sentinel test asserting MAIN survives the N transition**

Open `tests/unit/components/LivePanes.test.tsx` and add:

```ts
it('preserves the MAIN <svg> DOM identity when N flips between 1 and 2+', () => {
  const session = makeSession([m('a')], [
    { id: 'agent-aaaa1111', lastUpdatedAt: '2026-05-24T12:00:00Z', root: m('s1') },
  ]);
  const { rerender, container } = render(
    <LivePanes
      session={session}
      subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }}
      onToggleLive={() => {}}
    />
  );
  // N=2: capture the MAIN pane's <svg>
  const mainPaneN2 = container.querySelector('[data-testid="live-pane"]');
  const svgN2 = mainPaneN2!.querySelector('svg');
  expect(svgN2).not.toBeNull();

  // Advance 61s so the lone subagent closes → N=1
  act(() => { vi.advanceTimersByTime(61_000); });
  rerender(
    <LivePanes
      session={session}
      subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }}
      onToggleLive={() => {}}
    />
  );
  const mainPaneN1 = container.querySelector('[data-testid="live-pane"]');
  const svgN1 = mainPaneN1!.querySelector('svg');
  // Same DOM node — no remount.
  expect(svgN1).toBe(svgN2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/components/LivePanes.test.tsx`
Expected: the new case FAILs (`svgN1` differs from `svgN2` because the N=1 short-circuit returns a different tree).

- [ ] **Step 3: Refactor `LivePanes` render**

Replace the function's render section (everything after `closePane` / `freezeToggle`) with a single grid that handles both N=1 and N≥2:

```tsx
const isSolo = total === 1;
const gridColumns = isSolo ? '1fr' : '1fr 1fr';

return (
  <div style={outerStyle}>
    <CanvasToolbar
      showLive={true}
      liveEngaged={true}
      onToggleLive={onToggleLive}
      showFit={isSolo}
      onFit={() => mainCameraRef.current?.fit()}
      showFollow={false}
      follow={false}
      onToggleFollow={() => {}}
    />
    <div
      data-testid="live-panes-grid"
      data-n={total}
      data-fullscreen={isSolo ? 'true' : 'false'}
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: gridColumns,
        gap: isSolo ? 0 : 12,
        background: isSolo ? 'transparent' : 'rgba(0,229,255,0.05)',
        minHeight: 0,
      }}
    >
      <LivePane
        kind="main"
        label="MAIN"
        root={mainRoot}
        cwd={session.cwd}
        paneId="main"
        borderless={isSolo}
        onCameraReady={(api) => { mainCameraRef.current = api; }}
      />
      {displayable.map((e, idx) => {
        const isLastOdd = total % 2 === 1 && idx === displayable.length - 1;
        const fileId = keyToFileId.get(e.key) ?? e.key;
        const status = statusMap[e.key];
        const closingSeconds = status ? remainingSeconds(status, nowMs) : null;
        const frozen = status?.status === 'frozen';
        const showCountdown = status && (status.status === 'closing' || status.status === 'frozen');
        return (
          <div key={e.key} style={isLastOdd ? lastSpanStyle : undefined}>
            <LivePane
              kind="subagent"
              label={subagentLabel(fileId)}
              root={e.root}
              cwd={session.cwd}
              paneId={e.key}
              closingSeconds={showCountdown ? closingSeconds : null}
              frozen={frozen}
              onToggleFreeze={() => freezeToggle(e.key)}
              onClose={() => closePane(e.key)}
            />
          </div>
        );
      })}
    </div>
  </div>
);
```

Delete the old `if (total === 1) return …` block and the `gridStyle`/`fullscreenStyle` helpers (they're inlined above). Keep `lastSpanStyle`.

- [ ] **Step 4: Run all LivePanes tests to verify they pass**

Run: `npm test -- tests/unit/components/LivePanes.test.tsx`
Expected: all six cases pass (the original five plus the new identity-preservation case).

- [ ] **Step 5: Commit**

```bash
git add src/components/live/LivePanes.tsx tests/unit/components/LivePanes.test.tsx
git commit -m "refactor(live): unify N=1 / N>=2 render path; MAIN canvas no longer remounts

Both branches now render the same JSX with a single grid container.
Chrome differences (gap, background, borderless MAIN) become inline
props. Adds a test asserting MAIN <svg> DOM identity persists across
N transitions."
```

---

## Task 5: `React.memo` for `EdgePath`

`EdgePath` rerenders today on every parent render. With stable layout arrays (from later tasks) and primitive props, shallow equality is correct.

**Files:**
- Modify: `src/components/EdgePath.tsx`

- [ ] **Step 1: Wrap the component**

Edit `src/components/EdgePath.tsx`. Replace `export function EdgePath(...)` with:

```ts
import { memo } from 'react';
// ...
export const EdgePath = memo(function EdgePath({ edge, state, progress, inSubagent, freshness = 1 }: Props) {
  // body unchanged
});
```

(All existing logic stays; only the export wrapper changes.)

- [ ] **Step 2: Run all unit tests**

Run: `npm test`
Expected: all pass (no behavioral change).

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/EdgePath.tsx
git commit -m "perf(graph): memoize EdgePath"
```

---

## Task 6: `React.memo` for `NodeShape`

**Files:**
- Modify: `src/components/NodeShape.tsx`

- [ ] **Step 1: Wrap the component**

Edit `src/components/NodeShape.tsx`. Replace `export function NodeShape(...)` with:

```ts
import { memo } from 'react';
// ...
export const NodeShape = memo(function NodeShape({ node, state, inSubagent, pinned, showContextBadge }: Props) {
  // body unchanged
});
```

- [ ] **Step 2: Run all unit tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/NodeShape.tsx
git commit -m "perf(graph): memoize NodeShape"
```

---

## Task 7: `useCallback` audit for memoized children

For `React.memo` to hit, the callbacks passed from `GraphCanvas` into `EdgePath`/`NodeShape`'s parent `<g onClick=…>` must be stable. `EdgePath` doesn't receive callbacks (it's pure SVG). `NodeShape` doesn't receive callbacks (its parent `<g>` carries the click handler).

The relevant callbacks are the ones flowing into `LivePane` from `LivePanes` (`onCameraReady`, `onClose`, `onToggleFreeze`). These need to be stable per pane key so a future memoization of `LivePane` would hit.

**Files:**
- Modify: `src/components/live/LivePanes.tsx`

- [ ] **Step 1: Replace inline callbacks with stable per-key handlers**

Inside `LivePanes`, define stable handlers via `useCallback` keyed on the pane key:

```ts
import { useCallback } from 'react';
// ...
const closePaneByKey = useCallback((key: string) => {
  setUserClosedKeys((prev) => { const next = new Set(prev); next.add(key); return next; });
}, []);

const freezeToggleByKey = useCallback((key: string) => {
  // body of freezeToggle, but parameterized
  setStatusOverrides((prev) => {
    const current = statusMapRef.current[key];
    if (!current) return prev;
    if (current.status === 'frozen') {
      const newClosingStartedAt = Date.now() - (CLOSING_MS - (current.frozenRemainingMs ?? CLOSING_MS));
      return {
        ...prev,
        [key]: { ...current, status: 'closing', frozenAt: null, frozenRemainingMs: null, closingStartedAt: newClosingStartedAt },
      };
    }
    if (current.status === 'closing') {
      const elapsed = Date.now() - (current.closingStartedAt ?? Date.now());
      const remaining = Math.max(0, CLOSING_MS - elapsed);
      return {
        ...prev,
        [key]: { ...current, status: 'frozen', frozenAt: Date.now(), frozenRemainingMs: remaining },
      };
    }
    return prev;
  });
}, []);
```

Add a ref to track the latest `statusMap` so `freezeToggleByKey` reads current state without being recreated each render:

```ts
const statusMapRef = useRef(statusMap);
useEffect(() => { statusMapRef.current = statusMap; }, [statusMap]);
```

Also memoize `onCameraReady`:

```ts
const handleMainCameraReady = useCallback((api: CameraApi) => {
  mainCameraRef.current = api;
}, []);
```

Replace inline callbacks in the JSX:

```tsx
<LivePane
  // ...
  onCameraReady={handleMainCameraReady}
/>
// ...
<LivePane
  // ...
  onToggleFreeze={() => freezeToggleByKey(e.key)}
  onClose={() => closePaneByKey(e.key)}
/>
```

The remaining `() => freezeToggleByKey(e.key)` closures are recreated each render but they only flow into non-memoized `LivePane`, so this is not a hit-cost regression. We deliberately stop short of memoizing `LivePane` itself in this plan — that's a separate evaluation. The stability we gain here is on `handleMainCameraReady` (which the MAIN pane receives every render and which previously caused a `useEffect` ping in `GraphCanvas`).

- [ ] **Step 2: Run all unit tests**

Run: `npm test`
Expected: all pass (no behavioral change).

- [ ] **Step 3: Commit**

```bash
git add src/components/live/LivePanes.tsx
git commit -m "perf(live): stabilize MAIN onCameraReady + per-key pane handlers"
```

---

## Task 8: Layout fingerprint cache

Stable layout identity across LIVE polls. WeakMap by root ref + LRU by fingerprint.

**Files:**
- Modify: `src/graph/layout.ts`
- Test: `tests/unit/graph/layoutCache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/graph/layoutCache.test.ts
import { describe, it, expect } from 'vitest';
import { layoutTree, _resetLayoutCacheForTests } from '../../../src/graph/layout';
import type { Milestone } from '../../../src/parse/types';

function ms(id: string, kind: Milestone['kind'] = 'tool_call', children: Milestone[] = []): Milestone {
  return { id, kind, label: id, summary: id, timestamp: '', failed: false, raw: null, children };
}

function clone(node: Milestone): Milestone {
  return { ...node, children: node.children.map(clone) };
}

describe('layoutTree cache', () => {
  beforeEach(() => { _resetLayoutCacheForTests(); });

  it('returns the same LayoutResult object identity for the same root ref', () => {
    const root = ms('a', 'tool_call', [ms('b'), ms('c')]);
    const r1 = layoutTree(root);
    const r2 = layoutTree(root);
    expect(r2).toBe(r1);
    expect(r2.nodes).toBe(r1.nodes);
    expect(r2.edges).toBe(r1.edges);
  });

  it('returns the same identity for structurally identical but cloned roots', () => {
    const root = ms('a', 'tool_call', [ms('b'), ms('c')]);
    const cloned = clone(root);
    const r1 = layoutTree(root);
    const r2 = layoutTree(cloned);
    expect(r2).toBe(r1);
  });

  it('returns a different identity when structure changes', () => {
    const r1 = layoutTree(ms('a', 'tool_call', [ms('b')]));
    const r2 = layoutTree(ms('a', 'tool_call', [ms('b'), ms('c')]));
    expect(r2).not.toBe(r1);
  });

  it('returns a different identity when a node kind changes', () => {
    const r1 = layoutTree(ms('a', 'tool_call', [ms('b', 'tool_call')]));
    const r2 = layoutTree(ms('a', 'tool_call', [ms('b', 'subagent_spawn')]));
    expect(r2).not.toBe(r1);
  });

  it('evicts old entries past the LRU cap (smoke)', () => {
    // Make 17 unique trees; the first should be evicted by the 17th insert.
    const trees: Milestone[] = [];
    for (let i = 0; i < 17; i++) trees.push(ms(`root-${i}`));
    const first = trees[0];
    const r1 = layoutTree(first);
    for (let i = 1; i < 17; i++) layoutTree(trees[i]);
    // Re-querying with a cloned `first` should NOT return r1 anymore (evicted).
    const r1Again = layoutTree(clone(first));
    expect(r1Again).not.toBe(r1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/graph/layoutCache.test.ts`
Expected: FAIL (`_resetLayoutCacheForTests` not exported; `layoutTree` returns fresh object each call).

- [ ] **Step 3: Update `layout.ts` with cache**

Edit `src/graph/layout.ts`:

```ts
import { hierarchy, tree as d3tree } from 'd3';
import type { Milestone } from '../parse/types';

export type LaidOutNode = {
  id: string;
  milestone: Milestone;
  x: number;
  y: number;
  depth: number;
};

export type LaidOutEdge = {
  sourceId: string;
  targetId: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
};

export type LayoutResult = {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
};

const NODE_X_SPACING = 140;
const NODE_Y_SPACING = 110;
const LRU_CAP = 16;

// Reference cache: same root identity always hits.
const refCache = new WeakMap<Milestone, { fingerprint: string; result: LayoutResult }>();

// Fingerprint cache: bounded LRU keyed by structural hash. Map iteration order
// is insertion order; deleting and re-inserting moves an entry to the tail.
const fpCache = new Map<string, LayoutResult>();

function fingerprint(root: Milestone): string {
  const parts: string[] = [];
  function walk(n: Milestone, parentId: string): void {
    parts.push(`${n.id}|${n.kind}|${parentId}|${n.children.length}`);
    for (const c of n.children) walk(c, n.id);
  }
  walk(root, '');
  return parts.join(';');
}

function rememberFp(fp: string, result: LayoutResult): void {
  if (fpCache.has(fp)) fpCache.delete(fp); // move to tail
  fpCache.set(fp, result);
  while (fpCache.size > LRU_CAP) {
    const oldestKey = fpCache.keys().next().value;
    if (oldestKey === undefined) break;
    fpCache.delete(oldestKey);
  }
}

function computeLayout(root: Milestone): LayoutResult {
  const h = hierarchy<Milestone>(root, (d) => d.children);
  const layout = d3tree<Milestone>().nodeSize([NODE_X_SPACING, NODE_Y_SPACING]);
  const laid = layout(h);

  const nodes: LaidOutNode[] = [];
  const edges: LaidOutEdge[] = [];
  let minX = Infinity, maxX = -Infinity, maxY = -Infinity;

  laid.each((d) => {
    nodes.push({ id: d.data.id, milestone: d.data, x: d.x, y: d.y, depth: d.depth });
    if (d.x < minX) minX = d.x;
    if (d.x > maxX) maxX = d.x;
    if (d.y > maxY) maxY = d.y;
  });

  laid.eachBefore((d) => {
    if (!d.parent) return;
    edges.push({
      sourceId: d.parent.data.id,
      targetId: d.data.id,
      sourceX: d.parent.x,
      sourceY: d.parent.y,
      targetX: d.x,
      targetY: d.y,
    });
  });

  const xShift = -minX + 60;
  for (const n of nodes) n.x += xShift;
  for (const e of edges) {
    e.sourceX += xShift;
    e.targetX += xShift;
  }

  return {
    nodes,
    edges,
    width: (maxX - minX) + 120,
    height: maxY + 120,
  };
}

export function layoutTree(root: Milestone): LayoutResult {
  // 1. Reference cache hit?
  const ref = refCache.get(root);
  if (ref) return ref.result;

  // 2. Fingerprint match?
  const fp = fingerprint(root);
  const cached = fpCache.get(fp);
  if (cached) {
    refCache.set(root, { fingerprint: fp, result: cached });
    rememberFp(fp, cached); // bump to tail
    return cached;
  }

  // 3. Miss — compute, cache, return.
  const result = computeLayout(root);
  refCache.set(root, { fingerprint: fp, result });
  rememberFp(fp, result);
  return result;
}

/** Test-only escape hatch. Do not call from production code. */
export function _resetLayoutCacheForTests(): void {
  fpCache.clear();
  // WeakMap can't be iterated; rely on tests building fresh roots.
}
```

- [ ] **Step 4: Run the cache tests**

Run: `npm test -- tests/unit/graph/layoutCache.test.ts`
Expected: PASS (all five cases).

- [ ] **Step 5: Run the existing `tests/unit/graph/layout.test.ts`**

Run: `npm test -- tests/unit/graph/layout.test.ts`
Expected: all four existing layout cases still pass.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/graph/layout.ts tests/unit/graph/layoutCache.test.ts
git commit -m "perf(graph): cache layoutTree by structural fingerprint

WeakMap on root ref + bounded LRU (16) on (id|kind|parent|child-count)
fingerprint. LIVE refetches that produce structurally identical
trees now reuse the prior LayoutResult identity, stabilizing all
downstream memos in GraphCanvas."
```

---

## Task 9: Stabilize downstream memo keys in `GraphCanvas`

Now that `layout` identity is stable across polls, point `taintedIds` and `subagentRegions` at the layout (or the layout's root) rather than the whole `session`.

**Files:**
- Modify: `src/components/GraphCanvas.tsx`

- [ ] **Step 1: Change memo dep keys**

Open `src/components/GraphCanvas.tsx`. Replace these two memos:

```ts
const subagentRegions = useMemo(
  () => hideSubagentRegions ? [] : computeSubagentRegions(session.root, layout.nodes),
  [session, layout, hideSubagentRegions]
);
const taintedIds = useMemo(() => collectTaintedIds(session.root), [session]);
```

With:

```ts
const subagentRegions = useMemo(
  () => hideSubagentRegions ? [] : computeSubagentRegions(session.root, layout.nodes),
  [session.root, layout, hideSubagentRegions]
);
const taintedIds = useMemo(() => collectTaintedIds(session.root), [session.root]);
```

The dep change from `session` to `session.root`: when LIVE refetch produces a new `Session` object whose `root` is the same Milestone tree by reference (it won't be, today — but with Task 8's caching downstream, the layout is stable and the `root` reference may also be reused if `parseSession` is later optimized). Today `session.root` IS a new ref each poll, so this change is a no-op behaviorally. It's a forward compatibility nudge — and keeping these memos clearly keyed on `root` makes the dependency intent unambiguous.

- [ ] **Step 2: Run all unit tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/GraphCanvas.tsx
git commit -m "perf(graph): narrow taintedIds/subagentRegions memo deps to session.root"
```

---

## Task 10: Viewport culling math

Pure helpers, no React. Test thoroughly so the rendering wiring (Task 11) can lean on them.

**Files:**
- Create: `src/graph/viewport.ts`
- Test: `tests/unit/graph/viewport.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/graph/viewport.test.ts
import { describe, it, expect } from 'vitest';
import { visibleLayoutRect, nodeInRect, edgeIntersectsRect, type Rect } from '../../../src/graph/viewport';

describe('visibleLayoutRect', () => {
  it('translates screen viewport to layout coordinates at k=1, x=y=0', () => {
    const r = visibleLayoutRect({ k: 1, x: 0, y: 0 }, { width: 800, height: 600 }, 0);
    expect(r).toEqual({ minX: 0, minY: 0, maxX: 800, maxY: 600 });
  });

  it('accounts for a pan', () => {
    // Pan right 200 (transform.x = 200) shifts visible layout LEFT by 200.
    const r = visibleLayoutRect({ k: 1, x: 200, y: 0 }, { width: 800, height: 600 }, 0);
    expect(r.minX).toBe(-200);
    expect(r.maxX).toBe(600);
  });

  it('accounts for zoom-out', () => {
    // k=0.5 means each layout unit covers 0.5 screen px → visible layout is 2× viewport.
    const r = visibleLayoutRect({ k: 0.5, x: 0, y: 0 }, { width: 800, height: 600 }, 0);
    expect(r).toEqual({ minX: 0, minY: 0, maxX: 1600, maxY: 1200 });
  });

  it('expands by margin', () => {
    const r = visibleLayoutRect({ k: 1, x: 0, y: 0 }, { width: 800, height: 600 }, 200);
    expect(r).toEqual({ minX: -200, minY: -200, maxX: 1000, maxY: 800 });
  });
});

describe('nodeInRect', () => {
  const rect: Rect = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  it('keeps a node strictly inside', () => {
    expect(nodeInRect({ x: 50, y: 50 }, rect)).toBe(true);
  });
  it('keeps a node on the edge', () => {
    expect(nodeInRect({ x: 0, y: 0 }, rect)).toBe(true);
    expect(nodeInRect({ x: 100, y: 100 }, rect)).toBe(true);
  });
  it('drops a node outside', () => {
    expect(nodeInRect({ x: 200, y: 50 }, rect)).toBe(false);
    expect(nodeInRect({ x: 50, y: -10 }, rect)).toBe(false);
  });
});

describe('edgeIntersectsRect', () => {
  const rect: Rect = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  it('keeps edges with both endpoints inside', () => {
    expect(edgeIntersectsRect({ sourceX: 10, sourceY: 10, targetX: 90, targetY: 90 }, rect)).toBe(true);
  });
  it('keeps edges with one endpoint inside', () => {
    expect(edgeIntersectsRect({ sourceX: 10, sourceY: 10, targetX: 200, targetY: 90 }, rect)).toBe(true);
  });
  it('keeps edges whose AABB crosses the rect even if both endpoints are outside', () => {
    // Endpoints at (-50, 50) and (150, 50). AABB is x:[-50,150] y:[50,50] which overlaps x:[0,100].
    expect(edgeIntersectsRect({ sourceX: -50, sourceY: 50, targetX: 150, targetY: 50 }, rect)).toBe(true);
  });
  it('drops edges whose AABB is entirely outside', () => {
    expect(edgeIntersectsRect({ sourceX: 200, sourceY: 200, targetX: 300, targetY: 300 }, rect)).toBe(false);
    expect(edgeIntersectsRect({ sourceX: -50, sourceY: -50, targetX: -10, targetY: -10 }, rect)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/graph/viewport.test.ts`
Expected: FAIL with "Cannot find module ... viewport".

- [ ] **Step 3: Implement the helpers**

```ts
// src/graph/viewport.ts
export type Rect = { minX: number; minY: number; maxX: number; maxY: number };
export type Transform = { k: number; x: number; y: number };
export type Viewport = { width: number; height: number };

/** Returns the layout-space rectangle currently visible on screen given a
 *  zoom transform and viewport, expanded by `margin` layout units on each
 *  side. */
export function visibleLayoutRect(t: Transform, v: Viewport, margin: number): Rect {
  return {
    minX: (0          - t.x) / t.k - margin,
    minY: (0          - t.y) / t.k - margin,
    maxX: (v.width    - t.x) / t.k + margin,
    maxY: (v.height   - t.y) / t.k + margin,
  };
}

/** Inclusive on edges. Node footprints are small enough that a centre-only
 *  test plus the viewport margin is sufficient. */
export function nodeInRect(n: { x: number; y: number }, r: Rect): boolean {
  return n.x >= r.minX && n.x <= r.maxX && n.y >= r.minY && n.y <= r.maxY;
}

/** AABB-vs-rect: cheap and correct for the curved edges we draw (their
 *  bounding box is the rectangle spanned by endpoints). */
export function edgeIntersectsRect(
  e: { sourceX: number; sourceY: number; targetX: number; targetY: number },
  r: Rect
): boolean {
  const eMinX = Math.min(e.sourceX, e.targetX);
  const eMaxX = Math.max(e.sourceX, e.targetX);
  const eMinY = Math.min(e.sourceY, e.targetY);
  const eMaxY = Math.max(e.sourceY, e.targetY);
  return eMaxX >= r.minX && eMinX <= r.maxX && eMaxY >= r.minY && eMinY <= r.maxY;
}
```

- [ ] **Step 4: Run viewport tests**

Run: `npm test -- tests/unit/graph/viewport.test.ts`
Expected: PASS (all eleven cases).

- [ ] **Step 5: Commit**

```bash
git add src/graph/viewport.ts tests/unit/graph/viewport.test.ts
git commit -m "feat(graph): viewport culling math helpers"
```

---

## Task 11: Wire viewport culling into `GraphCanvas`

**Files:**
- Modify: `src/components/GraphCanvas.tsx`

- [ ] **Step 1: Import the helpers**

Top of file, with the other graph imports:

```ts
import { visibleLayoutRect, nodeInRect, edgeIntersectsRect } from '../graph/viewport';
```

- [ ] **Step 2: Compute visible sets via memo**

After `const subagentRegions = useMemo(...)` (Task 9 area), add:

```ts
const VIEWPORT_MARGIN = 200;

const visibleRect = useMemo(
  () => visibleLayoutRect(
    { k: transform.k, x: transform.x, y: transform.y },
    { width: viewport.width, height: viewport.height },
    VIEWPORT_MARGIN
  ),
  [transform.k, transform.x, transform.y, viewport.width, viewport.height]
);

const visibleNodes = useMemo(() => {
  const keep = layout.nodes.filter((n) => nodeInRect(n, visibleRect) || n.id === currentId);
  return keep;
}, [layout.nodes, visibleRect, currentId]);

const visibleEdges = useMemo(
  () => layout.edges.filter((e) => edgeIntersectsRect(e, visibleRect)),
  [layout.edges, visibleRect]
);

const visibleSubagentRegions = useMemo(
  () => subagentRegions.filter((r) =>
    edgeIntersectsRect(
      { sourceX: r.x, sourceY: r.y, targetX: r.x + r.width, targetY: r.y + r.height },
      visibleRect
    )
  ),
  [subagentRegions, visibleRect]
);
```

Note: `currentId` is referenced inside `visibleNodes` to always keep the playhead node in the rendered set even if it briefly leaves the visible rect.

- [ ] **Step 3: Use visible sets in the render**

In the JSX, replace these:

```tsx
{subagentRegions.map(...)}
{layout.edges.map(...)}
{layout.nodes.map(...)}
```

with:

```tsx
{visibleSubagentRegions.map(...)}
{visibleEdges.map(...)}
{visibleNodes.map(...)}
```

The rest of the map bodies stay identical.

- [ ] **Step 4: Run all unit tests**

Run: `npm test`
Expected: all pass. Existing `GraphCanvas`-touching tests render against a small layout where every node is inside the default viewport rect, so culling is a no-op for them.

- [ ] **Step 5: Manual smoke**

Run: `npm run dev`. Load a session with at least 20 nodes. Pan around to confirm: when nodes scroll off-screen, the SVG still renders the visible ones; nodes near the edge of the viewport don't pop in/out at slow pan speeds (the 200px margin is generous).

- [ ] **Step 6: Commit**

```bash
git add src/components/GraphCanvas.tsx
git commit -m "perf(graph): cull off-camera nodes/edges/regions before render"
```

---

## Task 12: Filter consolidation — group-level filter cohorts

Move `filter="url(#tg-glow)"` and `filter="url(#tg-glow-soft)"` from per-element to group-level. Partition visible nodes/edges into cohorts by which filter they want; render each cohort in its own `<g filter="...">`.

**Files:**
- Modify: `src/components/EdgePath.tsx`
- Modify: `src/components/NodeShape.tsx`
- Modify: `src/components/GraphCanvas.tsx`

- [ ] **Step 1: Drop the `filter` attribute from `EdgePath`**

In `src/components/EdgePath.tsx`, remove the `filter` prop on the `<path>` element. The `filterUrl` variable and its computation can be deleted.

After:

```tsx
return (
  <path
    d={d}
    fill="none"
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeDasharray={dasharray}
    strokeDashoffset={dashOffset}
    opacity={opacity}
    style={animatedStyle}
  />
);
```

Add an exported helper on the same file to classify which filter cohort an edge belongs in:

```ts
export type EdgeFilterCohort = 'glow' | 'softglow';
export function edgeFilterCohort(state: 'idle' | 'drawing' | 'done' | 'pruned'): EdgeFilterCohort {
  return (state === 'pruned' || state === 'idle') ? 'softglow' : 'glow';
}
```

- [ ] **Step 2: Drop the `filter` attribute from `NodeShape`**

In `src/components/NodeShape.tsx`, remove the `filter={useGlow ? 'url(#tg-glow)' : undefined}` on the main `<path>` and the inline `filter: 'url(#tg-glow)'` style on the pinned ring. Keep the `useGlow` calculation so it can drive the cohort classifier on the outside.

Add an exported helper:

```ts
export function nodeFilterCohort(state: 'idle' | 'active' | 'success' | 'failed' | 'pruned'): 'glow' | 'none' {
  return (state === 'active' || state === 'success') ? 'glow' : 'none';
}
```

The `failed` indicator circle keeps its `filter="url(#tg-glow)"` (it's a tiny element and matters visually). Leave it as-is.

- [ ] **Step 3: Partition visible nodes/edges into cohorts in `GraphCanvas`**

Import the helpers:

```ts
import { EdgePath, edgeFilterCohort } from './EdgePath';
import { NodeShape, nodeFilterCohort } from './NodeShape';
```

Replace the existing JSX for the rendered nodes/edges. Build per-cohort lists *while* computing each item's state — keep the state derivation identical to what's there today. Concretely, replace the two `.map(...)` blocks inside the `<g className="zoom-layer">` with four cohort groups:

```tsx
const renderedEdgesGlow: JSX.Element[] = [];
const renderedEdgesSoft: JSX.Element[] = [];
for (const e of visibleEdges) {
  const key = `${e.sourceId}->${e.targetId}`;
  const isTraversed = traversedIds.has(e.targetId);
  const isCurrent = key === traversedEdgeKey;
  const inSub = subagentIds.has(e.targetId);
  const pruned = taintedIds.has(e.targetId) && !traversedIds.has(e.targetId);
  const state =
    pruned ? 'pruned'
    : isCurrent && pausedAtNode ? 'done'
    : isCurrent ? 'drawing'
    : isTraversed ? 'done'
    : 'idle';
  const sourcePruned = taintedIds.has(e.sourceId) && !traversedIds.has(e.sourceId);
  const sourceState = sourcePruned ? 'pruned' : 'idle';
  if (isHidden(e.sourceId, sourceState) || isHidden(e.targetId, state)) continue;
  const targetIdx = orderIndex.get(e.targetId) ?? playback.index;
  const hopsBack = Math.max(0, playback.index - targetIdx);
  const freshness = state === 'done' ? Math.max(0.55, 1 - hopsBack * 0.07) : 1;
  const elem = (
    <EdgePath
      key={key}
      edge={e}
      state={state}
      progress={isCurrent ? playback.edgeProgress : isTraversed ? 1 : 0}
      inSubagent={inSub}
      freshness={freshness}
    />
  );
  (edgeFilterCohort(state) === 'glow' ? renderedEdgesGlow : renderedEdgesSoft).push(elem);
}

const renderedNodesGlow: JSX.Element[] = [];
const renderedNodesPlain: JSX.Element[] = [];
for (const n of visibleNodes) {
  const inSub = subagentIds.has(n.id);
  let state: 'idle' | 'active' | 'success' | 'failed' | 'pruned';
  if (n.id === currentId && !playback.finished) state = 'active';
  else if (n.milestone.failed) state = 'failed';
  else if (taintedIds.has(n.id)) state = 'pruned';
  else if (playback.finished && successIds.has(n.id)) state = 'success';
  else if (playback.finished && traversedIds.has(n.id)) state = 'success';
  else if (traversedIds.has(n.id)) state = 'success';
  else state = 'idle';
  if (isHidden(n.id, state)) continue;
  const isPinned = n.id === pinnedId;
  const isTraversed = traversedIds.has(n.id) || n.id === currentId;
  const showContextBadge = filters.showAllContext || isTraversed;
  const elem = (
    <g
      key={n.id}
      onMouseEnter={(ev) => handleNodeEnter(n.milestone, ev)}
      onMouseLeave={() => setHover(null)}
      onClick={(ev) => {
        ev.stopPropagation();
        const idx = orderIndex.get(n.id);
        if (idx != null) onScrubTo(idx);
        onPin(isPinned ? null : n.id);
      }}
      style={{ cursor: 'pointer' }}
    >
      <NodeShape node={n} state={state} inSubagent={inSub} pinned={isPinned} showContextBadge={showContextBadge} />
    </g>
  );
  (nodeFilterCohort(state) === 'glow' ? renderedNodesGlow : renderedNodesPlain).push(elem);
}
```

Then in the JSX, replace the body of `<g className="zoom-layer">`:

```tsx
<g className="zoom-layer" transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
  {visibleSubagentRegions.map((r, i) => (
    <rect
      key={`sg-region-${i}`}
      x={r.x} y={r.y} width={r.width} height={r.height}
      fill="var(--subagent-accent)" fillOpacity={0.05}
      stroke="var(--subagent-accent)" strokeOpacity={0.25}
      strokeWidth={1} rx={8}
      data-testid="subagent-region"
    />
  ))}
  <g data-cohort="edges-soft" filter="url(#tg-glow-soft)">{renderedEdgesSoft}</g>
  <g data-cohort="edges-glow" filter="url(#tg-glow)">{renderedEdgesGlow}</g>
  <g data-cohort="nodes-plain">{renderedNodesPlain}</g>
  <g data-cohort="nodes-glow" filter="url(#tg-glow)">{renderedNodesGlow}</g>
</g>
```

Order matters: glow cohorts come *after* their plain counterparts so the glow halos render on top of (or under, depending on z-stacking intent) plain content. The current per-element ordering puts everything in a single z-stack by source order; preserving exact visual order isn't possible across cohort splits, but the visual result is dominated by the glow filter's spread — overlap is imperceptible at the values used. This is the substitution mentioned in spec §1 / §6 — verify side-by-side in Task 16.

- [ ] **Step 4: Run all unit tests**

Run: `npm test`
Expected: all pass. (Tests assert on `data-testid`, presence of `<svg>`, text content — none assert on `filter` attribute placement.)

- [ ] **Step 5: Type-check**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Manual smoke**

Run: `npm run dev`. Confirm glows still appear around active/success nodes and done/drawing edges; idle and pruned edges still have the soft glow.

- [ ] **Step 7: Commit**

```bash
git add src/components/EdgePath.tsx src/components/NodeShape.tsx src/components/GraphCanvas.tsx
git commit -m "perf(graph): apply SVG filters at group level instead of per element

Splits the zoom layer into four filter cohorts (edges-soft,
edges-glow, nodes-plain, nodes-glow). Fewer filter regions for
the GPU to compose; same feGaussianBlur parameters → same visual
result."
```

---

## Task 13: Replace `filter` animation with opacity animation

Animating `filter: drop-shadow(...)` re-runs the paint shader every frame on every glowing element. Animate `opacity`/`stroke-opacity` instead — the static `filter` on the cohort group provides the glow; opacity oscillation provides the breathing.

**Files:**
- Modify: `src/index.css`
- Modify: `src/theme/live-pane.css` (no change — pane-level `box-shadow` keyframes stay)

- [ ] **Step 1: Update `index.css` keyframes**

Replace the existing keyframes:

```css
@keyframes tg-shimmer {
  0%, 100% { filter: drop-shadow(0 0 4px var(--node-success)); }
  50% { filter: drop-shadow(0 0 14px var(--node-success)); }
}

@keyframes tg-edge-pulse {
  0%, 100% {
    stroke-width: 4;
    filter: drop-shadow(0 0 4px var(--edge-trail));
  }
  50% {
    stroke-width: 5.5;
    filter: drop-shadow(0 0 12px var(--edge-trail));
  }
}

@keyframes tg-edge-trail {
  0%, 100% { filter: drop-shadow(0 0 2px var(--edge-trail)); }
  50%     { filter: drop-shadow(0 0 5px var(--edge-trail)); }
}
```

with:

```css
@keyframes tg-shimmer {
  0%, 100% { opacity: 0.88; }
  50%      { opacity: 1.0; }
}

@keyframes tg-edge-pulse {
  0%, 100% { stroke-width: 4;   stroke-opacity: 0.85; }
  50%      { stroke-width: 5.5; stroke-opacity: 1.0; }
}

@keyframes tg-edge-trail {
  0%, 100% { stroke-opacity: 0.88; }
  50%      { stroke-opacity: 1.0; }
}
```

The glow itself is now contributed by the group-level `filter="url(#tg-glow)"` (Task 12). The keyframe gives the breathing rhythm by oscillating opacity — a paint operation the browser can composite on the GPU without re-running the filter pipeline.

- [ ] **Step 2: Run all unit tests**

Run: `npm test`
Expected: all pass (CSS keyframe changes are not tested at the unit level).

- [ ] **Step 3: Manual side-by-side check**

Run: `npm run dev`. Open a session, start playback. Watch:
- Drawing edges (in-flight) — should still visibly pulse.
- Done edges (trail) — should have a subtle breathing rhythm.
- Success nodes — should shimmer.

Compare against the prior commit's behavior by checking out the previous commit in a second tab. The breathing should be present and rhythmically identical (3.2s / 1.2s / 2.4s respectively). The exact luminance curve will differ — verify it's indistinguishable to your eye.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "perf(graph): animate opacity instead of drop-shadow in glow keyframes

Static cohort-level filter provides the glow; opacity/stroke-opacity
oscillation provides the breathing. Same rhythm, far cheaper paint."
```

---

## Task 14: Camera follow throttling

RAF-debounce viewport-driven follow updates and skip when target is already centered (within 8px screen-space).

**Files:**
- Modify: `src/components/GraphCanvas.tsx`
- Test: `tests/unit/camera-follow.test.ts` (small, focused — see step 1)

- [ ] **Step 1: Write a focused test for the tolerance helper**

```ts
// tests/unit/camera-follow.test.ts
import { describe, it, expect } from 'vitest';
import { centerOnTransform } from '../../src/graph/useCamera';

// Helper test: verify our tolerance check uses screen-space distance.
function screenDistanceFromCenter(
  layoutPoint: { x: number; y: number },
  transform: { k: number; x: number; y: number },
  viewport: { width: number; height: number },
): number {
  const screenX = layoutPoint.x * transform.k + transform.x;
  const screenY = layoutPoint.y * transform.k + transform.y;
  const dx = screenX - viewport.width / 2;
  const dy = screenY - viewport.height / 2;
  return Math.sqrt(dx * dx + dy * dy);
}

describe('camera follow tolerance', () => {
  it('reports ~0 distance for a node already at the centered transform', () => {
    const pt = { x: 300, y: 200 };
    const viewport = { width: 800, height: 600 };
    const k = 1;
    const t = centerOnTransform(pt, viewport, k);
    expect(screenDistanceFromCenter(pt, t, viewport)).toBeLessThan(0.001);
  });

  it('reports a positive distance for an off-center node', () => {
    const pt = { x: 0, y: 0 };
    const viewport = { width: 800, height: 600 };
    const t = { k: 1, x: 0, y: 0 };
    expect(screenDistanceFromCenter(pt, t, viewport)).toBeCloseTo(500, 0); // sqrt(400^2+300^2)
  });
});
```

(This is a sanity check on the math we'll inline into `GraphCanvas`; we don't extract a separate function because it's used in exactly one place.)

- [ ] **Step 2: Run the test to confirm baseline**

Run: `npm test -- tests/unit/camera-follow.test.ts`
Expected: PASS.

- [ ] **Step 3: Add RAF-debounce + tolerance skip in `GraphCanvas`**

Find the existing follow effect in `src/components/GraphCanvas.tsx`:

```ts
useEffect(() => {
  if (!follow || !currentId) return;
  if (viewport.width <= 1 || viewport.height <= 1) return;
  const node = layout.nodes.find((n) => n.id === currentId);
  if (!node) return;
  centerOn({ x: node.x, y: node.y }, transform.k);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [currentId, follow, viewport.width, viewport.height]);
```

Replace with:

```ts
const followRafRef = useRef<number | null>(null);
useEffect(() => {
  if (!follow || !currentId) return;
  if (viewport.width <= 1 || viewport.height <= 1) return;
  const node = layout.nodes.find((n) => n.id === currentId);
  if (!node) return;

  // Cancel any pending follow tween scheduled in the same frame.
  if (followRafRef.current != null) cancelAnimationFrame(followRafRef.current);
  followRafRef.current = requestAnimationFrame(() => {
    followRafRef.current = null;
    // Tolerance: skip the tween if the node is already within 8 screen-px
    // of the viewport center at the current zoom.
    const screenX = node.x * transform.k + transform.x;
    const screenY = node.y * transform.k + transform.y;
    const dx = screenX - viewport.width / 2;
    const dy = screenY - viewport.height / 2;
    if (Math.sqrt(dx * dx + dy * dy) < 8) return;
    centerOn({ x: node.x, y: node.y }, transform.k);
  });

  return () => {
    if (followRafRef.current != null) {
      cancelAnimationFrame(followRafRef.current);
      followRafRef.current = null;
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [currentId, follow, viewport.width, viewport.height]);
```

- [ ] **Step 4: Run all unit tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Manual smoke**

Run: `npm run dev`. Open a session with `follow` on. Drag the sidebar resizer — the camera should track the active node smoothly without juddering or pile-up. Step through playback — follow tweens should land cleanly on each new node.

- [ ] **Step 6: Commit**

```bash
git add src/components/GraphCanvas.tsx tests/unit/camera-follow.test.ts
git commit -m "perf(camera): RAF-debounce follow updates + tolerance skip

Coalesces viewport-driven follow tweens into one per frame. Skips
the centerOn tween when the active node is already within 8 screen
pixels of viewport center. Eliminates judder during sidebar resize."
```

---

## Task 15: Final verification — visual side-by-side + perf trace

**Files:** none (verification only)

- [ ] **Step 1: Capture before/after screenshots**

Use the `verify` skill or run Playwright manually. Three states:

1. **Idle** — session opened, before playback. Glows on nodes and edges visible.
2. **Mid-playback** — pause the playback at ~30% through, drawing edge visible.
3. **LIVE with 2 subagents** — open a live session that has 2+ subagents firing.

Capture screenshots in two checkouts: `git checkout main && npm run dev` for "before", then `git checkout feat/perf-smoother-render && npm run dev` for "after". Use the same window size for both.

- [ ] **Step 2: Compare side-by-side**

Open the before/after pairs in an image viewer. Look for:
- Glow radius — must be visually equivalent.
- Animation rhythm — keyframe durations are unchanged (3.5s / 3.2s / 1.2s / 2.4s); breathing should feel identical.
- Node and edge silhouettes — pixel-identical.
- Pane chrome (cut corners, notches, header, close triangle) — pixel-identical.

Differences that are *acceptable* (per spec §1):
- Tiny opacity-curve differences during keyframe transitions (smooth gradients vs. blur-radius gradients) — should be imperceptible at glance.
- Z-order between cohort groups (glow cohort drawn on top of plain cohort within visible nodes) — glow spread is bigger than any node it could overlap, so user perception is the same.

If any difference is noticeable, **stop** and open a discussion with the user before merging.

- [ ] **Step 3: Capture a perf trace**

Open Chrome DevTools → Performance tab. Record a 10-second trace on:
1. Idle LIVE session with 2 panes (just open and watch the 7s poll fire).
2. Playback of a ~200-node session, 1× speed.

Note in the PR description:
- Avg frame time during playback (before vs after).
- Paint time per frame (before vs after).
- Scripting time per 7s LIVE poll (before vs after).

- [ ] **Step 4: Run the full test suite + type-check + E2E**

```bash
npm test
npm run typecheck
npm run test:e2e
```

Expected: all pass.

- [ ] **Step 5: Final commit (verification notes only, if any)**

If you wrote any notes or captured screenshots into a verification file, commit them. Otherwise skip.

```bash
# Only if verification artifacts exist:
git add docs/superpowers/verifications/2026-05-24-perf-smoother-render.md
git commit -m "docs(verification): perf-smoother-render before/after evidence"
```

- [ ] **Step 6: Hand off to user for merge decision**

Tell the user:
- Branch `feat/perf-smoother-render` is ready.
- All unit + E2E tests pass; type-check clean.
- Visual side-by-side is indistinguishable (or list any deltas).
- Perf trace numbers (frame time, paint time, LIVE poll scripting time) attached.

Do **not** merge to main without explicit user authorization (per the project's git workflow).

---

## End-of-plan checklist

When all tasks are done:

- [ ] All unit tests green: `npm test`
- [ ] Type-check clean: `npm run typecheck`
- [ ] E2E tests green: `npm run test:e2e`
- [ ] Visual side-by-side verified by the user (Task 15 step 2)
- [ ] Perf trace numbers captured in the PR description
- [ ] Branch ready for user-authorized merge to `main`