# Logical Steps (Narrative View) — Design

**Date:** 2026-06-21
**Status:** Approved (brainstorm 2026-06-20/21)
**Branch:** `feature/logical-steps-narrative`

## Summary

Add a higher-altitude **narrative view** of a session that sits alongside the
execution graph. Instead of one node per execution step (a Thought), it shows a
small, animated stream of plain-language **logical phase blocks** — e.g.
*Explore the codebase → Decide to change `matchRoute()` → Implement the change →
Update callers* — so a user can follow the gist of what the agent is doing
without reading every tool call.

The blocks are produced by an LLM: ThoughtGraph feeds the session's parsed
milestones to a local **`claude -p` narrator** and renders the JSON it returns.
The view works in both **playback** and **LIVE**, is **two-way synced** to the
graph playhead, and is **opt-in** (off until the user enables it per session).

Out of scope for v1: editing/curating blocks by hand; persisting generated
narratives to disk across app restarts (regenerated on demand); narrating
arbitrary cross-session spans (one narrator per session).

## Core principles

- **Opt-in, never automatic.** No model is ever called until the user enables
  the narrative for a session. The app's "just read the logs, no surprises"
  promise is preserved; enabling explicitly states it spawns `claude -p` and
  uses the user's Claude subscription.
- **Reuse the parser, don't re-read JSONL.** The narrator's input is the
  existing `Milestone[]` (id, kind, label, summary, result), not raw events —
  fewer tokens, and stable milestone ids that anchor graph sync.
- **Interpretation layer, visually distinct.** Blocks are a narrative *about*
  the graph, deliberately styled apart from graph Thoughts.
- **Cheap by construction.** One persistent narrator conversation per session;
  incremental updates feed only new milestones; Anthropic-side prompt caching
  serves the retained context at ~0.1× on each tick.
- **Node-side only.** All process spawning and filesystem access stays in the
  Vite plugin layer; the frontend never shells out (consistent with existing
  module boundaries).
- **Deterministic to test.** A fake-narrator mode lets unit/e2e tests run
  without invoking the real CLI.

## Placement & opt-in

The right inspector becomes **tabbed**:

- **`Details`** — today's `HologramPanel` / detail view, unchanged.
- **`Logical Steps`** — the new narrative.

The existing Live/Playback **mode chip** stays in the panel header (consistent
with the hologram detail-view scope). Both tabs work in both modes.

**Enable flow (per session, manual).** The `Logical Steps` tab first shows an
*Enable narrative analysis* prompt explaining it spawns a local `claude -p` and
draws on the user's Claude subscription. Nothing calls a model until the user
clicks enable. Enablement is **per session** — opening a different session shows
the prompt again (no global auto-build that quietly spawns `claude -p` as the
user browses). A lightweight `localStorage` flag may remember "don't show the
explainer again," but the build itself is always an explicit action per session.

**Expand to read.** The tab has a **⤢ expand** affordance that swaps to a split
reading layout — graph on the left, a roomy narrative column on the right — for
sitting and reading the whole story at higher verbosity. Collapsing returns to
the tabbed inspector.

## The blocks

Each block is a logical phase:

```ts
type NarrativeBlock = {
  id: string;                 // stable id from the narrator (or hash of range)
  phase: string;              // coarse group label for verbosity re-bucketing
  title: string;              // short headline, e.g. "Implement the change"
  summary: string;            // one line, ~120 chars
  detail?: string;            // longer text, shown when expanded / Detailed
  status: 'completed' | 'active' | 'upcoming';
  startMilestoneId: string;   // first graph Thought this phase covers
  endMilestoneId: string;     // last graph Thought this phase covers
  thoughtCount?: number;
  toolCount?: number;
};
```

Rendering: a connected **vertical spine**. Completed blocks show a ✓ and a solid
node; the **active** block glows and pulses; **upcoming** blocks are dashed and
faint. Meta chips show Thought/tool counts and a "running…" state. The column
**scrolls**, **auto-follows** the active block (until the user scrolls manually,
mirroring the graph's FOLLOW behavior), and **collapses/groups older completed
phases** when the list grows long so it stays scannable.

## Two-way sync

Each block carries the milestone-id range it covers, which drives both
directions using the playback `order` (the existing DFS flatten of the tree):

- **Playhead → block.** Map the current milestone to the block whose
  `[startMilestoneId, endMilestoneId]` range contains it; highlight that block.
- **Block → graph.** Click a block to scrub the playhead to its
  `startMilestoneId` (playback). In LIVE (newest-node-is-head, no scrubbing) a
  click scrolls/centers the graph on the covered range.
- **Hover → range highlight** on the graph (nice-to-have).

## Generation — the narrator

A **persistent per-session narrator conversation** driven by the local Claude
Code CLI in headless mode.

- **Spawn:** `claude -p --output-format json --model <model>`, prompt on stdin
  / argv. First tick **seeds** the conversation; subsequent ticks use
  `claude -p --resume <narratorSessionId> --output-format json` and pass **only
  the milestones added since the last summary**. The model retains its running
  understanding, so it can still refine earlier blocks; the retained transcript
  is served from Anthropic-side prompt cache (~0.1×), so each tick mostly pays
  for the new slice.
- **Input:** compact JSON of the relevant `Milestone[]` slice (id, kind, label,
  summary, result). The narrator is instructed to emit phase blocks that each
  reference the milestone ids they cover.
- **Output contract:** strict JSON `{ blocks: NarrativeBlock[] }`, parsed
  **defensively** — malformed or partial output keeps the last good block set
  and surfaces a small error chip rather than blanking the view.
- **Model tiers:**
  - Continuous/incremental + initial playback build → **Haiku** (cheap, fast).
  - **⟳ Refresh** → full from-scratch **Sonnet** rebuild in a *new* narrator
    session, shown behind the alien loader.

### Narrator log hygiene (wrinkle)

A `claude -p` narrator writes its **own** session JSONL into
`~/.claude/projects`, which ThoughtGraph would otherwise list as a session and
count in the Usage & Spend page. Mitigation:

1. Run all narrators from a **fixed dedicated cwd** (e.g. an OS temp dir owned by
   ThoughtGraph) so their logs decode to a single, known `projectId`.
2. **Exclude** that `projectId` (and/or a narrator marker embedded in the seed
   prompt) everywhere sessions are enumerated: `/api/sessions`, `/api/prompts`,
   and `server/aggregate-token-usage.ts`.

*Spike first:* confirm whether/where `claude -p` writes logs and that cwd
controls the `projectId`, before finalizing the exclusion mechanism.

## Live vs playback

- **Playback (completed session):** on enable, a single Haiku build over all
  milestones; no further automatic work. Refresh available.
- **LIVE (in-progress):** after enable, the server runs the narrator
  **incrementally** on a **debounced** cadence (min interval **and** a minimum
  amount of new activity before a tick fires, to bound `claude -p` spawns). New
  blocks are **diffed** against the previous set so only genuine changes animate
  (stable blocks don't churn). Generation stops when the session goes idle, with
  an optional final pass.

## Verbosity

Three levels — **Overview · Steps · Detailed** — that **re-bucket
client-side**:

- The narrator always emits fine-grained, `phase`-tagged blocks.
- **Overview** collapses blocks to their `phase` groups; **Steps** shows the
  blocks; **Detailed** shows blocks with `detail` expanded.
- Switching levels is **instant and free — no model call.** Only **⟳ Refresh**
  re-tunes wording with the model.

## Loader & animation

- **Refresh loader: the Armillary sigil** — three CSS-3D rings spinning on
  different axes around a pulsing core, over a dimmed mask of the existing
  blocks, while a Sonnet rebuild runs. Pure CSS 3D, GPU-cheap, reuses the TRON
  cyan/violet palette and shared glow aesthetic. Also shown during the initial
  build.
- **Block animation:** enter = slide + fade in; active = glow + pulse;
  completion settles and adds the ✓. All motion respects
  `prefers-reduced-motion`.

## Components

### Server (Node side)

- **`server/vite-plugin-narrative.ts`** — new Vite dev-server plugin alongside
  `vite-plugin-sessions.ts` / `vite-plugin-control.ts`. Owns the narrative
  endpoints, per-session narrator state, the debounce loop for LIVE, and the
  narrator-log exclusion. Path/input validation follows existing
  session-endpoint hardening.
- **`server/narrator.ts`** — the `claude -p` orchestration: build the seed and
  delta prompts, spawn/resume the CLI, parse + validate the JSON, manage
  narrator session ids and the dedicated cwd. A `TG_NARRATOR_FAKE` mode returns
  canned blocks for deterministic tests.

Per-session server state (in-memory; lost on restart, rebuilt on demand):

```ts
Map<sessionKey, {
  narratorSessionId: string | null,
  model: 'haiku' | 'sonnet',
  lastSummarizedMilestoneId: string | null,
  blocks: NarrativeBlock[],
  building: boolean,
  error: string | null,
}>
```

Endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/narrative/:projectId/:sessionId/start` | POST | Enable + initial Haiku build. Returns blocks or `202 building`. |
| `/api/narrative/:projectId/:sessionId` | GET | Poll current blocks + `building`/`error` (LIVE incremental + build progress). |
| `/api/narrative/:projectId/:sessionId/refresh` | POST | Full Sonnet rebuild in a fresh narrator session; sets `building`. |

### Client

- **`src/components/narrative/`**
  - `NarrativeTab.tsx` — tab host: enable prompt → blocks → loader/error states.
  - `NarrativeBlock.tsx` — one phase block (status, spine, meta chips, animation).
  - `VerbosityControl.tsx` — the 3-level segmented control (re-bucketing).
  - `RefreshButton.tsx` — ⟳ with tooltip + rebuilding state.
  - `ArmillaryLoader.tsx` — the alien rebuild loader.
  - `EnableNarrativePrompt.tsx` — opt-in explainer + enable action.
  - `useNarrativeSync.ts` — playhead ↔ block mapping (both directions).
  - `rebucket.ts` — pure verbosity grouping (fine blocks → level view).
  - `diffBlocks.ts` — pure diff of new vs. previous blocks (animation triggers).
- **Inspector tabbing** — add `Details | Logical Steps` switching to the
  existing right-panel host, plus the ⤢ expand split layout.
- **`src/api/`** — `client.ts` fetchers (`startNarrative`, `fetchNarrative`,
  `refreshNarrative`) and `hooks.ts` query/mutation hooks (LIVE poll on the
  existing 7s cadence; invalidate on refresh).

## Edge cases

- **`claude` not found / not authenticated:** the enable prompt (or a build
  attempt) surfaces a clear error ("Claude Code CLI not found / not logged in")
  rather than failing silently. No retry storm.
- **Malformed narrator JSON:** keep the last good blocks, show an error chip,
  allow Refresh.
- **Very long sessions:** the milestone slice fed to the narrator is bounded;
  LIVE deltas keep input small; the 1000-milestone app cap still applies to the
  graph itself.
- **Long-running narrator conversation:** cap/compact; Refresh resets it. One
  narrator per session; an in-flight tick is cancelled when Refresh is pressed.
- **Server restart:** narrative state is dropped; reopening the tab rebuilds on
  demand (opt-in unchanged).
- **Non-enabled sessions:** zero model activity, zero `claude -p` spawns.

## Testing

- **Unit (pure, mock the spawn):** JSON parse/validation of narrator output;
  `diffBlocks`; `rebucket` (Overview/Steps/Detailed); playhead→block mapping;
  the milestone-slice → narrator-input builder; narrator-session/`projectId`
  exclusion logic.
- **Integration:** `server/narrator.ts` against `TG_NARRATOR_FAKE` — start →
  blocks; incremental delta → appended/refined blocks; refresh → fresh set;
  bad-JSON → last-good retained.
- **E2E (Playwright, fixtures):** enable prompt → enabling renders blocks (fake
  narrator, deterministic); tab switch `Details ↔ Logical Steps`; verbosity
  re-buckets without a network call; Refresh shows the loader then new blocks;
  click a block scrubs the graph. Mind the port-5174 stray-dev-server gotcha;
  the 7 hologram/playback/camera specs are the known-failing baseline.
- **Manual:** one real `claude -p` narrator end-to-end (playback + LIVE),
  verifying log-hygiene exclusion and incremental prompt-cache behavior.

## Decisions log

| Decision | Choice |
|---|---|
| Generation mechanism | Local `claude -p` headless (reuses Claude Code login; no API key) |
| Live updates | One persistent narrator conversation per session; incremental `--resume` with milestone deltas; debounced |
| Default vs enabled | Opt-in, **per session, manual**; never automatic |
| Graph relationship | Two-way synced via milestone-id ranges on each block |
| Placement | Tabbed right inspector (`Details` / `Logical Steps`) + ⤢ expand split read mode |
| Verbosity | 3 levels, **re-bucketed client-side** (no model call); Refresh re-tunes wording |
| Model tiers | Haiku for incremental + initial playback build; **Sonnet** for ⟳ Refresh full rebuild |
| Refresh loader | Armillary sigil (3 CSS-3D rings + pulsing core) over a dimmed mask |
| Narrator input | Parsed `Milestone[]` slice, not raw JSONL |
| Log hygiene | Narrators run from a dedicated cwd; their `projectId` excluded from sessions/prompts/usage |
| Testability | `TG_NARRATOR_FAKE` canned-block mode for unit + e2e determinism |
