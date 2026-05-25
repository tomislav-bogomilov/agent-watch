# UI polish pass — minimap, filter chip, path display, details panel, LIVE transparency, replay canvas card

## Context

The user asked for a series of UI changes to ThoughtGraph that share a single goal: lift the visual quality of the app toward its TRON-inspired direction without changing the underlying behavior. Six locked design decisions came out of the brainstorming session (each tied to a specific user pick in the visual companion):

1. **Minimap** — make it more interesting, more "hologram"
2. **Filter bar** — make collapsible vertical (small chip → expanded checkbox list)
3. **Path display** — replace OS home prefix with `~/` everywhere a path appears in the UI
4. **Details panel** — give the right-side panel its own visual identity so it stops blending with the canvas
5. **LIVE panes** — pane backgrounds opaque (block body grid) + right detail strip overlaps clip-path corners
6. **Replay canvas** — wrap the SVG canvas in a bordered card matching LIVE pane shape language, move toolbar buttons into the header

**Explicit non-change:** the left library panel (sessions/prompts list) stays as is. Sidebar layout, item shells, dropdown, drag-reorder — nothing in `src/components/library/**` changes.

All changes are purely visual / display-only. No data shape changes, no behavior changes beyond a collapsed-state for the filter chip and the toolbar relocation. The session header gains a fixed-right toolbar group; everything else preserves existing keyboard shortcuts, controls, and APIs.

---

## Locked design decisions

### 1. Minimap (`src/components/Minimap.tsx`)

- **Background**: star field — multiple stacked `radial-gradient(...) dot grids` at different scales/colors (cyan + teal) + a soft center cyan glow + the existing dark base (`rgba(5,8,13,0.92)`).
- **Border**: thin 1px cyan border with a **medium** outer glow (~10px) that breathes (3.5s `ease-in-out infinite`, same rhythm as LIVE panes). Pattern: `box-shadow: 0 0 10px rgba(0,229,255,0.55), inset 0 0 10px rgba(0,229,255,0.20)` resting → `0 0 14px / inset 0 0 14px` peak.
- **Tick graticule**: tiny cyan tick marks every 25px along all four edges (3px long on edges, 5px at center). Drawn as SVG `<line>` inside the SVG transform group OR as an extra `<g>` outside it (don't transform with zoom). `stroke="#00e5ff" stroke-opacity="0.55"`.
- **Sonar ping** on the current-node dot: extra `<circle>` at the same center with SVG `<animate>` of `r` from 5 to 14 and `stroke-opacity` from 0.8 to 0 over 1.6s, `repeatCount="indefinite"`. No fill, `stroke="#00e5ff" stroke-width="1.5"`.
- **Interior polish**: viewport-rect gets `fill="rgba(0,229,255,0.08)"` + cyan drop-shadow filter; the current-node dot keeps the existing 5px radius but gains a drop-shadow filter; edge lines reduced to `stroke-opacity={0.7}`.
- **No corner brackets, no corner notches, no scanlines.**

### 2. Filter bar — collapsible (`src/components/FilterToggles.tsx`)

- State: `useState<boolean>` for `open`, persisted to `localStorage` under `tg.filters.open` (default: closed on first visit).
- **Collapsed chip**: hamburger glyph `≡` + label `FILTERS` + numeric badge with the count of active filters (only rendered when ≥1). Cyan border, dark translucent fill, on-hover brighter border. Same position as today's `FilterToggles` box (`top: 52, left: 24`).
- **Expanded panel**: small vertical card with a header row (`≡ FILTERS` + `×`) and one row per filter (checkbox + label). Same four filters in the same order: `hide pruned`, `hide subagents`, `success only`, `show all context`. Active row gets a cyan-filled checkbox; clicking anywhere on the row toggles.
- **Test IDs** preserved: `filter-toggles`, `filter-pruned`, `filter-subagents`, `filter-success-only`, `filter-show-all-context`. Add `filter-toggle-collapsed` for the chip and `filter-close` for the X.

### 3. Path display — home-prefix substitution

- New utility `src/util/formatPath.ts`. Pure function `formatPath(path: string): string` plus `formatPath.ts` test file.
- Match in this order (first wins), replacing the matched prefix with `~/` (or `~\` on Windows-style):
  1. `^([A-Za-z]:[\\\/])Users[\\\/]([^\\\/.]+\.[^\\\/]+)[\\\/]` → Windows with dotted username (e.g. `alex.smith`)
  2. `^([A-Za-z]:[\\\/])Users[\\\/]([^\\\/.]+)[\\\/]([^\\\/.]+)[\\\/]` → Windows with split-dot username appearing as two dot-free segments (e.g. `alex/alexov`, which is how the cwd appears in the parser data we observed)
  3. `^([A-Za-z]:[\\\/])Users[\\\/]([^\\\/]+)[\\\/]` → Windows single-segment user (fallback)
  4. `^\/Users\/([^\/]+)\/` → macOS
  5. `^\/home\/([^\/]+)\/` → Linux
  6. Otherwise: return unchanged.
- Apply at every visible-path render: today that's `src/App.tsx:211` (`sessionCwd` span). Search for any other consumer of `session.cwd` that surfaces it as visible text.
- **Tooltip on hover**: the displayed `~/...` element gets `title={fullPath}` so the verbatim path is one hover away.
- **Copy button**: unchanged — `CopyCwdButton` still receives and copies the full `effectiveSession.cwd`.
- **`projectKey` in library** (`src/components/library/LibraryPanel.tsx:28`) is unaffected — it already uses `parts.slice(-2)` and shows things like `AI/ThoughtGraph` rather than the full path.

### 4. Details panel background (`src/components/DetailPanel.tsx`)

- Replace `background: 'rgba(5,8,13,0.95)'` with:
  ```
  background:
    linear-gradient(180deg, rgba(0,229,255,0.08), rgba(5,8,13,0.95) 60%, rgba(5,8,13,1)),
    #050810;
  ```
- Add to `box-shadow`: `inset 1px 0 0 rgba(0,229,255,0.22), inset 6px 0 18px rgba(0,229,255,0.06)` (keep the existing `-12px 0 24px rgba(0,0,0,0.4)`).
- Border-left stays `1px solid var(--edge-idle)` but bump to `0.55` opacity (slightly more visible).
- No layout / sizing changes.

### 5. LIVE panes (`src/components/live/LivePane.tsx`)

- **Wrapper background**: change from `#050810` to `transparent`. The body grid (from `index.css`) now extends behind each pane's canvas area.
- **Detail strip (`<aside data-testid="live-pane-detail">`)**: keep `width: 36%` and `minWidth: 160`, but:
  - **Inset 12px** from right/bottom and from the existing 24px top padding (so the strip never collides with the clip-path corner cuts or the BR notch). Effective layout: `margin: 24px 12px 12px 0` (inside the existing flex layout, no `align-self: stretch` needed because flex stretches by default).
  - Replace the flat `background: 'rgba(5,8,13,0.92)'` with the **D3 treatment** so it reads as the same surface as the main details panel:
    ```
    background:
      linear-gradient(180deg, rgba(0,229,255,0.08), rgba(5,8,13,0.95) 60%, rgba(5,8,13,1)),
      #050810;
    ```
    For subagent panes (`kind === 'subagent'`), flip the tint to purple: `rgba(184,148,255,0.10)` at the top stop.
  - `box-shadow: inset 1px 0 0 rgba(0,229,255,0.22), inset 6px 0 18px rgba(0,229,255,0.06)` (purple equivalents on subagent: `184,148,255`).
  - `borderLeft` becomes `1px solid rgba(0,229,255,0.55)` (purple equivalent on subagent).
- **Header overflow fix** (separate concern the user surfaced): the pane header (`headerStyle` builder) currently wraps `<span>{label}</span>` and `<span>{newest?.summary}</span>` in a `space-between` flexbox without truncation. Add to the summary span: `whiteSpace: 'nowrap'`, `overflow: 'hidden'`, `textOverflow: 'ellipsis'`, `minWidth: 0`, `flexShrink: 1`, `marginLeft: 12`. Also give the label span `flexShrink: 0`.

### 6. Replay canvas card + header toolbar move (`src/App.tsx`, new wrapper component)

- **Layout change**: today the canvas, toolbar, filter chip, legend, minimap all sit inside `canvasSlot`. The session header is absolutely positioned at top-left, overlapping the canvas. The toolbar is also overlay-positioned (via `CanvasToolbar.tsx`).

  New layout when the session is **not** in LIVE mode:
  ```
  canvasSlot (flex column, gap 8px)
    sessionHeader (flex row, items-end)
      sessionHeader-text (flex 1, min-width 0)
        title (truncate)
        cwd row (truncate)
      sessionHeader-tools (margin-left: auto)  ← FIT / FOLLOW / LIVE here, far right
    canvasRow (flex 1, position: relative)
      canvasCard (flex 1, the bordered C1 surface)
        GraphCanvas       (transparent inner)
        FilterToggles     (top-left of card)
        Legend            (bottom-left of card)
        Minimap           (bottom-right of card; shifts left when details panel is open)
      [floating DetailPanel — position: absolute; top: 0; right: 0; bottom: 0; width: detailWidth, z-index: 7]
    gutter (NowPlaying + PlaybackControls; unchanged)
  ```

- **Canvas card (the C1 treatment)**: a new `<div className="canvas-card">` wrapping `<GraphCanvas>` and its overlays. Apply:
  - `border: 1px solid rgba(0,229,255,0.55)`
  - `clip-path: polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px)`
  - `animation: paneBreathe 3.5s ease-in-out infinite` (reuse the keyframe already defined in `src/theme/live-pane.css:5`)
  - Four cyan corner notches (12×12 triangles with `clip-path` polygons + cyan box-shadow glow), styled the same way as `LivePane.tsx:54`'s `notchStyle('tl'|'tr'|'bl'|'br', '#00e5ff')`.
  - Background remains transparent.
- **Toolbar relocation**: remove the `<CanvasToolbar>` from inside `canvasSlot`; render its buttons inline in the session header's right group. Existing component can be reused if we expose a "buttons only" mode (no positioning), or its JSX is inlined into App.tsx. Preserve `showLive`, `showFit`, `showFollow` flags and click handlers exactly as today.
- **Details panel docking** changes from "right-side push" to "right-side overlay":
  - Today: `contentFrame` gets `paddingRight: displayedMilestone ? detailWidth : 0` (`App.tsx:185`) and `DetailPanel` is absolutely positioned at `top:0 right:0 bottom:0`. The padding pushes the canvas left.
  - New behavior: drop the conditional `paddingRight`. `DetailPanel` still positions absolutely, but its containing block is the canvas card (or `canvasRow`), not `contentFrame`. The card no longer reflows.
  - The minimap inside `GraphCanvas` already absolutely-positions to `right: 12; bottom: 12`. When the details panel is open we shift it left by `detailWidth + 12` so it docks against the panel's left edge. Implement via a prop on `<GraphCanvas>` (`detailPanelOpen: boolean` + `detailPanelWidth: number`) that the Minimap reads.
- **LIVE mode keeps its own `LivePanes` layout entirely.** None of the canvas-card changes apply there — `App.tsx:216` branch is untouched. The session header / toolbar relocation does still apply when LIVE is engaged (the header sits above the LivePanes outer container), but the LivePanes outer container itself remains transparent and uses its own border + breathing.

---

## Critical files to modify

| File | What changes |
|---|---|
| `src/components/Minimap.tsx` | star-field background; thin cyan border with medium-glow breathing animation; tick graticule SVG group; sonar ping `<circle>` with `<animate>`; viewport-rect fill + drop-shadow; current-node drop-shadow; edges to 0.7 opacity; new prop `detailPanelOpen?: boolean; detailPanelWidth?: number;` used by `App.tsx` for the bottom-right shift |
| `src/components/FilterToggles.tsx` | restructure to collapsible: chip (`≡ FILTERS [N]`) + expanded panel. Add `tg.filters.open` localStorage. Keep all existing test ids; add `filter-toggle-collapsed`, `filter-close` |
| `src/components/DetailPanel.tsx` | D3 gradient background + inner-glow box-shadow; border-left opacity bump |
| `src/components/live/LivePane.tsx` | wrapper background → transparent; detail strip inset + D3 background (cyan / purple variants); header summary truncation |
| `src/util/formatPath.ts` *(new)* | pure `formatPath(s)` function + unit tests |
| `src/util/formatPath.test.ts` *(new)* | covers all five match patterns + the no-match passthrough |
| `src/App.tsx` | new `canvasCard` wrapper around `<GraphCanvas>` + overlays; move toolbar buttons into session header; drop conditional `paddingRight` on `contentFrame`; pass `detailPanelOpen` and `detailWidth` to `GraphCanvas`; apply `formatPath` to the rendered `effectiveSession.cwd`; keep `CopyCwdButton value={effectiveSession.cwd}` (full path); add `title={effectiveSession.cwd}` to the cwd span |
| `src/components/GraphCanvas.tsx` | accept + forward `detailPanelOpen` and `detailPanelWidth` to `<Minimap>` |
| `src/components/CanvasToolbar.tsx` | either deleted (if buttons inlined in App.tsx) or refactored to a "buttons only" variant with no absolute positioning |
| `src/theme/live-pane.css` | reuse existing `paneBreathe` for the replay canvas card (already exported, no change needed); may add a `cardBreatheSm` variant if we tune the glow differently |

**Reused utilities / functions:**
- `paneBreathe` keyframe (`src/theme/live-pane.css:5`) — same animation for the replay canvas card.
- `notchStyle` (`src/components/live/LivePane.tsx:54`) — reuse for the canvas card's corner notches (consider lifting to a shared util).
- `CopyCwdButton` (`src/components/CopyCwdButton.tsx`) — unchanged consumer.
- `ResizeHandle` (`src/components/ResizeHandle.tsx`) — unchanged; the floating DetailPanel still uses it for width.
- `usePersistentWidth` (`src/util/usePersistentWidth.ts`) — unchanged.

---

## Verification

1. **Run the app**: `npm run dev` and open at `http://localhost:5173`.
2. **Minimap** — select a session; verify:
   - Star field is visible in the bottom-right minimap.
   - Tick marks line all four edges every ~25px.
   - Current-node dot pulses with the sonar ping every ~1.6s.
   - Border breathes (3.5s rhythm).
3. **Filter chip** — verify:
   - Defaults to collapsed.
   - Click expands to vertical panel with four checkboxes.
   - Click X collapses.
   - Open/closed state persists across page reload.
   - Active-count badge updates as you toggle filters.
4. **Path display** — verify:
   - Session header shows `~/work/AI/ThoughtGraph` (not `C:/Users/alex/alexov/...`).
   - Hover the cwd text — tooltip shows the full path.
   - Click the copy button — clipboard receives the full path.
5. **Details panel** — click a node to pin it; verify:
   - Panel background reads as a cyan-gradient surface, visibly different from the canvas.
   - Inner cyan glow visible on the left edge.
6. **LIVE panes** — open a live session; verify:
   - Body grid lines visible behind each pane's canvas (transparent wrapper).
   - Right detail strip has D3 gradient (cyan for MAIN, purple for subagent).
   - Detail strip top-right and bottom-right corners clear the clip-path cuts (no chopped text).
   - Pane header summary text truncates with ellipsis when long.
7. **Replay canvas card** — non-live session; verify:
   - SVG canvas sits inside a cyan-bordered, breathing card with diagonal corner cuts and four notches.
   - Session header is above the card; FIT / FOLLOW / LIVE buttons are at the far-right of the header.
   - Clicking a node opens the floating DetailPanel docked to the card's right edge; minimap shifts left by `detailWidth + 12` to clear it.
   - Closing the panel restores the minimap to the right edge.
   - Legend stays in its collapsible chip at bottom-left.
   - Gutter (NowPlaying + PlaybackControls) is unchanged.
8. **Library panel** — confirm zero visual change to the sessions/prompts sidebar (item shells, dropdown, drag-reorder).
9. **Playwright sanity** — open `tests/e2e` and run any existing screenshot tests; expect baseline shifts and update intentionally.

If all eight steps pass on a session with at least one subagent, the change set is verified.
