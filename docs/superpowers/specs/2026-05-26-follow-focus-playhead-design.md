# FOLLOW — Focus + Above-Center Playhead

Status: design approved via brainstorm
Date: 2026-05-26
Branch: `feat/follow-focus-playhead`

## Context

Today, `FOLLOW` is a continuous toggle that keeps the playhead milestone (`currentId`) centered in the viewport at whatever zoom level the user has set. The follow effect in `src/components/GraphCanvas.tsx` (around L170) calls `centerOn({ x: node.x, y: node.y }, transform.k)` — same zoom, dead-center.

The user wants `FOLLOW` to behave more like a cinematic "lock onto the playhead" mode:

1. Engage at a consistent zoom level so the playhead always looks the same size, regardless of where the user had panned/zoomed before.
2. Place the playhead a little above the viewport center so the user sees more of what is *coming up* below.

The target node remains the playhead — not the pinned/detail node.

## Decisions locked

### Zoom level: 9 nodes vertically

When `FOLLOW` is ON, the camera scales to a `k` such that 9 nodes fit vertically in the viewport. With `NODE_Y_SPACING = 110` (from `src/graph/layout.ts:29`), the formula is:

```
focusedK = viewport.height / (9 * NODE_Y_SPACING)   // = viewport.height / 990
```

This is computed dynamically per-viewport, so the visible-node count stays at 9 across resolutions. The result will typically land in the `k ≈ 0.8 – 1.0` range for common viewport heights (800–1000 px).

`focusedK` is clamped to the existing `SCALE_MIN = 0.2` / `SCALE_MAX = 8` range from `useCamera.ts`, though it should never approach either limit in practice.

### Vertical offset: 20% above center

The playhead's screen-Y target is `viewport.height / 2 - viewport.height * 0.20` = the point at **30% from the top** of the viewport. That leaves the bottom 70% available for lookahead/incoming nodes. Horizontal target is dead-center (no x offset).

### `FOLLOW` remains a toggle, continuous tracking preserved

- Clicking the `FOLLOW` button still toggles the boolean; no change to the button itself.
- While `FOLLOW` is ON and playback advances, every new playhead node animates to the same `focusedK` + above-center pose.
- User pan / wheel-zoom still flips `FOLLOW` to OFF (existing behavior in `useCamera.ts` zoom handler, unchanged).

The continuous-tracking design means engaging `FOLLOW` after the user has zoomed/panned away will animate the camera back to the focused pose — which is the intended "snap me back" feel.

## Implementation

### `src/graph/useCamera.ts`

Add a `focusOn` helper to the `CameraApi`:

```ts
focusOn: (pt: { x: number; y: number }, opts?: { animate?: boolean }) => void;
```

Implementation builds a transform that places `pt` at `(viewport.width / 2, viewport.height * 0.30)` at scale `focusedK = viewport.height / 990` (clamped to `[SCALE_MIN, SCALE_MAX]`).

The `0.30` (i.e. 30% from top) and the `9` constant are named locals at the top of the function (`FOCUS_VERTICAL_RATIO`, `FOCUS_VISIBLE_NODES`) so future tweaks are one-line changes.

`centerOn` is left untouched — it's still used by the minimap jump/pan/zoom handlers, which legitimately want to preserve user zoom.

### `src/components/GraphCanvas.tsx`

In the follow effect (currently L170–197), replace:

```ts
centerOn({ x: node.x, y: node.y }, transform.k);
```

with:

```ts
focusOn({ x: node.x, y: node.y });
```

The 8-pixel tolerance early-return is updated in two ways:
1. Compare current screen position against the new target point `(width/2, height*0.30)` instead of `(width/2, height/2)`.
2. Also bail only if the current zoom is within a small delta (e.g., `|transform.k - focusedK| < 0.01`) of the focused zoom. Otherwise the camera should still tween — we want a zoom change to fire even if the node happens to be near the target spot at the wrong scale.

Dependency array gains `focusOn` (stable per `applyTransform`/`viewport`).

### No other files touched

- `App.tsx` — no change. The `FOLLOW` button onClick still calls `setFollow(!follow)`.
- Minimap — no change. Its `centerOn` callers preserve user zoom by design.

## Testing

No new unit tests required:
- The follow-effect trigger (mount / playhead change / toggle on) is unchanged.
- The only behavior change is the destination transform — visible in the live app.

Manual verification (covered in the implementation plan):
1. Open a replay session, scrub away, click `FOLLOW` → camera animates to focused-zoom with playhead in the upper third.
2. Press `▶` to play → each step keeps the playhead in the same screen position.
3. Pan with mouse → `FOLLOW` flips OFF (regression check).
4. Resize the window → next `FOLLOW` engagement recomputes `focusedK` for the new viewport height.

## Out of scope

- Changing `FOLLOW` to act on the pinned/detail node.
- Making zoom respect a user-preferred level (e.g., "remember my zoom and re-apply on engage").
- Animation curve / duration changes — keep the existing 280 ms transition.
- Configurable offset / visible-node count via UI — values stay as code constants.