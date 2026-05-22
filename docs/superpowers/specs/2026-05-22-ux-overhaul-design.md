# ThoughtGraph UX Overhaul — Design Spec

## Why

The current playback is unusable for real sessions. Verified in the running app:

- **Graph crammed to 21×5 px nodes.** With `preserveAspectRatio="xMidYMin meet"` on a 120×4190 layout in a 1320×1000 frame, the scale factor collapses to 0.238 and nodes become unreadable. There is no zoom or pan.
- **Tooltip lands ~280 px off-target.** `GraphCanvas.tsx:115` feeds `e.clientX/Y` (viewport-relative) into a tooltip whose absolute parent is offset by the 280 px sidebar. Confirmed: node at viewport x=940, tooltip at viewport x=1245.
- **38-node session finishes in ~7.6 s and auto-plays on load.** `usePlayback.ts:16` defaults to 200 ms/node with no sub-1× speeds, no step controls, no scrubber. You cannot follow the agent's reasoning.
- **Sessions >1000 milestones are silently blocked** (`App.tsx:52`). Most real sessions exceed this.
- **Auxiliary chrome** (sidebar always 280 px, no filters, no keyboard, no legend, no follow-the-playhead, no minimap) competes with the canvas — directly against the project's TRON-aesthetic "visuals are the product" direction.

This spec covers the full overhaul: critical bugs (Bundle A), canvas-as-star polish (Bundle B), and wayfinding (Bundle C). User-approved scope.

## Non-goals

- New parsing modes or new milestone kinds. Parsing pipeline stays as-is.
- Persisting view state across sessions (zoom level, pin state) — in-memory only.
- Mobile / touch optimisation. Desktop-only POC.
- Multi-session compare or diff views.

## Approach overview

Modify the existing React+D3 components in place. No new heavy dependencies — `d3-zoom` is already part of the `d3` bundle. State that today lives inside `usePlayback` grows to cover step direction and scrub target; a new `useCamera` hook owns viewport transform (pan/zoom/follow). A new `DetailPanel` component replaces the misplaced tooltip's heavy mode; the existing `NodeTooltip` is repurposed as a lightweight hover preview anchored to the node's SVG position.

```
App
├── SessionList (collapsible, grouped, searchable)
├── GraphCanvas
│   ├── ZoomLayer (d3-zoom + transform)
│   │   ├── edges, nodes, subagent regions  (existing)
│   │   └── HoverTooltip (anchored to node SVG bbox)
│   ├── Minimap (always-on corner)
│   └── Legend (collapsible corner)
├── DetailPanel (right-docked, opens on node click)
├── PlaybackControls (speeds + step + scrubber)
└── NowPlaying (HUD)
```

## Section 1 — Pan, zoom, and the camera

**Why:** Single biggest unblocker. Without zoom the rest barely matters.

- Wrap the existing edge/node `<g>` children in a `<g class="zoom-layer" transform="...">`. Use `d3-zoom` attached to the SVG with `scaleExtent([0.2, 8])`.
- Replace the `viewBox` fit-to-screen logic with a fixed viewBox sized to the container (1:1 CSS pixels). Layout coordinates stay native; the zoom transform handles scaling. Nodes always render at design size (110×28).
- **Initial transform**: fit the whole tree with 24 px margin on first render. Re-fit on `F` key or "Fit" button.
- **Auto-follow**: a new `useCamera({ playback, layout })` hook computes a target transform that centers the active node and zooms to ~1.0 when active node would otherwise fall outside the central 60% of the viewport. Tween via `d3.zoom().transform()` over 280 ms.
  - User-initiated pan/zoom **temporarily disables follow** (sets `followLocked=false`); `L` key or a small lock-icon button re-enables it; `restart` re-enables it.
- **Keyboard**: `+`/`-` zoom, `F` fit, `L` toggle follow, drag-pan, wheel-zoom (with Ctrl for fine-grained scroll on the y-axis — punted, can use pinch on trackpad which d3-zoom handles natively).

## Section 2 — Tooltip + Detail panel

**Why:** Two distinct needs were collapsed into one mispositioned tooltip. Split them.

- **Hover tooltip (light):** lives inside the SVG zoom layer as a `<foreignObject>` (or as a sibling HTML overlay positioned by transforming the node's `(x, y)` through the current camera matrix). Shows label + 1-line summary only. Anchored to the node — moves with pan/zoom. Resolves the "too apart from the nodes" bug.
- **Detail panel (heavy):** right-side docked panel, 420 px wide, opens when user clicks a node. Shows label, kind, summary, result, full `detail` (code/text) with a scroll region. Sticky until: Esc, clicking the same node again, clicking the X, or clicking another node (which swaps content).
  - During playback, opening the panel does NOT pause; user controls playback independently. Pinned node gets a 1.5 px cyan outline ring.
  - Panel pushes the canvas — the SVG container shrinks by 420 px when open so nothing is hidden behind the panel. Re-fit camera on open/close (only if follow is on).

## Section 3 — Playback overhaul

**Why:** "Pukes everything almost at once." Need fine-grained control.

- **Default state: paused at milestone 0.** `usePlayback` initializes `playing: false`. User must press Space or click play.
- **Speed presets:** `0.25× / 0.5× / 1× / 2× / 4×`. Internally each speed maps to a per-node duration: 800/600/400/200/100 ms. (Default `BASE_MS_PER_NODE` raised from 200 → 400 so even `1×` is followable.)
- **Step controls:** `controls.step(+1)` and `controls.step(-1)`. UI: `‹` and `›` buttons flanking the play button. Keyboard: `←`/`→`. Step backward sets `edgeProgress=1` on the previous edge, then decrements `index`.
- **Typewriter coupling:** `NowPlaying`'s typewriter duration becomes `min(180, 0.6 * msPerNode)` so the HUD finishes before the next milestone.
- **Scrubber:** a 6 px-tall horizontal track above the controls bar, full canvas width, with a draggable handle. Position = `(index + edgeProgress) / order.length`. Click to jump; drag to scrub. Scrub pauses playback. On release, playback stays paused (user must press play to resume).
- **Jump-to-event buttons (Bundle C):** small icons in the controls bar — `⌥` next subagent, `⚙` next tool call, `⊘` next failure, `■` end. Each advances `index` to the next matching milestone and resets `edgeProgress`.

## Section 4 — Overflow and large sessions

- Remove the hard >1000 cap.
- When `totalMilestones > 1000`, render the overflow message as a confirmation: "Large session — 1367 milestones. Rendering may take a moment." with a **Load anyway** button. Clicking it sets a per-session `loadConfirmed: true` flag in App state and proceeds to render normally.
- Layout/parse still runs synchronously (fine up to a few thousand nodes); if perf becomes an issue we virtualise edges in a follow-up. Out of scope here.

## Section 5 — Session sidebar

**Why:** 280 px of always-on chrome over redundant rows; canvas should be the focus.

- Collapsible: default open at 280 px, collapsed at 40 px (icon-only rail). A small `‹/›` button toggles. Keyboard: `\` toggles.
- Group by project root (the leading common path). One header per project, expandable. Headers show project name + session count.
- Filter input at the top: 1-line search across `cwd` and timestamp.
- Each session row: condensed `cwd` (last 2 segments), date/time, size. Long lists scroll inside the sidebar.

## Section 6 — Filters, legend, keyboard

- **Filter toggles** in a small top-right corner panel: `[ ] Hide pruned`, `[ ] Hide subagents`, `[ ] Success path only`. Default: all unchecked (show everything; pruned remains dimmed as today).
- **Legend** in bottom-left corner, 240 px wide, collapsible. Lists node states (Idle / Active / Success / Failed / Pruned) and edge styles (Idle / Trail / Subagent dashed / Pruned) with sample swatches matching `tokens.css`. Auto-collapses after first 8 s of playback (re-open on hover or `?` key).
- **Keyboard map:**
  - `Space` toggle play
  - `←` / `→` step back/forward
  - `[` / `]` decrement / increment speed preset
  - `F` fit, `L` toggle follow, `+`/`-` zoom
  - `\` toggle sidebar
  - `Esc` close detail panel
  - `?` toggle legend
  - `M` toggle minimap

## Section 7 — Minimap

- 200 × 140 px, bottom-right corner, semi-transparent.
- Renders a static, downscaled version of the whole tree (nodes as 2 px dots colored by final state; edges as 1 px lines).
- Overlay rectangle = current viewport in layout space (driven by the camera transform). Updates on pan/zoom.
- Click on minimap → camera centers on that layout coordinate. Drag the viewport rect to pan.
- Playhead dot (cyan, 3 px) at the active node.

## Section 8 — Node label truncation

- In `NodeShape.tsx`, truncate the label text to fit 100 px (~16 chars at 11 px monospace). Append `…`. Full label always visible in hover tooltip and detail panel.

## Section 9 — Off-canvas chrome

- Reserve a 64 px bottom gutter for `NowPlaying` + `PlaybackControls`. `GraphCanvas` height is `100% - 64px` so the bottom of the tree is never hidden.
- Session header (`App.tsx:84-100`) moves into the sidebar header (top of sessions panel) rather than floating over the canvas.

## Data flow and state ownership

```
App
  selected, loadConfirmed     ──┐
  session (from useSession)     │
  pinnedNodeId, filters, sidebarCollapsed, legendOpen, minimapOpen
                                │
  ├─ usePlayback(root)          │  // playing, index, edgeProgress, speed, step()
  ├─ useCamera(layout, playback)│  // transform, follow, fit(), zoomTo()
  └─ children read props        │
```

- `usePlayback` gains `step(direction: 1 | -1)`, `scrubTo(t: number)`, default `playing: false`, expanded `Speed` union.
- `useCamera` is new: owns the d3-zoom behavior reference, current transform, and the follow toggle. Exposes `fit()`, `centerOn(id)`, `setFollow(b)`.
- Pinned node id lives in `App` (so DetailPanel and node highlight stay in sync).

## Files to change / add

- **Change:**
  - `src/App.tsx` — pinned-node + sidebar state, overflow confirmation, gutter layout, mount DetailPanel/Minimap/Legend.
  - `src/components/GraphCanvas.tsx` — wrap in zoom layer, anchor tooltip to node bbox, emit click events, drop fit-to-screen viewBox.
  - `src/components/NodeTooltip.tsx` — convert to SVG-anchored light tooltip (or HTML overlay positioned via transform); content trimmed to label + summary.
  - `src/components/NodeShape.tsx` — truncate label, render pin ring when pinned.
  - `src/components/PlaybackControls.tsx` — add step buttons, expanded speed set, scrubber, jump-to-event buttons.
  - `src/components/NowPlaying.tsx` — typewriter duration coupled to speed; gutter positioning.
  - `src/components/SessionList.tsx` — collapsible, grouped, searchable.
  - `src/playback/usePlayback.ts` — `playing` default false; `step()`, `scrubTo()`; expanded speed mapping.
  - `src/theme/tokens.css` — add a couple of tokens (panel background, scrub track, minimap viewport rect).
- **Add:**
  - `src/components/DetailPanel.tsx` — right-docked detail with code area.
  - `src/components/Minimap.tsx`.
  - `src/components/Legend.tsx`.
  - `src/components/FilterToggles.tsx`.
  - `src/graph/useCamera.ts` — d3-zoom integration + follow logic.
  - `src/playback/useKeyboard.ts` — global shortcut handler.

## Testing

- Unit (vitest):
  - `useCamera`: fit math; follow re-targets when playhead leaves central 60%; user pan/zoom flips `followLocked`.
  - `usePlayback`: `step(-1)` correctly reverses on edge-progress boundaries; scrubTo lands on the right `(index, edgeProgress)`; default `playing=false`.
- E2E (Playwright) — extend the existing 5 tests with:
  - Wheel-zoom changes node CSS size (proves SVG is no longer auto-fit).
  - Click node → DetailPanel appears with the node's label; Esc closes it.
  - Tooltip on hover lands within 50 px of the hovered node's bbox (regression for the +280 px bug).
  - Large session (>1000) shows confirmation; after click, renders graph.
  - Scrubber drag updates playhead.

## Risks

- **d3-zoom + React-controlled SVG**: zoom state must be the single source of truth — d3 mutates DOM attrs directly. Standard pattern: store transform in React state, apply via `selection.attr('transform', ...)` inside an effect; let d3-zoom's handler call `setTransform`. Verified pattern.
- **Auto-follow + manual interaction**: easy to make annoying. Mitigation: any user pan/zoom during playback locks follow until restart or explicit `L`.
- **DetailPanel shrinking canvas mid-playback**: layout reflow could jolt the camera. Mitigation: on open/close, re-fit (or re-center on playhead) with a 200 ms tween rather than snapping.
- **Minimap perf at 1000+ nodes**: render to a low-res `<canvas>` once on layout change rather than per-frame SVG. Already cheap.

## Open questions (none blocking)

- Subagent regions in minimap: render their tinted rects too, or omit? **Default: include, at low opacity.** Worth a glance at first build.
- Should scrub-drag scrub through the playback animations (drawing edges) or just snap to discrete milestones? **Default: snap to milestones during drag, smooth on release** — keeps it responsive.
