# Live Sessions — Fixes Round 2

Status: design approved via brainstorm + Playwright inspection of session `98e867b9` running against `npm run dev` on :5173
Date: 2026-05-24
Companion artifact: `.superpowers/brainstorm/17579-1779610859/content/pane-gap-variants.html`

## Context

Round 1 shipped the multi-pane LIVE view with a real `GraphCanvas` inside each pane. Real-world use surfaced five distinct defects, visible in session `98e867b9` (this very session):

1. **Pane explosion** — opening a long-running session renders one pane *per spawn node in its entire history*, not per currently-active sub-agent. The session under test rendered 30 panes, all entering the closing-countdown lifecycle.
2. **Header overlap** — the absolutely-positioned `sessionHeader` (`top: 16, left: 24`) and `LiveButton` (`top: 12, right: ...`) overlay the top of the LIVE panes container. The first pane's top-left content is hidden under the header.
3. **No pane spacing** — `gap: 1px` reads as a hairline; panes feel fused together.
4. **MAIN canvas breaks when sub-agents close** — when `total` drops to 1, the N=1 short-circuit remounts `GraphCanvas` fresh, but the camera never auto-fits and `follow` may not be on. Result: nodes can land off-screen and the camera fails to track new tips.
5. **FIT/FOLLOW/LIVE not siblings** — FIT/FOLLOW are rendered inside `GraphCanvas` at `top:12`, LIVE is rendered in `App.tsx` at `top:15`. Confirmed via DOM probe: in the not-engaged state, LIVE (`x:1456–1512, y:15`) overlaps FOLLOW (`x:1490–1550, y:12`) horizontally and is 3px lower vertically. FIT and FOLLOW touch at 0px with no breathing room.

This change fixes all five with the smallest viable surface area and reuses the existing pane/camera infrastructure.

## Decisions locked

### Single 30-second activity threshold

The constant `SUBAGENT_STABLE_MS` in `src/components/live/liveness.ts` changes from `60_000` to `30_000`. This single value covers both:

- **"Should a pane appear at session open?"** — yes if `now - mtime < 30s`.
- **"Should an open pane enter the closing countdown?"** — yes if `now - mtime > 30s`.

A separate constant for "visible at open" is not introduced — one threshold is simpler and matches the user's "I see it writing right now" mental model. Existing `CLOSING_MS = 30_000` is unchanged, so the total time between a sub-agent's last write and pane removal is 30s + 30s = 60s.

### Pane visibility rule

A sub-agent pane is *displayable* if its paired file's `lastUpdatedAt` is within 30s of `now`, OR its `paneStatus` is currently `'closing'` or `'frozen'`. Panes that were never displayable simply never enter the status map.

Concretely, `LivePanes.tsx`:

1. Map every `subagent_spawn` to its alphabetically-paired `fileId` (existing pairing, unchanged for v1).
2. **Filter out entries whose `fileId` has no entry in `subagentMtimes` or whose mtime is older than 30s** AND the entry is not already tracked in `statusMap` with status `'closing' | 'frozen'`.
3. Pass the filtered set to the existing status-map effect — so the lifecycle (active → closing → frozen → closed) only runs for panes that were ever displayable.

The 30-pane case becomes 0–2 panes immediately.

### Shared `CanvasToolbar` component

New file `src/components/CanvasToolbar.tsx`. Renders a single `<div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8, alignItems: 'center', zIndex: 6 }}>` containing LIVE, FOLLOW, FIT in that order (LIVE leftmost). Each button is `height: 20, padding: '2px 8px', font-size: 9, letter-spacing: 2, fontFamily: 'ui-monospace, monospace'`. The container clips its children to identical heights and spaces them evenly.

Props:

```ts
type Props = {
  showLive: boolean;
  liveEngaged: boolean;
  onToggleLive: () => void;

  showFit: boolean;
  onFit: () => void;

  showFollow: boolean;
  follow: boolean;
  onToggleFollow: () => void;
};
```

Used in three call sites:

- **`GraphCanvas.tsx`** — replaces its inline FIT/FOLLOW buttons (lines 254–283). When `compact=true`, it still renders the toolbar but with all `show*` false → the toolbar renders nothing (zero-size flex). When `compact=false && !liveEngaged`, both FIT and FOLLOW show, FIT is rightmost. The existing LIVE button absolute-positioned div in `App.tsx` is **removed** — LIVE now lives only inside `CanvasToolbar`.
- **`App.tsx`** — single-canvas (not-live-engaged) path: pass `showLive=sessionIsLive`, `showFit=true`, `showFollow=true`. Rendered *outside* `<GraphCanvas>` so it's not affected by `compact`. Inside `GraphCanvas`'s render, the existing buttons are removed entirely; toolbar is the only source.
- **`LivePanes.tsx`** — for the N=1 short-circuit, the toolbar appears with `showLive=true, showFit=true, showFollow=false` (FOLLOW always off in LIVE mode). For N≥2 grid, the toolbar appears with `showLive=true, showFit=false, showFollow=false` — LIVE only.

This guarantees: wherever the three buttons can co-exist, they share a parent flex with consistent `gap: 8`.

### Header offset for LivePanes

`LivePanes.tsx` outer container gains `padding: 56px 12px 12px 12px`. The 56px top:

- Session header sits at `top: 16, height: 33` → bottom edge at y=49.
- Toolbar sits at `top: 12, height: 20` → bottom edge at y=32.
- 56px clears the lower of the two (the session header) with ~7px breathing room.

The 12px sides match the toolbar's right offset and give the cut-corner notches a fixed inset from the canvas edge. The 12px bottom mirrors that.

For the N=1 short-circuit, the same padding wraps the lone `<GraphCanvas>` so it doesn't crash into the session header. Inside the GraphCanvas the toolbar is anchored at top:12 right:12 — relative to the GraphCanvas bounding box (its `position: relative` parent), so the toolbar sits at the inset edge, not at the outer slot edge.

### Pane gap: 12px + subtle cyan tint

`LivePanes.tsx:24` `gridStyle`:

```ts
gap: 12,
background: 'rgba(0,229,255,0.05)',
```

The 5% cyan tint suggests the panes share an energy field — chosen visually via companion variant B. Bumped from `gap: 1` (hairline). The padding+gap budget: with a 1600px-wide canvas slot, after 24px horizontal padding + 12px gap we get two ~782px panes — wider than today's 660px and far less crammed.

### MAIN camera behavior across N=1 transitions

Three precise changes in `LivePanes.tsx`'s N=1 short-circuit:

1. **Auto-fit on mount and on order growth.** Pass an `onCameraReady` callback to the inner `<GraphCanvas>`. Inside the callback, store the `CameraApi` and call `api.fit()`. Additionally, a `useEffect([mainPlayback.order.length])` calls `cameraRef.current?.fit()` whenever new milestones arrive via refetch.

2. **Default follow=true.** In the same `useEffect`, also call `cameraRef.current?.setFollow(true)`. Combined with the synthetic playback's `index = order.length - 1`, the camera centers on the live tip whenever new data lands.

3. **Same default in compact sub-agent panes.** Each `<LivePane>`'s inner `<GraphCanvas compact liveEngaged>` follows the same pattern: `onCameraReady` → fit() and setFollow(true). The N≥2 panes already had no FOLLOW UI, but the underlying state may have started at false; now it's explicit.

Non-live single-canvas behavior is **untouched** — that path uses `usePlayback` and starts at the first node; only the LIVE-engaged paths get auto-fit + auto-follow.

## Architecture diagram

```
canvas-slot                                    (App.tsx)
├─ sessionHeader (absolute, top-left)
├─ CanvasToolbar (absolute, top-right)         ← single source of LIVE/FOLLOW/FIT
│   - props differ per outer mode (live-engaged / single-canvas / multi-pane)
├─ when NOT liveEngaged:
│   └─ <GraphCanvas> (no inline buttons now)
└─ when liveEngaged:
    └─ <LivePanes>  padding: 48px 12px 12px 12px
         ├─ N=1:  <GraphCanvas compact=false liveEngaged> + auto-fit + auto-follow
         └─ N≥2:  grid  gap: 12  background: cyan 5%
              ├─ <LivePane main>      compact + auto-fit + auto-follow
              └─ <LivePane subagent>  compact + auto-fit + auto-follow
```

## Component / file plan

### New file
- **`src/components/CanvasToolbar.tsx`** — flex-row container with LIVE/FOLLOW/FIT children. Each button styled identically. Renders nothing if all `show*` are false (graceful when called from multi-pane or compact contexts).

### Modified
- **`src/components/live/liveness.ts`** — `SUBAGENT_STABLE_MS: 30_000` (was `60_000`). Comment updated.
- **`src/components/live/LivePanes.tsx`**
  - Outer wrapper div with `padding: 56px 12px 12px 12px`.
  - `gridStyle`: `gap: 12, background: 'rgba(0,229,255,0.05)'`.
  - Filter `subagentEntries` to only those whose paired `fileId` is within 30s or whose existing status is `closing`/`frozen`.
  - N=1 short-circuit: wrap `<GraphCanvas>` with `onCameraReady`; `useEffect([order.length])` triggers `fit()` + `setFollow(true)`. Add `<CanvasToolbar showLive showFit ... />`.
  - N≥2: add `<CanvasToolbar showLive />` at the grid container level (LIVE only).
- **`src/components/live/LivePane.tsx`** — pass `onCameraReady` to inner `<GraphCanvas>`; `useEffect([playback.order.length])` triggers `fit()` + `setFollow(true)`.
- **`src/components/GraphCanvas.tsx`** — remove the inline FIT and FOLLOW JSX (lines 254–283). The toolbar is mounted by parents now.
- **`src/App.tsx`** — remove the `<LiveButton>` absolute div (lines 217–227). Add a single `<CanvasToolbar>` at the canvas-slot level for the non-live-engaged path. Wire its `onFit`/`onToggleFollow`/`onToggleLive` to existing handlers.

### Deleted
- **`src/components/live/LiveButton.tsx`** — its visual responsibility moves into `CanvasToolbar` (which inlines the LIVE button styling). One fewer file. The pulsing-dot/glow CSS animation `livePulse` stays in `src/theme/live-pane.css` and the toolbar reuses it.

## Verification

1. **30-pane case** (open session `98e867b9` while still running): see ≤2 panes, not 30. Historical sub-agents from earlier in the session do not appear.
2. **Pane spacing**: visible 12px gap, faint cyan tint between panes, panes don't touch.
3. **No header overlap**: `sessionHeader` at top-left sits cleanly above the first pane's content; toolbar at top-right sits cleanly above the first pane's content; nothing is occluded.
4. **Single-canvas live mode** (one MAIN, no sub-agents): canvas fills the slot, FIT button visible top-right alongside LIVE, FOLLOW hidden (LIVE mode). Camera follows the latest node; new milestones arriving via refetch center automatically.
5. **Multi → single transition**: artificially close all sub-agents (or wait for them to time out) — MAIN canvas remains usable, all nodes visible, camera continues to follow the latest node, refetch keeps adding nodes.
6. **Button alignment**: in not-live-engaged state with live session selected, all three buttons (LIVE, FOLLOW, FIT) share the same baseline (`y: 12`), with `gap: 8px` between them. In live-engaged multi-pane mode, only LIVE shows. In live-engaged N=1 mode, LIVE + FIT both show.
7. **Threshold sanity**: in DevTools, change a sub-agent fixture's mtime to 25s ago — pane appears. Change to 35s ago — pane does not appear (or if already visible, enters closing).
8. **Tests**: typecheck clean, unit tests pass, e2e pass.

## Out of scope

- Spawn-node ↔ subagent-file pairing improvement (still alphabetical for v1).
- Tab strip for N ≥ 5 visible panes (the new 30s filter makes this nearly impossible anyway).
- Configurable thresholds in UI.
- Manually re-opening a closed sub-agent pane (e.g., to inspect history).
- Per-pane FIT button (consistent with the "LIVE only" rule for multi-pane).

## Risks

- **Filter race at open**: if a sub-agent's file appears in `subagentMtimes` *just before* our refetch but its mtime is already older than 30s, we'd skip it even if it's actually still running. Mitigation: the 30s window is wide enough that any pause longer than 30s already means we're effectively in closing territory; the lifecycle handles re-activation on next refetch by re-evaluating.
- **Auto-fit during user interaction**: if the user pans/zooms in LIVE N=1 mode, calling `fit()` on every refetch overrides them. Mitigation: only call `fit()` once on first mount; for refetches, only `setFollow(true)` is needed (camera follows the tip via the existing follow logic, doesn't full-fit).
- **CanvasToolbar contention**: in the non-live-engaged path, the toolbar is in `App.tsx` while FIT/FOLLOW need access to the camera owned by `GraphCanvas`. Mitigation: `GraphCanvas` already exposes `CameraApi` via the existing `onCameraReady` callback (`App.tsx` already stores it in `cameraRef`). The toolbar uses that same ref.