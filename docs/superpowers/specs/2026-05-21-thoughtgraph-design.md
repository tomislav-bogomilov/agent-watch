# Claude ThoughtGraph — POC Design Spec

**Status:** Approved for plan-writing
**Date:** 2026-05-21
**Source PRD:** `../../../PRD.md`

---

## 1. Overview

Claude ThoughtGraph is a dev-mode visual playback tool for Claude Code session logs. It auto-discovers JSONL session files from the local Claude Code store, parses them into a tree of semantic milestones, and animates the agent's execution path as a glowing trail traversing a top-down decision tree on a dark TRON-inspired canvas. The visualization is the product — UI chrome stays minimal so the graph and traversal take focus.

The POC is `npm run dev`-only. There is no production build target, no hosted version, no user accounts. The audience is the developer running it locally to inspect their own sessions.

## 2. Goals

- Auto-discover Claude Code sessions stored locally — zero user setup beyond `npm run dev`.
- Render a session as a top-down decision tree where each node is a semantic milestone (prompt, assistant decision, tool call, subagent spawn, completion).
- Animate the execution path as a TRON Light Cycle-style trail traversing the tree in real execution order, with the agent's action and result surfaced as a HUD readout.
- Visually distinguish failed tool calls, pruned branches, and the success path that resolved the task.
- Recursively visualize subagent work as branching subtrees with a distinct visual treatment.

## 3. Non-goals (POC)

- Production build, packaging, hosted deploy.
- Multi-session comparison, timeline scrubber, search, filter, export.
- Live file watching for in-progress sessions.
- Slide-in node inspector panel (tooltip covers POC needs).
- LLM-generated summaries — rule-based extraction only.
- Recording new sessions or instrumenting Claude Code.
- Mobile / responsive layout.
- Cross-browser validation beyond Chromium-family — Chrome/Edge are the target; Firefox/Safari are not tested.
- Auth, multi-user, sharing.

## 4. Architecture

```
┌─────────────────────────────────────────────────────────┐
│   React 19 + TypeScript + Vite (dev server only)        │
│                                                         │
│   ┌────────────────┐      ┌─────────────────────────┐   │
│   │   Frontend     │ ◄─── │  Vite plugin middleware │   │
│   │                │ HTTP │   /api/sessions         │   │
│   │   D3 + React   │      │   /api/sessions/:id     │   │
│   │   TanStack Q   │      │  (Node fs against       │   │
│   │                │      │   ~/.claude/projects)   │   │
│   └────────────────┘      └─────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

A single `npm run dev` boots both halves. The Vite plugin is the only Node-side code: it lists session directories under `~/.claude/projects` and streams JSONL on request. The frontend never touches `fs` directly. TanStack Query caches the session index and parsed sessions client-side.

### Module boundaries

| Path | Responsibility |
|---|---|
| `server/vite-plugin-sessions.ts` | Custom Vite plugin: directory listing, JSONL streaming, path validation against `~/.claude/projects` |
| `src/api/` | Typed fetch helpers + TanStack Query hooks (`useSessionList`, `useSession`) |
| `src/parse/` | JSONL → semantic milestone tree. Pure functions, no React, no D3 |
| `src/graph/` | D3 tree layout adapter. Pure, takes a milestone tree, returns laid-out nodes/edges |
| `src/components/` | React: `<SessionList>`, `<GraphCanvas>`, `<PlaybackControls>`, `<NowPlaying>`, `<NodeTooltip>` |
| `src/playback/` | `usePlayback()` hook owning the animation clock |
| `src/theme/` | TRON tokens (colors, glow filters, easing curves) |
| `tests/fixtures/sessions/` | Handcrafted JSONLs for E2E tests |

Each module is independently testable. `parse/` and `graph/` are pure — easy to unit test even though only 3-5 E2E tests are required.

## 5. Data source

Claude Code stores session logs at:

- Main session: `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`
- Subagent sessions: `~/.claude/projects/<encoded-cwd>/<session-uuid>/subagents/agent-<id>.jsonl`

Each JSONL line is an event with fields including `uuid`, `parentUuid`, `timestamp`, `sessionId`, `cwd`, `gitBranch`, `type`, `isSidechain`, and (for messages) a `message` block with content. Tool calls appear as `tool_use` content blocks inside assistant messages; tool results appear as content blocks inside subsequent user messages.

The Vite plugin reads these files directly off the filesystem. The frontend treats them as opaque JSONL strings until the parser processes them.

## 6. Data model

```typescript
type MilestoneKind =
  | 'root_prompt'
  | 'assistant_turn'
  | 'tool_call'
  | 'subagent_spawn'
  | 'user_followup'
  | 'completion';

type Milestone = {
  id: string;              // uuid from JSONL
  kind: MilestoneKind;
  label: string;           // on-node, ~30 chars: "Read package.json"
  summary: string;         // one-line action/decision (~100-180 chars)
  result?: string;         // one-line outcome (when applicable)
  detail?: string;         // full text for tooltip — full prompt body, tool args, snippets
  timestamp: string;
  failed: boolean;         // true if this milestone represents an error
  raw: unknown;            // original event(s), kept for tooltip detail
  children: Milestone[];   // 0 = leaf, 1 = next sequential, 2 = [subagent_root, next_main]
};

type Session = {
  id: string;              // session uuid
  cwd: string;             // working directory of the original session
  startedAt: string;
  root: Milestone;
  successPath: Set<string>; // milestone ids on the success path
};
```

The `children` slot encodes the structure: a sequential next milestone is one child, a subagent spawn is two children (subagent root rendered as a side branch, main flow continuing as the other child). D3's tree layout handles both uniformly.

## 7. Parsing pipeline

```
JSONL events → filter noise → build event chain (parentUuid) →
collapse to milestones → attach subagent subtrees →
mark failures → compute success path
```

### 7.1 Noise filter

Drop the following event types — they exist in the JSONL but represent no semantic step:

- `file-history-snapshot`
- `attachment` (hook outputs)
- `system` (local command stdout)
- `user` messages where `isMeta: true`
- `user` messages whose content matches `/clear`-style command wrappers or `<local-command-caveat>` blocks
- Empty assistant messages

### 7.2 Event chain

Walk events using `parentUuid` → `uuid`. Timestamps are not reliable for ordering (they can be out-of-sequence in practice) — the parent pointer chain is authoritative.

### 7.3 Milestone extraction

| Milestone | Source event |
|---|---|
| `root_prompt` | First non-meta `user` message |
| `assistant_turn` | `assistant` message containing text-only content (no tool calls) |
| `tool_call` | Each `tool_use` content block in an assistant message; merge with its matching `tool_result` from the following user message |
| `subagent_spawn` | Specifically a `tool_use` for the `Task` tool — links to the subagent's milestone tree |
| `user_followup` | Subsequent non-meta `user` message after the root prompt |
| `completion` | Last `assistant_turn` of the session |

### 7.4 Subagent attachment

For each `subagent_spawn`, load the matching `subagents/agent-<id>.jsonl` and recursively build its milestone tree. Attach as the first child of the spawn node. The main flow continues as the second child.

**Subagent linkage mechanism (implementation flag):** The match between a Task `tool_use_id` and a specific `agent-<id>.jsonl` filename is not obvious from naming alone. During parser implementation, validate against real JSONL pairs and pick the linkage signal that holds — candidates: `tool_use_id` referenced inside the subagent's first event, timestamp proximity, or the subagent's first event `parentUuid` referencing a uuid from the parent session.

### 7.5 Result extraction (per tool kind)

| Tool | `result` derivation |
|---|---|
| Read | `"<N> lines, <bytes>"` or `"<N> lines — starts: <first non-empty line>"` |
| Bash | `"exit <code> — <last non-empty stdout/stderr line>"`, truncated to ~120 chars |
| Edit | `"<N> replacements"` or the error message if `is_error` |
| Write | `"Wrote <N> bytes"` |
| Grep | `"<N> matches in <M> files"` |
| Task (subagent) | first sentence of the subagent's final assistant message |
| Other / unknown | first 160 chars of `tool_result.content`, prefixed `"⚠ error: "` if `is_error` |
| Any failed call | error message snippet overrides the rule above |

For non-tool milestones (`root_prompt`, `assistant_turn`, `user_followup`, `completion`), `result` is undefined — the next milestone is the result, or the action IS the result.

### 7.6 Summary extraction

"First sentence" throughout this spec means: split text on `/[.!?]\s+/` and take the first non-empty match, trimmed; if no sentence terminator exists, take the first 160 chars.

| Milestone | `summary` |
|---|---|
| `root_prompt` | First 160 chars of user message |
| `assistant_turn` | First sentence of assistant text (before any tool calls), trimmed |
| `tool_call` | Tool-specific: `"Read <full path>"`, `"Bash: <first line>"`, `"Edit <path>"`, `"Grep '<pattern>' in <path>"`, etc. |
| `subagent_spawn` | The Task tool's `description` argument verbatim |
| `user_followup` | First 160 chars |
| `completion` | First sentence of final assistant text |

### 7.7 Label extraction

Short on-node label (~30 chars):

| Milestone | `label` |
|---|---|
| `root_prompt` | `"Prompt"` |
| `assistant_turn` | `"Decided"` |
| `tool_call` (Read/Edit/Write) | `"<Verb> <basename>"` |
| `tool_call` (Bash) | `"Bash"` |
| `tool_call` (Grep) | `"Grep"` |
| `tool_call` (other) | tool name |
| `subagent_spawn` | `"→ <subagent_type>"` |
| `user_followup` | `"User"` |
| `completion` | `"Done"` |

## 8. Failure & success path

**Failure signals (explicit only, no heuristics):**

- `tool_result.is_error === true`
- Bash `tool_result.content` reports `exit_code` ≠ 0
- Known error-string shapes from specific tools (e.g., `"File does not exist"` from Read)

A milestone with any of the above sets `failed: true`.

**Taint propagation:** A branch is "tainted" if any milestone in it has `failed: true`.

**Success path:** Computed as the chain from `root` to the final `completion` milestone, excluding any tainted branches. Stored as `Set<string>` of milestone ids so the renderer can ask "is this milestone on the success path?" in O(1).

## 9. Visual design

### 9.1 TRON color tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#05080d` | canvas background |
| `--grid` | `#0e1822` | faint perspective grid lines |
| `--edge-idle` | `#1a3a4a` | edges not yet traversed |
| `--edge-trail` | `#00e5ff` | cyan trail itself |
| `--node-idle` | `#0f2632` | node fill before reached |
| `--node-active` | `#00e5ff` | current node (head of trail) |
| `--node-success` | `#7fffd4` + cyan glow | success path after playback completes |
| `--node-failed` | `#ff5d3a` | failed tool calls |
| `--node-pruned` | `#1a1f24` | tainted branches dimmed to near-bg |
| `--subagent-accent` | `#9d6cff` | violet accent for subagent edges/nodes |
| `--text` | `#aeeaf2` | labels |

### 9.2 Background

Subtle static grid (CSS gradient or one-time SVG pattern). No animation — keeps focus on the trail.

### 9.3 Nodes

Rounded rectangles, ~80×26px. Glyph by kind: `>` prompt, `⚙` tool, `⌥` subagent spawn, `■` completion. 1px stroke in the kind's color, fill darker. Failed nodes pulse subtly and carry a small red-dot indicator in the corner so failures are readable from the *static* graph too. Active node has a hard glow halo.

### 9.4 Edges

Straight SVG paths from D3 `linkVertical`. Idle edges at low opacity. As the trail advances, the edge from previous→current animates fill from start to end using `stroke-dasharray`/`stroke-dashoffset` — the Light Cycle line-draw. A brighter circle rides the edge during the draw, fading on arrival.

### 9.5 Glow filter

Single shared SVG `<filter>` with `feGaussianBlur` + `feMerge`, reused across all glowing elements. One filter, not per-node — performance discipline.

### 9.6 Subagent treatment

| Element | Main session | Subagent |
|---|---|---|
| Edge color | `--edge-idle` cyan-blue | `--subagent-accent` violet |
| Edge style | solid | thin / 2px dashed |
| Node stroke | as defined | violet accent on stroke |
| Spawn node | normal | distinct icon `⌥`, slightly larger, violet halo |

A translucent bounding region around each subagent subtree (soft violet fill at ~5% opacity) groups the subagent's work visually.

### 9.7 Playback

`d3.tree()` produces `{x, y}` for each node. React renders the SVG. `usePlayback()` owns the animation clock — it tracks `currentMilestoneIndex` and advances on a timer. Pure data drives everything; no imperative D3 transitions fighting React's reconciler.

Default speed: 200ms per node at 1× (configurable to 100ms / 50ms for 2× / 4×).

**Subagent traversal order:** When the trail hits a `subagent_spawn`, it descends into the subagent subtree first (parent agent is blocked waiting for the subagent), traverses every node depth-first, then returns to the spawn node and continues down the main flow. Temporally faithful.

### 9.8 End state ("wow frame")

When playback finishes:
- Success-path nodes/edges brighten to `--node-success` with a slow continuous shimmer.
- Pruned branches fade further toward `--node-pruned`.
- Failed nodes remain visibly red.

The frozen end-state is the demo's poster frame.

### 9.9 HUD readout (`<NowPlaying>`)

Bottom-center strip, above playback controls. Two-line monospace display:

```
┌──────────────────────────────────────────────────────────────┐
│  ⚙ Bash: npm test                                            │  ← summary (cyan)
│      exit 0 — 12 passed, 0 failed                            │  ← result (dimmer teal)
└──────────────────────────────────────────────────────────────┘
```

- Line 1 (summary) types in immediately when the trail enters a node.
- Line 2 (result) types in at ~60% of the inter-node duration — gives the visual sensation of action → outcome.
- Failed-node results render in `--node-failed` instead of teal.

**During subagent traversal:** the entire HUD strip gets a violet frame and a `⌥ Subagent: <name>` header. The frame drops when the trail exits back to the parent.

### 9.10 Chrome (minimal)

- Top-left: session title + cwd.
- Bottom-center: `<PlaybackControls>` — play/pause + speed pill (1×/2×/4×).
- Left sidebar: `<SessionList>` (collapsible).
- Hover: `<NodeTooltip>` shows `label`, `summary`, `result`, `detail`.
- Nothing else.

## 10. Testing strategy

### 10.1 Unit tests (Vitest) — pure modules only

- `parse/`: noise filter; each milestone-kind extractor; success-path computation correctly excludes tainted branches.
- `parse/result-rules`: each tool's `result` extractor (Read, Bash, Edit, Write, Grep, Task, generic) renders the expected one-liner from fixture `tool_result` blocks.
- `graph/`: D3 tree layout adapter produces stable `{x, y}` for a given milestone tree (snapshot).

### 10.2 E2E tests (Playwright) — five tests

1. **Discovery & load** — Vite plugin lists sessions from a fixture `.claude/projects` directory; sidebar shows them; clicking renders a tree with >0 nodes.
2. **Playback advances** — auto-play starts; trail head moves through ≥3 nodes within 2 seconds at 1×; pause freezes; resume continues from the same node.
3. **Failure rendering** — fixture session with a `tool_result.is_error:true` renders that node in `--node-failed` with the red-dot indicator; its branch dims to `--node-pruned`; the success path doesn't touch it.
4. **Subagent branching** — fixture session whose Task tool call has a paired `subagents/agent-*.jsonl` renders the subagent subtree branching off in violet; traversal descends into it first; HUD frame shows during subagent.
5. **HUD readout** — as trail enters a node, HUD line 1 (summary) appears, then line 2 (result) within the inter-node duration; both update on the next node.

Fixtures live in `tests/fixtures/sessions/` — handcrafted JSONLs covering exactly these cases. Real session logs are not committed.

## 11. Risks & implementation flags

| Risk | Mitigation |
|---|---|
| **Subagent linkage** — matching a `Task` `tool_use_id` to its `subagents/agent-*.jsonl` is not derivable from filename alone | Validate during parser implementation against real JSONL pairs; pick the signal that holds. Candidates: `tool_use_id` reference inside the subagent file, timestamp proximity, or first-event `parentUuid` |
| **JSONL schema drift** between Claude Code versions | Pin POC to current observed schema (Claude Code 2.1.x). Treat unknown event types as ignorable noise rather than errors |
| **Long-session performance** — sessions with 500+ events may strain D3 layout / SVG glow filters | Cap at 1000 milestones; render a "Session too large for POC" message above that. Single shared SVG `<filter>` (not per-node) |
| **Unknown tools** — extraction rules cover Read/Bash/Edit/Write/Grep/Task; other tools fall through to generic | Acceptable degradation — generic rule shows tool name + truncated JSON args |
| **TRON contrast in bright rooms / projectors** | Out-of-scope for POC; flagged as a demo-environment concern |

## 12. Definition of done

- `npm run dev` boots the app on `localhost:5173` (Vite default).
- Sidebar lists every session under `~/.claude/projects` on first load.
- Clicking a session renders its full milestone tree on the dark canvas within 1 second for sessions ≤500 milestones.
- Auto-play starts on render; play/pause and speed (1×/2×/4×) work.
- Failed nodes, pruned branches, and the success path are visually distinct per Section 9.
- Subagent subtrees render with violet accent and are traversed depth-first before main flow continues.
- HUD readout shows summary + result with the typewriter cadence and violet frame during subagent traversal.
- All 3 unit + 5 E2E tests pass.

---

*Spec finalized 2026-05-21. Next: implementation plan via the writing-plans skill.*