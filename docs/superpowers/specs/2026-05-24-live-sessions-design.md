# Live Sessions — Multi-Pane Hologram View

Date: 2026-05-24
Status: Approved (design)
Companion mockups: `.superpowers/brainstorm/11077-1779565008/content/` — `live-indicator-v3.html`, `card-text-room-v3.html`, `follow-mode-v3.html`, `live-multipane-v2.html`, `borders-ornate.html`, `border-F-smaller-cd.html`.

## Context

ThoughtGraph today is a post-session playback tool: the user selects a finished `.jsonl` session and scrubs through the agent's decision tree. Sessions in progress are indistinguishable from finished ones on the session card, and there's no way to watch one unfold in real time.

This change adds a **live session experience**. Ongoing sessions are visibly marked in the sidebar. Opening one auto-switches the canvas into a multi-pane "hologram" view that tails the main agent and each currently-active sub-agent. Each pane independently shows its trail, has its own detail panel, and self-cleans after a countdown when the sub-agent it tracks finishes.

The product motivation is the project's north star — TRON-flavored visual focus on what the agent is doing. A live view turns ThoughtGraph from a post-hoc inspection tool into a real-time observatory, which matters most for the multi-sub-agent workflows that have become routine.

## High-level shape

```
session list (sidebar)              canvas                              detail
─────────────────                   ─────                              ──────
[card] · with [● LIVE] tag  →  open  →  is session live?
                                          │
                                          ├─ YES → multi-pane view  →  (per pane)
                                          │        │
                                          │        ├─ MAIN (full trail of main agent)
                                          │        ├─ SUBAGENT N (one per active sub-agent)
                                          │        └─ each: canvas + embedded right detail
                                          │
                                          └─ NO  → existing single-canvas playback view
```

The existing single-canvas view is **unchanged**. Multi-pane is additive — engaged when the open session is live (auto on open) and never forced when not.

## Non-goals

- Incremental byte-offset session refetch. Full `.jsonl` re-parse every 7s is acceptable; revisit only if it blocks the UI on real workloads.
- Per-pane resizable splitters. Equal sizing via CSS grid only.
- A tab strip / overflow chip for large N. The packed-grid rule below handles unbounded N already; it just grows.
- Sound or desktop notification on key events.
- Scrub-to-live affordance in the single-canvas view — replaced by auto-engage.
- Configurable thresholds in UI. 180s / 60s / 30s ship as constants.

## Decisions locked

### 1. Liveness detection

- Server's `SessionMeta` gains `lastUpdatedAt: string` (ISO, sourced from file mtime). Existing `startedAt` field is left alone (it's actually mtime today; a proper rename to "first event timestamp" is out of scope here).
- Client refetches the session list every **7s** via TanStack Query `refetchInterval`.
- Predicate: a session is **live** if `(Date.now() - new Date(meta.lastUpdatedAt)) < 180_000`. Everything else (the `[● LIVE]` tag, the LIVE button, auto-engage, and the open-session poll) derives from this single check.
- When the open session crosses live → not-live, the multi-pane view does **not** auto-fall back to single-canvas. Panes freeze in place (no further updates), the LIVE button greys; the user clicks LIVE off to return to single-canvas, or opens another session.

### 2. Polling the open session

- `useSession` query gains a conditional `refetchInterval: 7_000` while the session is live or LIVE mode is engaged. When neither is true, no polling.
- Each refetch re-parses the full `.jsonl`. Acceptable for now (see Risks).

### 3. Session card — additive change in sidebar

Card chrome and existing CSS in `src/components/library/itemStyle.ts` are **not changed structurally**. Two additions in `SessionsList.tsx`:

**(a) LIVE tag** in the meta row, right side, when `isLiveMeta(s)` is true:

```
┌─────────────────────────────────────┐
│ refactor minimap interactivity      │
│ 2026-05-23 17:50 · 84KB   [● LIVE]  │
└─────────────────────────────────────┘
```

- Tag border: 1px solid `rgba(0,229,255,0.45)`.
- Padding: `1px 6px 1px 5px`. Font: 9px monospace, letter-spacing 2.
- Pulsing dot inside the tag, left of "LIVE": 5×5px, `#00e5ff`, glow `box-shadow: 0 0 6px #00e5ff, 0 0 10px #00e5ff`, 1.4s opacity-and-scale pulse.

**(b) Card title text room** — fixes an unrelated complaint at the same time. Applies to both `SessionsList` and `PromptsList` (they share `ItemShell` / `ITEM_STYLE`):

- `itemTitle` style in both `SessionsList.tsx` and `PromptsList.tsx`: `font-size: 10` (was 12), `display: -webkit-box`, `-webkit-line-clamp: 3`, `-webkit-box-orient: vertical`, `white-space: normal`, `line-height: 1.35`, `word-break: break-word`.
- `ITEM_STYLE.inner.padding` in `itemStyle.ts`: `8px 10px` (was `8px 12px`).
- The `<LiveTag />` only renders in `SessionsList` — prompts are individual user messages, not sessions, so the live concept doesn't apply to them.

### 4. Canvas header toolbar — sized down + LIVE button

The existing FOLLOW and FIT buttons in `GraphCanvas.tsx` (~lines 250–273) at `font-size: 11`, `padding: 4px 10px` are shrunk to **9px / 2px 8px / 20px tall**. A new `[● LIVE]` button is inserted to their left when the session is live:

```
                                                       [● LIVE]  FOLLOW  FIT
```

- LIVE button: cyan border `rgba(0,229,255,0.55)`, text `#00e5ff`, `text-shadow: 0 0 6px rgba(0,229,255,0.55)`, `box-shadow: 0 0 8px rgba(0,229,255,0.18), inset 0 0 8px rgba(0,229,255,0.08)`, pulsing dot left of the label.
- Toggle behavior:
  - **Auto-engaged on opening a live session.**
  - User click toggles between multi-pane and single-canvas.
  - While LIVE is on, the existing **FOLLOW button is hidden** (each pane auto-centers on its own active node; the canvas-level FOLLOW is redundant).
- The LIVE button disappears entirely when the session is not live.

### 5. Multi-pane layout

Replaces the single canvas while LIVE is engaged. CSS Grid:

- Container: `display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: rgba(110,224,238,0.10);` (the gap acts as a 1px hairline divider between panes).
- Each pane occupies one cell.
- When **N is odd**, the last pane gets `grid-column: span 2` and spans both columns.
- When **N = 1**, override to `grid-template-columns: 1fr;` (a single full pane).

Pane count = **1 (MAIN) + every sub-agent that is currently displayable** (active + in-CLOSING-countdown + frozen-by-user).

### 6. Per-pane structure

```
┌──[notch]────────────────────────────────[notch]──┐
│  [● MAIN]                        [tool · Read]   │  ← pane header (22px)
├──────────────────────────────────────────────────┤
│                                       ┌────────┐ │
│       (canvas — nodes + edges)        │ DETAIL │ │
│                                       │ PANEL  │ │  ← inner detail panel (~36% width, min 160px)
│  [CLOSING IN 24s]                     └────────┘ │  ← only on finished sub-agent panes
└──[notch]────────────────────────────────[notch]──┘
```

Each pane has:
- Cut-corner border (see #7).
- Pane header strip at the top with the live dot, label (MAIN cyan / SUBAGENT violet), and the pane's latest status string.
- A canvas area that renders that pane's milestone subtree using the existing `NodeShape` / `EdgePath` components and a per-pane `useCamera`.
- An embedded right-side detail panel (~36% pane width, min 160px), `border-left: 1px solid rgba(110,224,238,0.18); background: rgba(5,8,13,0.92)`.
- An optional bottom-left countdown chip on finished sub-agent panes.

### 7. Border ("hologram" treatment)

Cut-corner octagonal frame + bright triangular notches at each corner + breathing inset glow. **Border-only ornament** — inside the pane stays clean (same node graph, no scanlines, sweeps, reticles, or telemetry readouts).

```css
.live-pane {
  position: relative;
  clip-path: polygon(
    12px 0, calc(100% - 12px) 0,
    100% 12px, 100% calc(100% - 12px),
    calc(100% - 12px) 100%, 12px 100%,
    0 calc(100% - 12px), 0 12px
  );
  animation: paneBreathe 3.5s ease-in-out infinite;
}
@keyframes paneBreathe {
  0%, 100% { box-shadow: 0 0 0 1px rgba(0,229,255,0.55) inset,
                         0 0 0 5px rgba(0,229,255,0.18) inset,
                         0 0 10px rgba(0,229,255,0.10); }
  50%      { box-shadow: 0 0 0 1px rgba(0,229,255,0.70) inset,
                         0 0 0 5px rgba(0,229,255,0.28) inset,
                         0 0 22px rgba(0,229,255,0.32); }
}
/* Bright triangular notches at each corner. */
.live-pane .notch { position: absolute; width: 12px; height: 12px;
                    background: #00e5ff; box-shadow: 0 0 6px #00e5ff;
                    pointer-events: none; }
.live-pane .notch.tl { top: 0;    left: 0;    clip-path: polygon(0 0, 100% 0, 0 100%); }
.live-pane .notch.tr { top: 0;    right: 0;   clip-path: polygon(0 0, 100% 0, 100% 100%); }
.live-pane .notch.bl { bottom: 0; left: 0;    clip-path: polygon(0 0, 0 100%, 100% 100%); }
.live-pane .notch.br { bottom: 0; right: 0;   clip-path: polygon(100% 0, 100% 100%, 0 100%); }
```

Sub-agent panes swap the cyan colors to violet (`#b894ff` matching `--subagent-accent`); same animation.

### 8. MAIN pane content

- Renders the **full** main-agent trail (no sliding window).
- Sub-agent inner content is excluded; each `subagent_spawn` is one node in MAIN (its details live in the matching sub-agent pane below).
- We will revisit a window cap **only if** performance is poor on long sessions.

### 9. Sub-agent pane lifecycle

1. **Appears** when the sub-agent's `.jsonl` file is first present in the session payload's `subagents` array. Sub-agents that fail to parse partial content just don't render until the next refetch.
2. **Declared finished** when its `lastUpdatedAt` is stable for **60s** (no mtime change in that window).
3. **30s CLOSING countdown** then begins. UI per #10.
4. **Removed** when countdown reaches 0; the grid re-flows responsively (remaining panes grow).

Total time between actual sub-agent finish and pane removal = **~90s** (60s detection + 30s countdown), longer if the user freezes the countdown.

### 10. Countdown chip

Position: `bottom: 14px; left: 22px;` inside the cut-corner border, clear of the corner notches.

Size: padding `4px 8px`, font-size 8px, letter-spacing 2px, 2-line layout (label + hint).

Three states:

- **Counting**: red-orange palette (text `#ff7c7c`, border `rgba(255,90,90,0.7)`, background `rgba(20,5,5,0.85)`); slow pulse glow at ~2.4s. Label: `CLOSING IN <num>s`. Subtitle: `hover to abort`.
- **Hover**: amber palette (text `#ffd86b`, border `rgba(255,200,90,0.85)`). Label flips to `STOP CLOSING`. Subtitle: `click to freeze · <num>s left`.
- **Frozen** (after click): orange palette (text `#ffb066`, border `rgba(255,176,102,0.7)`, no animation). Label: `FROZEN · <num>s`. Subtitle: `click to resume`. Clicking again resumes from the frozen value.

### 11. Per-pane detail panel

- Default content = the pane's **newest** node (auto-follows as new milestones arrive).
- Clicking any node in the pane's canvas pins that node; pin holds until LIVE toggles off or the user clicks another node. Incoming new nodes do not override a pinned selection.
- Sub-agent panes use the violet accent on the detail panel's header label.

## Component / file plan

### Server (`server/vite-plugin-sessions.ts`)
- `SessionMeta` type and the list response gain `lastUpdatedAt: string` (= `stat.mtime.toISOString()`).
- `readSessionPayload`: each entry in `subagents` gains `lastUpdatedAt: string`. Shape goes from `{ id, jsonl }` to `{ id, jsonl, lastUpdatedAt }`.

### Types (`src/parse/types.ts`)
- Extend `SessionMeta` with `lastUpdatedAt: string`.
- Extend `SessionPayload.subagents[i]` with `lastUpdatedAt: string`.

### Hooks (`src/api/hooks.ts`)
- `useSessionList`: add `refetchInterval: 7_000`.
- `useSession`: pass through a `live: boolean` parameter; when true, `refetchInterval: 7_000`, else no polling.
- New helper exported alongside: `isLiveMeta(meta: SessionMeta): boolean` = `(Date.now() - +new Date(meta.lastUpdatedAt)) < 180_000`.

### Session card (`src/components/library/SessionsList.tsx`)
- Render a `<LiveTag />` in the meta row's right when `isLiveMeta(s)`.
- Update `itemTitle` style per #3(b).

### Item shell (`src/components/library/itemStyle.ts`)
- `inner.padding: '8px 10px'`.

### Canvas header (`src/components/GraphCanvas.tsx`)
- Shrink the existing FOLLOW + FIT buttons to 9px / 2px 8px / 20px tall.
- Insert a `<LiveButton />` to the left of the trio when the session is live.
- Hide the existing FOLLOW button when `liveEngaged` is true.
- When `liveEngaged`, render `<LivePanes session=… />` instead of the existing SVG canvas.

### New files

- `src/components/live/LivePanes.tsx`
  - Owns the grid layout (2 cols, trailing-odd-spans rule via `.pane:last-child:nth-child(odd) { grid-column: span 2; }`, with the `N=1` override).
  - Resolves the pane set from `session.root` (MAIN) plus the displayable sub-agents.
  - Maintains the per-sub-agent status map: `{ status: 'active' | 'closing' | 'frozen' | 'closed', closingStartedAt: number | null, frozenAt: number | null, frozenRemaining: number | null }`.
  - **Two clocks, not one.** A 1s `setInterval` ticks the countdown display (`CLOSING IN <num>s` must update every second). The 7s `useSession` refetch is what actually delivers new milestones into the panes. These are independent.
  - State transitions on the 1s tick: `active → closing` when `now - subagent.lastUpdatedAt > 60_000`; `closing → closed` when `now - closingStartedAt > 30_000` (and not frozen). On `closed`, remove from the displayable set.
  - Sub-agent display label = the bare agent id (`bareAgentId()` in `src/parse/subagents.ts:31`) truncated to its first 8 chars, prefixed with `SUBAGENT`. MAIN pane label = `MAIN`.

- `src/components/live/LivePane.tsx`
  - Props: `{ kind: 'main' | 'subagent', label: string, milestones: Milestone[], status?: ClosingStatus, onFreezeToggle?: () => void }`.
  - Renders the cut-corner border, notches, pane header, canvas (small subset of existing SVG rendering — same nodes / edges, no minimap, no legend), embedded detail panel, optional countdown chip.
  - Per-pane `useCamera` (each pane its own camera & fit). Smaller pane sizes mean fit/zoom math operates on the pane's own bounding box rather than the full canvas; `useCamera` already accepts the container ref, so no API change is expected — but verify on first integration.
  - Per-pane `pinnedNodeId` state. New milestones arriving do **not** clear the pin; only LIVE-off, another node click, or this pane closing clears it (matches §11 of the design).

- `src/components/live/CountdownChip.tsx`
  - Three CSS variants (counting / hover via `:hover` / frozen). Click toggles the parent's `frozenAt`.

- `src/components/live/LiveButton.tsx`
  - Reusable cyan button with pulsing dot. Used in canvas header.

- `src/components/library/LiveTag.tsx`
  - Reusable cyan tag with pulsing dot. Used in session card meta row.

### App wiring (`src/App.tsx`)
- Add `liveEngaged: boolean` state, reset whenever `selected` changes.
- When the user selects a session, look up the corresponding `SessionMeta` from the `useSessionList` cache. If `isLiveMeta(meta)` is true, set `liveEngaged = true` (auto-engage on opening a live session).
- Pass `liveEngaged` and the meta's live status to `GraphCanvas` (or render `LivePanes` directly from `App.tsx`).
- Pass `live: isLiveMeta(meta) || liveEngaged` to `useSession` for the conditional refetch.
- Edge case — session goes live *after* opening (was finished, then user starts writing to it): we do NOT auto-engage in this case. The card will pulse LIVE in the sidebar and the LIVE button will appear in the header; user clicks to engage. Auto-engage only fires at selection time.

## Verification

1. **Live indicator on cards**: pick a session whose `.jsonl` mtime is within the last 180s — its card shows `[● LIVE]` pulsing in the meta row. Wait ≥180s with no activity → tag fades.
2. **Card text**: long-titled sessions wrap to up to 3 lines; short titles stay compact (1 line). Cards in both modes (sessions and prompts) get the new padding.
3. **Canvas header sizing**: existing FOLLOW + FIT buttons are visibly smaller; `[● LIVE]` appears at the left of the trio for live sessions.
4. **Auto-engage**: opening a live session shows the multi-pane view immediately. Opening a finished session shows the existing single-canvas view (unchanged).
5. **Multi-pane layout law**: with N=1, 2, 3, 4, 5 displayable panes the layout is full · 2-cols · 2+span · 2×2 · 2+2+span respectively.
6. **Border decoration**: cut-corner notches visible at all 4 corners of each pane; breathing glow at ~3.5s; **nothing animated inside** the pane beyond the node graph itself.
7. **Sub-agent finish flow**: when a sub-agent stops writing for 60s its pane shows `CLOSING IN 30s` at bottom-left, counting down. Hover → `STOP CLOSING` (amber). Click → frozen (orange). Click again → resumes. Reaching 0 → pane removed, grid re-flows.
8. **Per-pane detail**: each pane's right detail panel updates to its newest node as milestones arrive. Clicking an older node pins it; clicking a different node moves the pin; toggling LIVE off clears the pin.
9. **Polling cadence (DevTools network)**: session list refetches every 7s; open session refetches every 7s only while live.
10. **Manual E2E**: launch a Claude Code session in another terminal; within ~7s its card shows LIVE; open it; sub-agents dispatched in that session appear as panes; observe a sub-agent finishing and counting down to removal.
11. **Tests**: add one Playwright e2e for the LIVE tag presence on a session whose mtime has been forced to "now" (touch a fixture file).
12. **`npm run typecheck` and `npm test` pass**.

## Risks

- **Performance on long sessions**: re-parsing a multi-MB `.jsonl` every 7s could lag the UI. Mitigation already in design: poll only while live (180s grace). If a real session pushes this, the fallback is a MAIN window cap (deferred per #8).
- **Sub-agent linkage during live mid-write**: existing `attachSubagents` in `src/parse/subagents.ts` may mis-pair sub-agents when a `.jsonl` is partially written. Mitigation: defensive parse — files that fail to yield a parseable header are skipped this round and retried on next refetch.
- **Auto-engage surprise**: a freshly opened live session yanks the user into multi-pane view. Mitigation: LIVE button is always one click away from returning to single-canvas; the indicator pulses while in LIVE mode so the state is obvious.
