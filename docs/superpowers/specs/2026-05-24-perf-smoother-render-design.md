# ThoughtGraph Performance — Smoother & Lighter Rendering

**Branch:** `feat/perf-smoother-render`
**Date:** 2026-05-24
**Scope:** Reduce render and paint cost across the app, with particular attention to LIVE mode flicker and large-session playback chop. Preserve visuals exactly — no animation removed, no glow softened.

---

## 1. Goals & non-goals

### Goals
- Eliminate visible flicker on LIVE when subagents appear/disappear and on every 7s poll.
- Hold ≥55fps on playback for sessions up to ~500 milestones on commodity laptop hardware.
- Reduce idle CPU when LIVE is up but nothing is changing.
- Pixel-identical visuals: same glows, animations, breathing, shimmers — no exceptions.

### Non-goals
- No rendering-stack rewrite (SVG stays SVG; no canvas/WebGL).
- No incremental parser / structural sharing on the API layer (deferred — would be a follow-up).
- No UX, keyboard, or feature changes.

### Success criteria
- LIVE pane transitions (N=1 ↔ N≥2, subagent close/freeze) cause zero canvas remounts and no visible blank frame.
- Profiling a 200-node session shows `EdgePath`/`NodeShape` components rerendering only when their own props change, not on every RAF tick.
- Browser performance trace shows paint time per frame down ~40–60% at large N (target, to be confirmed via measurement).

---

## 2. Root causes (what we observed in the code today)

Three load sources stack up at once in LIVE mode:

1. **Session refetch cascade.** `useSession` refetches every `POLL_MS = 7000ms` in LIVE. `parseSession` always returns a brand-new `Session` tree. Every memo keyed on `session` re-fires: `buildMainRoot`, `spawnNodes`, `subagentEntries`, `layoutTree` (d3 tree on the whole tree), `taintedIds`, `subagentRegions`. With multiple panes each running their own `GraphCanvas`, this multiplies.
2. **1Hz ticker re-rendering pane structure.** `LivePanes` owns `nowMs` state and updates it every second via `setInterval(TICK_MS)`. Each tick reruns a `useEffect` that rebuilds `statusMap` (always a new object), which re-renders the whole pane subtree even when nothing changed.
3. **Heavy SVG filters per element.** `feGaussianBlur` glows applied per node/edge, plus keyframes that animate `filter: drop-shadow(...)` per element. Animating filter ops re-runs the paint shader every frame on every glowing element. Compounded by the absence of `React.memo` on `EdgePath`/`NodeShape`, every playback RAF tick and every LIVE poll rerenders all of them.

A fourth contributor: the `N === 1` short-circuit in `LivePanes` returns a structurally different element tree than the `N ≥ 2` path. When `total` flips, React unmounts the canvas and rebuilds — visible as a blank frame / flicker.

---

## 3. Component memoization & ticker decoupling

Files touched: `EdgePath.tsx`, `NodeShape.tsx`, `LivePanes.tsx`, `LivePane.tsx`, `CountdownChip.tsx`, `GraphCanvas.tsx`.

### Memoize the heavy leaves
- Wrap `EdgePath` and `NodeShape` in `React.memo`. Each takes plain-data props; default shallow equality is correct once parents pass stable references.
- In `GraphCanvas`, edge/node objects come from the memoized `layout.edges` / `layout.nodes` (made stable by §4). The other props (`state`, `progress`, `freshness`, `isPinned`, etc.) are primitives. Memo will hit on ~99% of nodes per playback tick; only the playhead-adjacent nodes/edges actually rerender.

### Decouple the 1Hz tick from pane structure
- Extract a tiny shared hook `useNowMs(intervalMs)` that lives in `src/components/live/useNowMs.ts`.
- Use it only inside `CountdownChip` and inside a new `useStatusMap` hook (extracted from `LivePanes`).
- The grid container and `LivePane`s themselves no longer subscribe to time. They only rerender when actual data changes.
- Inside `useStatusMap`, the effect that updates `statusMap` gets an equality guard: if every per-key status (status + closingStartedAt + frozenAt + frozenRemainingMs) matches the previous, return `prev` unchanged. No reference change → no rerender.

### Stop the canvas remount on N=1 ↔ N≥2 transition
- Restructure `LivePanes` so the wrapper, the `<CanvasToolbar>`, and the MAIN `<LivePane>` are always rendered in the same positions. The N=1 vs N≥2 differences become props on the existing elements, not a different element tree:
  - `gridTemplateColumns` flips between `'1fr'` and `'1fr 1fr'` on the same grid container.
  - MAIN's `borderless`, `showFollow`, and `onCameraReady` props become conditional values on the same `<LivePane>` instance.
  - Subagent panes mount/unmount inside the grid as they appear/disappear; MAIN never remounts. The MAIN canvas's `<svg>` keeps its DOM identity across N transitions.

### Stable callbacks for memo
- `onPin`, `onScrubTo`, `onClose`, `onToggleFreeze`, `onCameraReady` — wrap in `useCallback` where they flow into memoized children. Audit the call sites so `React.memo` actually hits.

---

## 4. Layout fingerprint cache

Files touched: `graph/layout.ts`, `components/GraphCanvas.tsx`.

### Problem
`GraphCanvas` does `useMemo(() => layoutTree(session.root), [session])`. In LIVE mode `session` is a brand-new object every poll (TanStack Query refetches; `parseSession` rebuilds the tree even when JSONL is byte-identical). d3-hierarchy + d3-tree run on every poll, every pane, producing new `LaidOutNode`/`LaidOutEdge` arrays that force memo misses downstream.

### Fix
Inside `layoutTree`, compute a structural fingerprint of the tree at entry: a fast hash of `(id, kind, parent-id, child-count)` walked in DFS order. Maintain:

- a module-level `WeakMap<Milestone, { fingerprint: string; result: LayoutResult }>` keyed by the root milestone reference (handles the common "same root, called multiple times" case in a single render pass);
- a fallback bounded LRU `Map<string, LayoutResult>` keyed by fingerprint (handles "different root identity, identical shape" — i.e. every LIVE refetch on an unchanged session).

Lookup order on each call:
1. WeakMap hit on root ref → return cached result immediately.
2. Compute fingerprint. If LRU contains it → return that result, also seed the WeakMap.
3. Otherwise compute layout, store in both caches, return.

LRU cap: 16 entries. Eviction on insert. The fingerprint walk is O(N) string concat per node — same order as the layout itself, so worst case is no slower than today.

### Why this is safe
The fingerprint covers everything layout depends on: structure + per-node kind. If we later add layout-affecting per-node properties, we add them to the fingerprint.

### Downstream wins
- Change `taintedIds` and `subagentRegions` memo keys from `session` to `layout` (or `session.root`). Once layout identity is stable across polls, these hit cache.
- The camera `frameInitial` guard already uses `session.id` — unchanged.

---

## 5. Viewport culling

File touched: `components/GraphCanvas.tsx`.

### Problem
Every node and edge in the layout is rendered to SVG regardless of camera viewport. With ~200 nodes on a graph wider/taller than the screen at zoom 1.0, hundreds of off-screen elements are painted (and filtered) every frame.

### Fix
Compute the camera-visible rectangle in layout coordinates from `transform` and `viewport`:

```
visibleLayoutRect = {
  minX: (0              - transform.x) / transform.k - MARGIN,
  minY: (0              - transform.y) / transform.k - MARGIN,
  maxX: (viewport.width - transform.x) / transform.k + MARGIN,
  maxY: (viewport.height- transform.y) / transform.k + MARGIN,
}
```

`MARGIN` defaults to ~200px in layout units to cover edges whose midpoint curves into view.

Filter `layout.nodes` and `layout.edges`:
- **Nodes:** keep if `(n.x, n.y)` is inside the rect. The W×H node footprint fits comfortably in the margin.
- **Edges:** keep if either endpoint is inside the rect OR the edge's AABB intersects the rect.

Always keep the active playhead node (it could be off-screen briefly during a follow tween; keeping it ensures continuity if follow is paused).

### Memo strategy
Recompute the visible set only when `transform` or `viewport` changes — not on every playback tick. A single O(N) pass with no per-element allocation. Up to ~1000 nodes this is cheap enough; a spatial index can be added later if needed.

### Visual safety
What gets culled is what was already invisible. No user-visible change. The minimap is unaffected (it intentionally shows the whole graph through its own renderer).

### Edge cases handled
- Tween in progress: `MARGIN` and the 280ms tween duration combine to prevent "pop-in".
- `subagentRegions` are large rectangles often spanning much of the canvas; they go through the same AABB test and will usually pass at typical zooms.

---

## 6. Filter consolidation

Files touched: `theme/Filters.tsx`, `components/EdgePath.tsx`, `components/NodeShape.tsx`, `components/GraphCanvas.tsx`, `theme/live-pane.css`, `index.css`.

### Problem
- Every glowing element attaches `filter="url(#tg-glow)"` directly. Each application creates a separate filter region for the browser to compose.
- The keyframes `tg-edge-pulse`, `tg-edge-trail`, `tg-shimmer` animate `filter: drop-shadow(...)` per element. `drop-shadow` is a paint-shader op; animating it forces a per-element re-paint every frame.

### Fix — Part A: group-level filters
Split the SVG zoom layer in `GraphCanvas` into filter cohorts:

```
<g class="zoom-layer" transform=...>
  <g data-cohort="nodes-noglow">…</g>      idle/pruned nodes
  <g data-cohort="nodes-glow" filter="url(#tg-glow)">…</g>      active/success nodes
  <g data-cohort="edges-softglow" filter="url(#tg-glow-soft)">…</g>  idle/pruned edges
  <g data-cohort="edges-glow" filter="url(#tg-glow)">…</g>           done/drawing edges
</g>
```

One filter pass per group instead of one per element. Pixel-identical result because the `feGaussianBlur` parameters are unchanged — only how many times the GPU runs the filter pipeline.

Nodes/edges still attach their own per-element styling (fill, stroke, stroke-width, dasharray, opacity); just the `filter` attribute moves to the group.

### Fix — Part B: animate cheap properties
Replace the keyframes that animate `filter: drop-shadow(...)` with keyframes that animate `opacity` / `stroke-opacity` between two filter states. The element keeps its static `filter="url(#tg-glow)"` (now inherited from the group); the visible "pulse" comes from opacity oscillation, which the browser composes on the GPU without re-running the filter.

Concretely:
- `tg-edge-pulse` (drawing edges) — keep the `stroke-width` tween; drop the `drop-shadow` animation; add `stroke-opacity` 0.85↔1.0 for the breathing.
- `tg-edge-trail` (done edges) — animate `stroke-opacity` only.
- `tg-shimmer` (success nodes) — animate `opacity` only.
- `paneBreathe` / `subBreathe` (pane borders) — these animate `box-shadow` on 1–4 elements (the pane wrappers); cost is bounded. Leave as-is.

### Visual safety
Side-by-side, the breathing comes from opacity instead of filter-blur radius, but at the values used (0.85–1.0 vs blur 4px↔12px) the perceived effect is the same — both are luminance pulses on already-glowing elements. We verify side-by-side in §8.

### What stays untouched
- All three filter defs (`tg-glow`, `tg-glow-hard`, `tg-glow-soft`) — exactly as defined.
- `feGaussianBlur` stdDeviation values — unchanged.
- All keyframe durations and easing — unchanged.
- Node and edge silhouettes, colors, stroke widths, dasharrays — untouched.

---

## 7. Camera follow throttling

File touched: `components/GraphCanvas.tsx`.

### Problem
The follow effect runs on `[currentId, follow, viewport.width, viewport.height]`. During pane resize / sidebar drag, `viewport.width/height` changes continuously, and each change calls `centerOn(...)` with a fresh 280ms tween. Tweens stack: a tween in flight gets interrupted by a new one — visible as judder.

### Fix
- Coalesce viewport-driven follow updates with a `requestAnimationFrame` debounce: viewport changes within the same frame produce one `centerOn` call. Implemented via a small ref-based debouncer keyed on RAF id.
- Skip the `centerOn` call when the target node is already within a tight tolerance of the viewport center at the current zoom (e.g. < 8px in screen-space). Avoids re-tweening when the user just resized by a few pixels.

---

## 8. Testing & verification

### Unit tests (vitest)
- **Layout cache:** same root reference returns the same `LayoutResult` identity. Different roots with identical fingerprints return the same identity. Different fingerprints return different results. LRU eviction bounded at 16.
- **Viewport culling math:** given a transform + viewport, the visible-rect helper returns the right rectangle. Edge AABB intersection tests on hand-crafted edges (entirely inside, entirely outside, crossing).
- **`useNowMs` hook:** subscribers update at the configured interval; unmounting one subscriber doesn't kill others sharing the same interval.

### Behavioral tests (Playwright / existing E2E patterns)
- **LIVE pane transition stability:** open a session that flips between MAIN-only and MAIN+1-subagent. Assert that the MAIN `<svg>` retains the same DOM identity across the transition (use a sentinel attribute set on mount; assert it persists).
- **Playback rerender count:** wrap `EdgePath` in a `React.Profiler` boundary during a test playback of an N-node session. After §3, commit count should be close to `2N` (each edge transitions through ~2 states) instead of `N × number-of-RAF-ticks`.

### Visual verification (manual, gated)
- Side-by-side before/after screenshots at three states — idle, mid-playback, LIVE with 2 subagent panes. Goal: pixel-identical or imperceptibly different. Drive via the `verify` skill and Playwright MCP; ask the user to confirm.

### Profiling (manual, evidence-based)
- Chrome Performance trace on a known session, before and after the full change. Capture: average frame time during playback, paint time per frame, scripting time per poll in LIVE. Numbers go in the PR description as evidence.

### What we do NOT add
- No new visual-regression suite (manual side-by-side + existing E2E catches it).
- No load testing infra (session sizes are bounded by Claude Code sessions).

---

## 9. Rollout & risk

### Order of implementation
1. §3 — component memoization & ticker decoupling. Largest risk-adjusted win; mostly mechanical; verify with React Profiler before moving on.
2. §4 — layout fingerprint cache. Independent of §3; multiplies the benefit by stabilizing downstream memo keys.
3. §5 — viewport culling. Independent; the biggest paint-cost reduction once memoization is in place.
4. §6 — filter consolidation. Most visually-sensitive; do last so side-by-side comparisons are on top of an already-functional refactor.
5. §7 — camera follow throttling. Small, isolated, can land any time after §3.

### Risk register
- **Filter consolidation visual drift.** Mitigated by side-by-side screenshot review in §8 before merging §6.
- **Viewport culling missing an edge case.** Margin is generous; minimap is unaffected. Worst case: an edge briefly pops in during a fast pan — visible regression, easy to widen margin.
- **Layout cache stale across structural changes we didn't anticipate.** Mitigated by the fingerprint covering all current layout inputs; documented "if you add layout-affecting fields, add them to the fingerprint."

### Merge
All work on `feat/perf-smoother-render`. Merge to `main` only after the full sequence is implemented and visually verified by the user.