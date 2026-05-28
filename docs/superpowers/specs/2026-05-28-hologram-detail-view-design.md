# Hologram Node Detail View

Status: design approved via brainstorm
Date: 2026-05-28
Branch: `feat/hologram-detail-view`

## Context

ClaudeWatch already shows node detail in a docked right-side `DetailPanel` (label, summary, result, raw context block). For pinned Thoughts on the graph we want a second, in-canvas detail surface — a **hologram panel** that projects from the selected node into clear space, connected by an orthogonal line, displaying derived metrics that the existing panel does not surface:

- **Latency** of the turn (and how it compares to the session median)
- **Idle gap** since the previous milestone on the main trail
- **Skills loaded** at this point in the session, with estimated token cost per skill
- **Cache efficiency** for this turn
- **Context size** and delta since the previous turn
- **Token breakdown** (input · cacheRead · cacheCreation · output)

The hologram applies in **both playback and LIVE** modes. It is purely a visualization layer over already-parsed milestone data, plus a small new parse pass for skill activations.

The DetailPanel keeps its current behavior unchanged. The hologram is additive — both surface when a Thought is pinned.

## Decisions locked

### Coexistence with DetailPanel

Both panels surface on pin. They have separate concerns:

- **DetailPanel** = raw text content (label, summary, result, detail, raw context block) and is text-heavy.
- **HologramPanel** = derived/computed signals visualized as an instrument readout.

`pinnedId` (already in `App.tsx`) drives both. The HologramPanel close button (×) in its header strip calls the same `onPin(null)` handler that DetailPanel's close uses.

### Anchor: graph-space

The hologram is rendered inside the existing `<g className="zoom-layer">` in `GraphCanvas.tsx`. It scales with zoom and translates with pan — it is part of the world, "emitted by" the node. No screen-space layer.

### Routed clear space placement

When a Thought is pinned, the canvas computes a panel rectangle in world coordinates that does not overlap visible nodes, then routes an orthogonal connector to it. See [Routing algorithm](#routing-algorithm) below.

### Entrance: stack assemble

When a node is pinned, the panel materializes via a stack-assemble animation: connector draws → frame snaps in → content rows slide down from above with a 60 ms stagger. Total ~700 ms. See [Animation](#animation) below.

### Visual direction

The visual design was iterated to completion in the brainstorm. It is the contract for implementation:

- Panel size: **350 × 400** world units, expanded **350 × ~560** when the skills list is open.
- Frame: 1 px cyan stroke (`#00e5ff`) on `rgba(0,229,255,0.05)` fill, with an ambient outer glow (cyan, blurred).
- Corner brackets: 4× L-shapes at the corners, brighter cyan `#5cf2ff`, glow filter.
- Scanlines: faint horizontal lines every 14 px, cyan at 6 % opacity.
- Connector: dashed mint (`#7fffd4`), 1 px, `stroke-dasharray: 4 3`, opacity 0.6. Soft mint drop-shadow.
- Connector corner accent: a small cyan L (`#00e5ff`, 0.7 px, 0.55 opacity, ~5 px legs) traced on the **outer (convex) side** of each 90° bend, hugging within 2 px of the corner.
- Header strip carries the **ID** (cyan, `T-NNN`), the **kind** (`// ASSISTANT_TURN`, mint, `letter-spacing: 1.6 px`), and an amber **mode chip** that reads `LIVE` or `PLAYBACK`.
- Rows are separated by 0.6 px dividers at `rgba(0,229,255,0.22)` and grouped by section.

Content order top to bottom:

1. Header (id / kind / mode chip)
2. LATENCY (value + mini bar against median + "vs Xs median" sub)
3. IDLE GAP (value + "since prev turn" sub)
4. SKILLS LOADED (header `count · totalTokens`, list of top 5 by tokens with name + mini bar + token count, expand row for the rest)
5. CACHE EFFICIENCY (percent + segmented strip + "cache reads X · misses Y" sub)
6. CONTEXT (label + `↗ +Xk since prev` delta + value)
7. TOKENS · IN · CR · CW · OUT (stacked bar + `a · b · c · d` sub)
8. Footer (timestamp + STREAM tag)

### Mode chip values

- LIVE mode: `LIVE` (amber)
- Playback: `PLAYBACK` (amber)

The chip color stays amber in both — it is a status indicator, intentionally outside the cyan / mint TRON palette so it reads as meta.

### Skills section

- Show top 5 skills by estimated token cost, descending.
- Expand row at the bottom: `▼ N more · totalTokens` — clicking toggles the rest of the list visible.
- When expanded, the panel height grows and the routing algorithm re-runs (because `panelSize` changes), so the panel doesn't suddenly cover other Thoughts.

## Architecture

Three new modules + a small wire-up in `GraphCanvas.tsx`.

```
src/
  components/
    HologramPanel.tsx           (new)  pure SVG hologram, accepts HologramView + connectorPath
  graph/
    hologramLayout.ts           (new)  pure routing: panel placement + connector path
  parse/
    skills.ts                   (new)  extractSkillTrack(events) + skillsActiveAt(milestone, track)
    deriveHologramMetrics.ts    (new)  pure metrics derivation per milestone
  theme/
    hologram.css                (new)  scoped CSS keyframes + variables
```

Wire-up in `src/components/GraphCanvas.tsx`:

- Memoize the pinned milestone (`pinnedId → milestone` lookup is already implicit via `layout.nodes`).
- When pinned, call `deriveHologramMetrics(milestone, prev, session)` → `metrics`.
- Call `skillsActiveAt(milestone, session.skillTrack)` → `skills`.
- Call `layoutHologram(selected, obstacles, visibleRect, panelSize)` → `{ panelRect, connectorPath }`.
- Render `<HologramPanel view={...} panelRect={...} connectorPath={...} expanded={...} onToggleExpand={...} onClose={...} />` as a child of the `zoom-layer` `<g>`.

`pinnedId` change is the only thing that triggers an entrance animation; `key={pinnedId}` on the panel `<g>` forces remount.

## Data model

```ts
// src/parse/skills.ts
export type SkillActivation = {
  name: string                // e.g. "superpowers:brainstorming"
  activatedAt: string         // ISO timestamp from the activating assistant turn
  byTurnId: string            // milestone id of the activating turn
  tokenCost: number           // estimate: ceil(skillResultText.length / 4)
}

export type SkillTrack = {
  activations: SkillActivation[]   // chronological
}

export function extractSkillTrack(events: RawEvent[]): SkillTrack
export function skillsActiveAt(milestone: Milestone, track: SkillTrack): SkillActivation[]
```

```ts
// src/parse/deriveHologramMetrics.ts
export type HologramMetrics = {
  latencyMs: number | null            // null when not measurable
  latencyMedianMs: number             // session-wide median assistant_turn latency
  idleGapMs: number | null            // null when no previous main-trail milestone
  contextSize: number | null          // from milestone.contextSize
  contextDeltaSincePrev: number | null
  cacheEfficiency: number | null      // 0..1, null when no usage
  cacheReads: number | null
  cacheMisses: number | null
  tokens: { input: number; cacheRead: number; cacheCreation: number; output: number } | null
}

export function deriveHologramMetrics(
  current: Milestone,
  prev: Milestone | null,
  session: Session,
): HologramMetrics
```

```ts
// types passed to HologramPanel
type HologramView = {
  milestone: Milestone
  mode: 'live' | 'playback'
  metrics: HologramMetrics
  skills: SkillActivation[]   // sorted desc by tokenCost
  skillsTotal: { count: number; totalTokens: number }
}
```

`Session` (from `src/parse/types.ts`) gains one optional field:

```ts
skillTrack?: SkillTrack
```

Populated by `src/parse/index.ts` when it builds the session.

## Routing algorithm

`src/graph/hologramLayout.ts`:

```ts
type Rect = { x: number; y: number; w: number; h: number }
type Point = { x: number; y: number }

export function layoutHologram(
  selected: LaidOutNode,
  obstacles: LaidOutNode[],   // all visible nodes
  visibleRect: Rect,           // world-space visible region
  panelSize: { w: number; h: number },
): { panelRect: Rect; connectorPath: string }
```

**Step 1 — candidate slots.** For an offset distance `d`, generate one candidate panel rect per direction in this priority order: `NE, NW, SE, SW, E, W, N, S`. The NE slot has its bottom-left corner at `(selected.x + selected.w/2 + d, selected.y - selected.h/2 - d - panelSize.h)`. Other slots are analogous mirrors.

**Step 2 — validate.** A candidate is valid iff:
- it is fully inside `visibleRect`, and
- its rectangle does not intersect any obstacle's inflated bbox.

Obstacle bbox = each node's `(x − W/2 − M, y − H/2 − M, W + 2M, H + 2M)` with `W=116`, `H=32`, `M=8`. `selected` is excluded from obstacles.

**Step 3 — escalate.** Try `d ∈ [24, 48, 96, 192]` in order. Return the first valid candidate found.

**Step 4 — fallback.** If no valid slot exists, score every candidate from step 1 (at `d = 24`) by `−sum(intersectionArea(candidate, obstacle))` and return the highest-scoring one. The panel will partially cover one node but the experience never silently breaks.

**Step 5 — connector.** Given the chosen `panelRect`:
- Identify the nearest panel edge to the selected node (by min Euclidean distance from each panel-edge midpoint to the selected node center).
- Identify the corresponding node edge (top / right / bottom / left).
- If the two edges are axis-aligned and clear, emit a 1-bend L path.
- Otherwise emit a 2-bend Z path. Compute the intermediate point so both segments are axis-aligned and neither passes through an obstacle (single retry: if the natural Z crosses an obstacle, swap the bend order).
- Output is a single `d` string for `<path>`, e.g. `"M nodeEdgeX,nodeEdgeY L bend1X,bend1Y L bend2X,bend2Y L panelEdgeX,panelEdgeY"`.

The function is pure and synchronous. Memoized by `useMemo` on `(pinnedId, panelSize, visibleNodesKey)`.

## Animation

All keyframes in `src/theme/hologram.css`. The panel's root `<g>` has `key={pinnedId}` so React remounts on pin change → entrance plays cleanly.

| t (ms) | Element | Animation |
|---|---|---|
| 0 – 200 | Connector `<path>` | `stroke-dashoffset` `pathLength → 0`, ease-out |
| 200 – 250 | `.holo-shell` (frame + corner brackets + scanlines) | `opacity` `0 → 1` |
| 250 – 310 | Header `<g>` | `translateY(-10px) → 0`, `opacity 0 → 1` |
| 310 – 370 | Latency row | (same, 60 ms later) |
| 370 – 430 | Idle gap row | (same) |
| 430 – 490 | Skills row | (same) |
| 490 – 550 | Cache row | (same) |
| 550 – 610 | Context row | (same) |
| 610 – 670 | Tokens row | (same) |
| 670 – 700 | Footer row | (same) |

Each row uses the same `@keyframes holo-row-slide` with per-row `animation-delay`. The frame's `.holo-shell` uses `@keyframes holo-shell-fade`. The connector uses `@keyframes holo-line-trace`. Easing for slides: `cubic-bezier(.2,.7,.3,1.05)`.

**Exit.** When `pinnedId` clears, parent passes `open={false}`. A `useExitAnimation(open, 200)` hook returns `{ mounted, phase }`. While `phase === 'exiting'` the root group has `opacity: 0` transitioning over 200 ms; on `transitionend` `mounted` flips false.

**Reduced motion.** `@media (prefers-reduced-motion: reduce)` collapses every animation to `opacity 0 → 1` over 200 ms. No translates, no stroke traces.

## Parser extension — skills

### `src/parse/skills.ts`

```ts
export function extractSkillTrack(events: RawEvent[]): SkillTrack {
  const activations: SkillActivation[] = []
  for (const ev of events) {
    if (ev.type !== 'assistant') continue
    const blocks = Array.isArray(ev.message?.content) ? ev.message!.content : []
    for (const block of blocks) {
      if (block.type !== 'tool_use') continue
      if (block.name !== 'Skill') continue
      const skillArg = (block.input as { skill?: string } | undefined)?.skill
      if (!skillArg) continue
      const resultText = findToolResultText(events, block.id)   // walk forward for tool_result
      const tokenCost = Math.ceil((resultText?.length ?? 0) / 4)
      activations.push({
        name: skillArg,
        activatedAt: ev.timestamp,
        byTurnId: ev.uuid,
        tokenCost,
      })
    }
  }
  return { activations }
}

export function skillsActiveAt(milestone: Milestone, track: SkillTrack): SkillActivation[] {
  return track.activations
    .filter(a => a.activatedAt <= milestone.timestamp)
    .sort((a, b) => b.tokenCost - a.tokenCost)
}
```

`extractSkillTrack` runs on the **raw event stream** (not filtered through `chain.ts` / `subagents.ts`), so it sees Skill tool uses regardless of which trail they belong to.

`findToolResultText` walks forward in `events` looking for the matching `tool_result` for the given `tool_use.id`, returning its text content. If none found, `tokenCost` is 0.

### Wire-up in `src/parse/index.ts`

After existing parse passes, call:

```ts
session.skillTrack = extractSkillTrack(rawEvents)
```

`Session.skillTrack` is optional so older parsed sessions without it still work.

### UI display of estimated cost

In the panel, the tokens column shows e.g. `~6.1k` to signal estimation. A tooltip on the row header `SKILLS LOADED` reads: *Token cost is estimated from the skill content length (~4 chars/token).*

## Interaction

| Action | Effect |
|---|---|
| Click node | `onPin(id)` (existing) → DetailPanel and Hologram both mount; entrance animation plays |
| Click same node again | `onPin(null)` → both unmount; exit animation 200 ms |
| Click × on hologram header | `onPin(null)` |
| Esc | Closes both (existing `useKeyboard.ts` behavior — verify Esc still fires when hologram has focus; no expected change) |
| Click `▼ N more` | Toggles `expanded` local state; panel grows; routing re-runs |
| Hover over node when pinned | `NodeTooltip` suppresses itself when `hoveredId === pinnedId` |
| Camera pan | Hologram and connector move with the world (graph-space) |
| Camera zoom | Hologram and connector scale with the world (graph-space) |

LIVE multi-pane: each `<GraphCanvas>` instance owns its own pinned state via its own `App`-level prop wiring. Pinning in pane A does not affect pane B. This matches existing DetailPanel behavior.

## Edge cases

| Case | Behavior |
|---|---|
| `usage` missing on milestone | Token-related rows render `—`; latency/idle still computed from timestamps if available |
| Pinned is `root_prompt` | Idle gap and context delta render `—`; latency renders if computable |
| Zero skills loaded | Skills section header `SKILLS LOADED · 0 · 0k`; no list, no expand row |
| Routing finds no clear slot | Step 5 fallback: NE slot at `d=24`, accept overlap |
| Subagent milestone pinned | Kind shows `// SUBAGENT_SPAWN`; panel colors stay cyan (kind doesn't recolor the frame) |
| `prefers-reduced-motion: reduce` | All animations collapse to a 200 ms opacity fade |
| Pin another node mid-animation | `key={pinnedId}` remounts; previous animation discarded |
| Pinned milestone scrolled off-screen by user pan | Hologram stays anchored in world space at the same offset from the (now-off-screen) node. No special tracking |

## Out of scope

- Multi-pin (showing two holograms at once). Pin model stays single.
- Per-pane independent holograms in LIVE; already supported by virtue of per-canvas state.
- Editing/annotating from the hologram. Read-only by design.
- Recoloring the panel per milestone kind. Stays canonical cyan.
- Live-ticking metrics during a single turn. Hologram updates only when the pinned milestone reference changes.

## Testing

### Unit (vitest)

- `src/parse/skills.test.ts` — fixtures: zero Skill calls, single Skill, multiple Skills across turns, Skill call with missing tool_result, ordering by tokenCost
- `src/parse/deriveHologramMetrics.test.ts` — fixtures: full usage, missing usage, root_prompt, mid-session turn; verify latencyMedianMs computation
- `src/graph/hologramLayout.test.ts` — synthetic scenes:
  - sparse: NE slot at `d=24` wins
  - blocker NE: NW slot wins
  - all 4 corners blocked at `d=24`: escalate to `d=48`
  - dense scene with no clear slot: fallback picks minimum-overlap
  - connector path: 1-bend L when edges align, 2-bend Z otherwise

### Component

- `src/components/HologramPanel.test.tsx`:
  - all sections render with full HologramView
  - missing-usage view renders `—` placeholders
  - skills expand toggles open/close
  - exit animation: `open=false` unmounts after 200 ms
  - `key={pinnedId}` change triggers entrance reset

### E2E (playwright)

- pin opens DetailPanel + Hologram together
- Esc closes both
- click `▼ N more` grows the panel; click again collapses
- zoom-in / zoom-out: panel scales with the canvas
- pan: panel translates with the world
- pinning a different node mid-entrance produces a clean reset (no flicker)

## Files touched

| File | Change |
|---|---|
| `src/components/HologramPanel.tsx` | new |
| `src/graph/hologramLayout.ts` | new |
| `src/parse/skills.ts` | new |
| `src/parse/deriveHologramMetrics.ts` | new |
| `src/theme/hologram.css` | new |
| `src/parse/types.ts` | add optional `skillTrack` to `Session` |
| `src/parse/index.ts` | call `extractSkillTrack` and attach |
| `src/components/GraphCanvas.tsx` | render `<HologramPanel>` inside `zoom-layer` when pinned; suppress tooltip when `hoveredId === pinnedId` |
| `src/parse/skills.test.ts` | new |
| `src/parse/deriveHologramMetrics.test.ts` | new |
| `src/graph/hologramLayout.test.ts` | new |
| `src/components/HologramPanel.test.tsx` | new |
| `tests/e2e/hologram.spec.ts` | new |

`DetailPanel.tsx` is **not** modified — the hologram is purely additive.