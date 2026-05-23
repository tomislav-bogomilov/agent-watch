# Design — Context badge, click-to-set playhead, responsive layout

**Date:** 2026-05-23
**Scope:** Three incremental improvements to the ThoughtGraph POC: per-node context-size badge, click-to-set playback start point, and responsive layout for 13" laptops through 4K displays.

---

## Goals

1. Show the **size of the model's context window** at every traversed node so users can watch context grow across a session.
2. Let users **click a node on the trail** to reposition the playback start point; pressing ▶ then plays forward from there.
3. Make the app **work cleanly on desktop monitors from ~1280px to ~3840px** — no mobile.

Out of scope: mobile/touch, deeper telemetry (cost, latency), changes to the graph layout/animation, changes to the parse pipeline beyond reading the existing `usage` field.

---

## 1. Context size on every "done" node

### 1.1 Data plumbing

Every assistant event in the JSONL carries `message.usage` with `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`. The "context size" displayed is `input + cache_read + cache_creation` — the size of the prompt sent to the model at that turn (matches Claude Code's own context-fullness signal).

New optional fields on `Milestone` (`src/parse/types.ts`):

```ts
export type ContextUsage = {
  input: number;
  cacheRead: number;
  cacheCreation: number;
  output: number;
};

export type Milestone = {
  /* …existing fields… */
  usage?: ContextUsage;     // present on assistant_turn, tool_call, subagent_spawn, completion
  contextSize?: number;     // input + cacheRead + cacheCreation, precomputed for rendering
};
```

Population in `src/parse/milestones.ts`:

- When iterating an assistant event, capture `ev.message.usage`. Attach the same `usage` and computed `contextSize` to:
  - The `assistant_turn` milestone (if the event has text-only output), or
  - Every `tool_call` / `subagent_spawn` milestone derived from the event's `tool_use` blocks (they share one Claude turn → share one usage).
- Tool-only assistant events (no text) still attach usage to each derived tool milestone.
- For user-prompt milestones (`root_prompt`, `user_followup`) which have no own usage, do a small post-pass on the flat list: for each user-prompt milestone, copy the **next** milestone's `usage` and `contextSize` onto it ("context state right after this prompt was appended"). If no following milestone has usage, leave both undefined. Side effect: a clicked user-prompt's detail panel `CONTEXT` block shows the same numbers as the next node, which is correct ("context as the model saw it once the prompt was in place") but worth knowing.

### 1.2 Formatting

`src/util/formatTokens.ts`:

```
n < 1000          → "947"
n < 10_000        → "9.4k"
n < 1_000_000     → "47k"            // primary case
n ≥ 1_000_000     → "1.2M"
```

Same util used by chip, hover hint, and detail panel.

### 1.3 Badge rendering (`NodeShape.tsx`)

Append a small SVG group after the silhouette and label, anchored at the top-right corner outside the W×H box:

- Position: `x = W - 6`, `y = -4` (overlaps the corner slightly, like a notification badge)
- Background `<rect>`: 1px stroke, dark fill `rgba(5,8,13,0.92)`, 2px corner radius, padding ~1px×4px around the text
- Text: `fontSize: 9`, monospace, `letterSpacing: 0.5`, color matches the node state (success-green for done, active-cyan for current, dim for pruned)
- Faint outer glow via existing `tg-glow` filter at reduced opacity

The chip renders only when:

- `node.milestone.contextSize` is defined, AND
- The reveal rule says it should render (see 1.4).

### 1.4 Visibility rule

Default: chip renders only on **traversed nodes** (`traversedIds.has(node.id)`) and the **current node** (`node.id === currentId`).

`FilterToggles.tsx` gains a fourth toggle:

```ts
type Filters = {
  hidePruned: boolean;
  hideSubagents: boolean;
  successOnly: boolean;
  showAllContext: boolean;   // NEW, default false
};
```

When `showAllContext` is true, the chip renders on **every** node that has `contextSize`, including not-yet-traversed and pruned ones.

### 1.5 Hover hint

`NodeTooltip.tsx` already shows on node-group hover with label + summary. Append a new section when the hovered milestone has `usage`:

```
─────────────
ctx · 47k
  input        6
  cache    47.0k       ← cache_read + cache_creation, combined
  output     389
```

(For a milestone whose `usage = { input: 6, cacheRead: 18209, cacheCreation: 28826, output: 389 }`: chip shows `47k`, hover combines cache_read + cache_creation into a single `cache` row at one-decimal precision.) Numbers right-aligned, monospace, dim color for labels and bright for values. If `usage` is undefined, the section is omitted.

### 1.6 Detail panel

`DetailPanel.tsx` gains a `CONTEXT` block when the displayed milestone has `usage`, between the existing summary and the raw detail:

```
CONTEXT
total       47,041
  input          6
  cache read 18,209
  cache write 28,832
  output       389
```

Full integer values (not abbreviated), right-aligned, monospace.

---

## 2. Click-to-set-start-point

### 2.1 Gesture

Single click on a graph node performs both pin and scrub:

```ts
// GraphCanvas.tsx, inside the <g onClick={...}>:
onClick={(e) => {
  e.stopPropagation();
  const idx = orderIndex.get(n.id);
  if (idx != null) onScrubTo(idx);          // moves playhead + enables follow
  onPin(isPinned ? null : n.id);            // existing pin/unpin
}}
```

`onScrubTo` is a new prop on `GraphCanvas` populated by `App.tsx` as `followingControls.scrubTo`. `followingControls.scrubTo` already calls `cameraRef.current?.setFollow(true)` then `controls.scrubTo(i)`. `controls.scrubTo` in `usePlayback.ts` pauses playback and sets `{ index: i, edgeProgress: 0 }`.

Playback **does not auto-start** after the click. The user presses ▶ to play forward from the new position.

### 2.2 Trail repaint

No new state. The existing edge/node state derivation in `GraphCanvas` already keys off the playhead index:

- `traversedIds = playback.order.slice(0, playback.index + 1)` — automatically truncates to the clicked node.
- The inbound edge to the clicked node shows in the paused-at-node `done` state (full draw, no animation) via the existing `pausedAtNode = !playback.playing && edgeProgress === 0` branch.
- Later nodes revert to `idle`; their edges to `idle`.

### 2.3 Prop wiring

`GraphCanvasProps` gains:

```ts
onScrubTo: (index: number) => void;
```

`App.tsx` passes `followingControls.scrubTo` for it. We pass only this one method (not the whole controls object) to keep the canvas's interface narrow.

### 2.4 Edge cases

- **Second click on a pinned node:** Scrubs to the same index (no-op) and unpins. Net: detail panel closes; playhead stays put. Acceptable.
- **Click on an idle (future) node:** Same handler — scrubs forward, pins. Trail extends to that point and the inbound edge shows as done. User can then play forward, or step back.
- **Keyboard:** No changes to `useKeyboard.ts` — space / arrows / restart operate against the new playhead position.

---

## 3. Responsive layout

### 3.1 Constants

`App.tsx`:

```ts
const NARROW_THRESHOLD = 1400;   // px — below this, sidebar auto-collapses
const CONTENT_MAX = 2400;        // px — canvas + gutter + detail panel cap on wide displays
```

### 3.2 Stacked gutter (applies at every viewport width)

`App.tsx` styles.gutter becomes a column:

```ts
gutter: {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '8px 16px',
  borderTop: '1px solid var(--grid)',
  background: 'rgba(5,8,13,0.5)',
  flexShrink: 0,
  // no fixed height — sizes to content (~90–100px)
},
```

The `GUTTER_HEIGHT` constant is removed.

`NowPlaying.tsx` styles.frame:

- Drops `flex: '1 1 380px'` and `maxWidth: 720`.
- Becomes `width: '100%'` so the frame spans the gutter's full content width.
- `maxHeight` stays at 94 with `overflowY: auto` so long summaries still scroll.

`PlaybackControls.tsx`:

- Bar layout: `[‹][▶][›]  [── flex scrubber ──]  [⌥][⚙][⊘][■]  [↺]`
- `Scrubber` switches from `width: 320` to `flex: 1, minWidth: 80`. The `<div ref={trackRef}>` retains its measurement logic (uses `getBoundingClientRect()` which is width-agnostic).
- All buttons keep their existing fixed widths.

### 3.3 Sidebar auto-collapse

Add a small effect in `App.tsx` (no separate hook needed; it's a single use site):

```ts
useEffect(() => {
  let lastBucket: 'narrow' | 'wide' =
    window.innerWidth < NARROW_THRESHOLD ? 'narrow' : 'wide';
  setSidebarCollapsed(lastBucket === 'narrow');   // initial alignment
  const onResize = () => {
    const next: 'narrow' | 'wide' =
      window.innerWidth < NARROW_THRESHOLD ? 'narrow' : 'wide';
    if (next !== lastBucket) {
      lastBucket = next;
      setSidebarCollapsed(next === 'narrow');     // auto only on crossing
    }
  };
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}, []);
```

Behavior:

- On initial mount: sidebar is collapsed iff viewport is narrow.
- On viewport crossing the threshold: sidebar auto-collapses (narrow) or auto-expands (wide).
- **Within** a bucket: manual toggles via `onToggleCollapsed` stick. The user only "loses" their setting on a bucket crossing, which is rare in normal use.

### 3.4 Content cap on wide displays

Insert a centered wrapper inside `<main>` that holds canvas + gutter + detail panel:

```jsx
<main style={styles.main}>
  <div style={{
    ...styles.contentFrame,
    paddingRight: displayedMilestone ? detailWidth : 0,
  }}>
    {/* selection-empty / loading / error / overflow states */}
    {effectiveSession && !needsConfirm && (
      <div style={styles.canvasSlot}>
        <div style={styles.sessionHeader}>…</div>
        <GraphCanvas … />
        <FilterToggles … />
        <Legend />
      </div>
    )}
    {effectiveSession && !needsConfirm && (
      <div data-testid="chrome-gutter" style={styles.gutter}>
        <NowPlaying … />
        <PlaybackControls … />
      </div>
    )}
    <DetailPanel … />
  </div>
</main>
```

Styles:

```ts
main: {
  flex: 1,
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
},
contentFrame: {
  maxWidth: CONTENT_MAX,
  width: '100%',
  margin: '0 auto',         // centers when main is wider than CONTENT_MAX
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',     // detail panel anchors here
  minHeight: 0,
},
```

`paddingRight` reservation for the detail panel moves from `main` to `contentFrame` so the detail panel anchors to the right edge of the **frame**, not the viewport — keeping it aligned with the canvas.

At 3840px viewport with sidebar collapsed (24px) → `main` is 3816px → `contentFrame` centers at 2400px → side bands of ~708px each, just the TRON grid showing through. At 1920px with 280px sidebar → `main` is 1640px → `contentFrame` fills it (no cap engaged).

### 3.5 Camera and pan/zoom

`GraphCanvas` already uses `ResizeObserver` on its container to recompute `viewport`. Because the container now resizes whenever `contentFrame` changes size (e.g., when the cap engages or disengages), the camera continues to fit correctly. No changes to `useCamera` or `layout.ts`.

### 3.6 What this does not change

- `usePlayback.ts`, `useCamera.ts`, `useKeyboard.ts` — untouched
- `layout.ts`, `EdgePath.tsx`, `Minimap.tsx` — untouched
- `LibraryPanel.tsx` internals — untouched (only the collapsed/expanded state is driven differently)
- Detail panel's user resize behavior — unchanged (the panel still anchors to `contentFrame`'s right edge with the user's width)

---

## Acceptance criteria

1. **Context badge**
   - A `47k` style chip appears on every traversed node and the current node by default.
   - Pruned/idle nodes show no chip by default.
   - The `Show all context` filter toggle reveals the chip on every node that has `contextSize` data.
   - Hovering a node shows the breakdown (input / cache / output) appended to the existing tooltip.
   - The detail panel shows the full integer breakdown under a `CONTEXT` heading.
   - User-prompt nodes show the next milestone's context size (state right after the prompt was added).

2. **Click to set start point**
   - Clicking any node moves the playback playhead to that node and opens its detail panel.
   - Playback is paused after the click; pressing ▶ plays forward from the clicked node.
   - The trail visually truncates to the clicked node — earlier nodes show as `done`, later as `idle`.
   - The camera centers on the clicked node (follow is auto-enabled).

3. **Responsive layout**
   - At 1280×720, the app is usable: sidebar auto-collapses, gutter is two-row, scrubber flexes.
   - At 1920×1080, default layout shows expanded sidebar; gutter is two-row; scrubber flexes.
   - At 3840×2160, the canvas + gutter + detail panel center at 2400px max-width with grid side-bands.
   - Resizing across 1400px auto-collapses/expands the sidebar.
   - Manual sidebar toggle inside a bucket persists until the threshold is crossed.
   - Pan/zoom continues to work; the existing fit-on-session-load behavior is preserved.

---

## Risks and mitigations

- **Badge crowding at zoomed-out levels** — chips are at fixed pixel sizes in the zoom layer, so they scale with the graph. At fit-zoom-out for very large sessions, badges may overlap. *Mitigation:* render badge text only when `transform.k ≥ 0.7` (readable threshold). Falls back to "no badge text, just glow dot" below that threshold. Defer to plan stage; first pass renders unconditionally.
- **Bucket-crossing on focus changes** — some users move windows between monitors which crosses the threshold. The auto-collapse will fire each time. *Mitigation:* acceptable for the POC; explicit user-intent tracking can be added later if it becomes annoying.
- **Centered frame + detail panel** — when the detail panel opens at the max-width frame on a 4K display, the canvas suddenly has less horizontal space inside the frame. *Acceptable:* matches existing behavior; the detail panel always reserves space against its parent.

---

## Open questions

None at this point — all design choices were validated through visual companion mockups (placement, narrow layout, wide layout) and terminal Q&A (signal, visibility, gesture).