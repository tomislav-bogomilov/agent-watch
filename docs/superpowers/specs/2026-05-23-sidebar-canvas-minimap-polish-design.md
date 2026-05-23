# Sidebar / Canvas Header / Minimap UX Polish

Date: 2026-05-23
Status: Approved (design)

## Goal

A focused UX pass on three orthogonal pieces of the running app:

1. Restyle session and prompt list items in the left sidebar as soft TRON-flavored "cards" with a radial cyan halo and a selected-state corner-bracket frame.
2. Move the session path out of the sidebar item subtitle and into a copy-able affordance on the canvas's session header.
3. Make the minimap fully interactive: click-to-jump (existing), drag the viewport rectangle to pan, scroll-wheel to zoom (cursor-anchored).

These changes are visual and interactive only. No data, parsing, or playback semantics change.

## Non-goals

- No restyling of the canvas header beyond adding the copy button.
- No new keyboard shortcuts.
- No new persisted preferences beyond what already exists.
- No minimap toggle/hide affordance.
- No changes to the SESSIONS/PROMPTS dropdown, filter input, or project grouping.

## 1. Sidebar item style

### Visual specification

A single style is shared by both session items (`SessionsList`) and prompt items (`PromptsList`) through a new `ItemShell` wrapper component.

At rest:

- Outer wrapper: `padding: 3px 8px` (provides vertical gap between items so they read as discrete tiles).
- Inner card: `padding: 8px 12px`, `position: relative`.
- Border: `1px solid rgba(110, 224, 238, 0.10)` (hairline cyan at low opacity).
- Background: `radial-gradient(ellipse 75% 120% at 18% 50%, rgba(0, 229, 255, 0.085) 0%, rgba(0, 229, 255, 0.02) 55%, rgba(0, 229, 255, 0) 80%)` — a soft cyan halo anchored to the left edge of the card.
- Transition: `border-color 220ms ease, background 220ms ease, box-shadow 220ms ease`.

On hover (not selected):

- Border: `1px solid rgba(110, 224, 238, 0.28)`.
- Background: `radial-gradient(ellipse 85% 140% at 22% 50%, rgba(0, 229, 255, 0.13) 0%, rgba(0, 229, 255, 0.035) 60%, rgba(0, 229, 255, 0) 85%)`.

On selected:

- Border becomes transparent (so the brackets carry the framing role).
- Background: `radial-gradient(ellipse 90% 150% at 22% 50%, rgba(0, 229, 255, 0.20) 0%, rgba(0, 229, 255, 0.06) 60%, rgba(0, 229, 255, 0.005) 90%)`.
- Four 9×9 corner brackets are rendered as absolutely-positioned `<span>`s anchored at `top/left/right/bottom: -1`, each drawn with a single `1px solid var(--edge-trail)` border on the two relevant edges and `box-shadow: 0 0 6px rgba(0, 229, 255, 0.55)` for glow. Bracket overlay is `pointer-events: none`.

### Content changes

- `SessionsList`: remove the `cwd` subtitle line. The item keeps its title (renamable, double-click to edit) and the timestamp · size meta line.
- `PromptsList`: unchanged content — prompt text, session subtitle (`SESSION xxxxxxxx` or renamed title), timestamp.

### Component structure

- `src/components/library/ItemShell.tsx`: stateless wrapper that owns hover state, applies base/hover/selected style fragments to the inner card, and renders the four corner-bracket spans when `selected` is true. Receives `onClick`, `testId`, and `children`. Children render arbitrary content (title rows, meta).
- `src/components/library/itemStyle.ts`: exports the single `ItemStyle` shape (`outer`, `inner`, `hover`, `selected` CSS fragments) used by `ItemShell`. No variant switching, no localStorage, no event bus — these are spike-only scaffolding and are removed (see §4).
- `SessionsList` and `PromptsList`: each iterates its items, wraps each row in `ItemShell`, places title/subtitle/meta divs as `ItemShell` children.

### Tests

- Unit: `ItemShell` renders bracket overlays only when `selected` is true; hover state mounts via `mouseenter`/`mouseleave`.
- Existing E2E selectors (`session-item-${id}`, `prompt-item-${id}`) remain on the `<li>` element so all current tests keep working.

## 2. Canvas header copy button

### Current state

`src/App.tsx:184–187` renders a non-interactive overlay at the top-left of the canvas with two stacked lines:

```
SESSION xxxxxxxx          <- session title
C:/path/to/project        <- cwd, read-only text
```

The wrapper has `pointerEvents: 'none'` so the overlay does not eat canvas clicks.

### Change

Replace the cwd line with a small row containing the cwd text plus a copy button positioned immediately to its right.

- The cwd row gets `pointerEvents: 'auto'` locally; the wrapper around the title stays `pointer-events: none` so non-button areas of the overlay still pass clicks through to the canvas.
- Copy button: small outlined square, `1px solid var(--edge-idle)`, transparent background, `width/height: 16px`, contains a copy glyph (`⧉` or an equivalent inline SVG). On hover, border deepens to `var(--edge-trail)`.
- Click handler:
  1. `navigator.clipboard.writeText(effectiveSession.cwd)`.
  2. Local component state flips `copied` to `true` for 1200ms; during that window the glyph swaps to `✓` and the border becomes `var(--edge-trail)`.
- `data-testid="header-copy-cwd"` on the button for E2E.

### Tests

- Unit: clicking the button calls `clipboard.writeText` with the session cwd and flips `copied` state. Use a fake clipboard via `vi.spyOn(navigator.clipboard, 'writeText')`.
- E2E: open a session, click the copy button, assert button's data-state attribute (or `✓` glyph presence) appears.

## 3. Minimap interactions

### Current behavior

`src/components/Minimap.tsx` renders an SVG showing the layout, with a viewport rectangle reflecting the current camera transform. The whole SVG has `onClick`; clicking anywhere computes the layout point under the cursor and calls `onJump(layoutPoint)`, which the parent forwards to `camera.centerOn(...)` at the camera's current zoom.

### New behaviors

Three behaviors share the same SVG:

- **Click outside the rect** → unchanged: jump the camera to that layout point.
- **Pointer-down inside the rect → drag** → pan the camera 1:1 with the cursor in minimap space, at the current zoom.
- **Wheel over the minimap** → cursor-anchored zoom: the layout point under the cursor stays stationary as `k` changes.

### Implementation

#### Shared helper: pixel → layout coordinate

Extract the pixel-to-layout conversion (currently inline in `handleClick`) into a small helper:

```ts
function minimapPixelToLayout(
  cx: number, cy: number,
  rect: DOMRect,
  offX: number, offY: number, s: number,
): { x: number; y: number } {
  return { x: (cx - rect.x - offX) / s, y: (cy - rect.y - offY) / s };
}
```

`offX`, `offY`, `s` are the existing scale and centering values already computed inside `Minimap` (`Minimap.tsx:17–21`).

#### Hit-test against the viewport rect

```ts
function isInsideRect(layoutPoint, transform, viewport) {
  const vx = -transform.x / transform.k;
  const vy = -transform.y / transform.k;
  const vw = viewport.width / transform.k;
  const vh = viewport.height / transform.k;
  return layoutPoint.x >= vx && layoutPoint.x <= vx + vw
      && layoutPoint.y >= vy && layoutPoint.y <= vy + vh;
}
```

#### Drag

On `pointerdown` against the SVG:

1. Compute the layout point under the cursor.
2. If the point is inside the current viewport rect, start a drag: capture the pointer (`setPointerCapture`), store the cursor's layout point as `dragAnchor`, store the rect's current top-left layout point as `dragRectOrigin`, set a local `isDragging` flag.
3. If not inside, fall through to the existing click-to-jump logic.

On `pointermove` while dragging:

1. Compute the cursor's current layout point.
2. New rect top-left = `dragRectOrigin + (cursorLayout - dragAnchor)`.
3. The desired camera-centered layout point is `rectTopLeft + (rectSize / 2)`.
4. Call `camera.centerOn(layoutPoint, transform.k, { animate: false })`.

On `pointerup`:

1. `releasePointerCapture`.
2. Clear `isDragging`.
3. Suppress the synthetic `click` that would otherwise fire (mark `suppressNextClick` for one tick).

#### Wheel zoom

Wheel handler must be attached via `useEffect` + `addEventListener('wheel', handler, { passive: false })` because React's `onWheel` cannot be non-passive on all browsers, and we need `preventDefault()` to stop the page/canvas from scrolling.

On wheel:

1. Compute the layout point under the cursor (anchor).
2. `factor = Math.pow(1.0015, -event.deltaY)` (smooth multiplicative step; sign so wheel-up zooms in).
3. `newK = clamp(transform.k * factor, SCALE_MIN, SCALE_MAX)`.
4. `camera.centerOn(anchorLayoutPoint, newK, { animate: false })`.

The contract: the layout point under the minimap cursor at the moment of the wheel event is what the canvas viewport is centered on at the new zoom level. The minimap's viewport rect resizes around that point.

This is a deliberate simplification over a true "anchor stays under the cursor pixel" zoom (which would require recomputing both `x` and `y` in `applyTransform` from the cursor's canvas-viewport position, not just the layout anchor). The chosen contract matches standard minimap UX — users targeting a point on the map expect that point to be framed in the canvas. If feedback later shows the zoom target drifts unpleasantly, revisit with a more precise transform.

#### Camera API change

Add an options object to `centerOn`:

```ts
centerOn(pt: { x: number; y: number }, k?: number, opts?: { animate?: boolean }): void;
```

`opts.animate` defaults to `true` (preserves existing call sites). Drag and wheel pass `false` so the camera updates per-frame without the 280ms tween.

Internally, `applyTransform` already accepts an `animate` flag (`useCamera.ts:105`). Plumb the new option through `centerOn` → `applyTransform`.

#### Minimap props

`Minimap`'s prop shape gains:

- `onPan(layoutPoint: { x: number; y: number }): void` — called during drag with the new desired camera-center layout point.
- `onZoom(layoutPoint: { x: number; y: number }, k: number): void` — called on wheel events with the new desired anchor and zoom.
- The existing `onJump` stays for click-to-jump.

The parent (the component that currently passes `onJump`) wires:

- `onJump(pt)` → `camera.centerOn(pt)` (animated, as today).
- `onPan(pt)` → `camera.centerOn(pt, undefined, { animate: false })`.
- `onZoom(pt, k)` → `camera.centerOn(pt, k, { animate: false })`.

#### Visual cues

- Cursor over the rect: `cursor: 'grab'`. During drag: `cursor: 'grabbing'`.
- Cursor over the rest of the minimap: keep the existing `cursor: 'crosshair'`.

### Tests

- Unit (jsdom): the pixel-to-layout helper round-trips correctly for known values. Wheel handler clamps `newK` to `[SCALE_MIN, SCALE_MAX]`.
- E2E: with a loaded session, dispatch `mousedown` inside the viewport rect, `mousemove` by N pixels, `mouseup`, then assert the camera's transform shifted by approximately `N / s` in layout units. Wheel zoom: assert the camera's `k` increased after a wheel-up event.

## 4. Spike cleanup

The current code on `main` contains spike scaffolding from the brainstorming phase:

- `src/components/library/itemStyle.ts` defines three variants `A | B | C`, a localStorage key `tg.spike.itemStyle`, a `setItemVariant` function, a custom `tg-item-variant-change` event, and a `useItemVariant` hook.
- `LibraryPanel.tsx` renders an A/B/C selector strip with `data-testid="spike-bar"`, `spike-A`, `spike-B`, `spike-C`.
- `ItemShell` reads a per-variant `bracketSize` (22 for A and B, 9 for C).

All of the above is removed in the implementation. Specifically:

- `itemStyle.ts` collapses to a single exported `ITEM_STYLE: ItemStyle` constant containing only the C variant's `outer`, `inner`, `hover`, `selected` fragments. No `variant`, no `bracketSize`, no localStorage, no event bus, no hook.
- `ItemShell` no longer takes a `variant` prop. The bracket size becomes a single constant (9) inside the component.
- `LibraryPanel` no longer renders the STYLE strip, no longer reads `itemVariant`, no longer threads `variant` to the lists.
- `SessionsList` and `PromptsList` no longer take a `variant` prop.
- `localStorage.removeItem('tg.spike.itemStyle')` on first load after the change, to clean up any persisted spike state on user machines.

## 5. File-level change summary

Edits:

- `src/components/library/itemStyle.ts` — collapse to single style constant.
- `src/components/library/ItemShell.tsx` — drop `variant` prop, drop `bracketSize` lookup, use single constant.
- `src/components/library/SessionsList.tsx` — drop `variant` prop; drop the `itemCwd` JSX line; drop the `itemCwd` entry from the local `styles` object.
- `src/components/library/PromptsList.tsx` — drop `variant` prop.
- `src/components/library/LibraryPanel.tsx` — remove spike strip JSX, the `STYLE`/`spikeBtn`/`spikeBtnActive` style entries, the `useItemVariant` / `setItemVariant` / `ItemVariant` imports, and the `variant` prop passed to `SessionsList` / `PromptsList`; on mount, `localStorage.removeItem('tg.spike.itemStyle')`.
- `src/App.tsx` — change `sessionHeader` to host a copy-button row next to the cwd; localized `pointer-events: auto` on the cwd row only.
- `src/components/Minimap.tsx` — add pointer-event-based drag handling, wheel handler via `useEffect` (`passive: false`), hit-test against viewport rect, expose `onPan` / `onZoom` props alongside `onJump`.
- `src/components/GraphCanvas.tsx` — wire `onPan` and `onZoom` callbacks at lines 274–280, both calling `centerOn(..., { animate: false })`.
- `src/graph/useCamera.ts` — extend `centerOn` signature with `{ animate?: boolean }` opts; thread through `applyTransform` (which already accepts an `animate` flag at line 105).

The parent component passing `onJump` to `Minimap` lives at `src/components/GraphCanvas.tsx:274–280`. `centerOn` is destructured from the camera at `GraphCanvas.tsx:85`. Wire `onPan(pt)` → `centerOn(pt, undefined, { animate: false })` and `onZoom(pt, k)` → `centerOn(pt, k, { animate: false })` alongside the existing `onJump` callback.

New files:

- (none — `ItemShell.tsx` and `itemStyle.ts` already exist from the spike and are simplified, not created.)

## 6. Open questions

None.

## 7. Acceptance criteria

- Switching between sessions and prompts in the sidebar shows the new card style on both lists. Selected items show the radial halo + corner-bracket frame. Hover deepens the border without selecting.
- Session items no longer show the cwd subtitle line.
- Opening a session shows the cwd in the top-left canvas header next to a small copy button. Clicking the button copies the cwd to the clipboard and briefly shows a check glyph.
- Clicking outside the minimap viewport rect still jumps the camera (existing behavior).
- Click-and-drag inside the viewport rect smoothly pans the canvas in real time.
- Scroll-wheel over the minimap smoothly zooms the canvas; the viewport rect grows/shrinks accordingly; `k` is clamped to `[SCALE_MIN, SCALE_MAX]`.
- Page does not scroll while wheeling over the minimap.
- All existing E2E tests pass without modification.
- No A/B/C spike scaffolding remains in the code or in `localStorage` after first load.