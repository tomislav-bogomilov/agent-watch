# Left Panel: Sessions / Prompts Modes — Design

**Date:** 2026-05-22
**Status:** Draft, awaiting user review

## 1. Goal

The left panel today lists Claude Code **sessions**, grouped by project, with draggable group ordering and per-session rename. Add a second mode — **Prompts** — that lists every user-typed prompt across all sessions (same project grouping, also draggable). The user picks the mode with a dropdown that sits where the panel title is today. Clicking a prompt opens a **scoped sub-graph**: the slice of milestones from that prompt up to the next user prompt (or end of session), played back with the same playback machinery used for full sessions.

## 2. Non-goals

- No new prompt-authoring or prompt-template features. "Prompts" here means the user-typed messages already present in existing Claude Code session logs — surfaced as a different way to navigate the same data.
- No cross-session aggregation or comparison. One prompt → one scoped sub-graph from one session.
- No prompt rename. Sessions are renameable today; prompts are not.
- No project-filter dropdown. The "dropdown" in scope is solely the mode switcher; project grouping stays inline as draggable group headers, identical to today's Sessions UX.

## 3. Architecture

Three slices, each well-bounded:

- **Server** — one new endpoint `/api/prompts` plus a prompt-extraction helper, both in `server/vite-plugin-sessions.ts`. Reuses the existing JSONL streaming, `isMeaningfulUserText` cleaning, `decodeProjectId`, `claudeHome`, and `isSafeId` helpers.
- **Sidebar** — replace `src/components/SessionList.tsx` with a three-file split under `src/components/library/`. A shell owns dropdown/filter/collapse/resize/project-grouping; two thin child renderers render rows per mode.
- **Scoped graph** — one pure function `sliceSession(session, promptId)` in `src/parse/slice.ts` that returns a `Session`-shaped object with the milestone chain restricted to that prompt's turn. `App.tsx` chooses between the full session and the sliced session before feeding into the unchanged `GraphCanvas` + `usePlayback`.

### Data flow

```
Sessions mode:
  /api/sessions → list → click
                       → /api/sessions/:p/:s → parseSession → root → GraphCanvas

Prompts mode:
  /api/prompts → list → click
                      → /api/sessions/:p/:s → parseSession → sliceSession(s, id) → GraphCanvas
```

Both modes converge on the same `useSession` hook and React Query cache.

## 4. Backend: `/api/prompts`

Add the endpoint alongside `/api/sessions` in `server/vite-plugin-sessions.ts`.

### Response shape

```ts
type PromptMeta = {
  projectId: string;         // same encoded id used by /api/sessions
  sessionId: string;
  promptId: string;          // the JSONL event uuid — keys sliceSession
  kind: 'root' | 'followup';
  text: string;              // cleaned snippet, truncated to PROMPT_MAX_CHARS
  timestamp: string;         // ISO from the event
  ordinal: number;           // 0-based index of this prompt within its session
};

// GET /api/prompts → { prompts: PromptMeta[] }
```

### Extraction

One streaming pass per JSONL file:

1. Read the file line-by-line, `JSON.parse` each line, skip events where `isMeta === true`.
2. Keep only events where `type === 'user'` and `message.role === 'user'`.
3. Extract the text content: if `message.content` is a string, use it; otherwise concatenate the `text` blocks (mirroring the `plainText` logic in `parse/milestones.ts`). Tool-result-only `user` events are skipped because their content is all `tool_result` blocks with no text.
4. Run the result through `isMeaningfulUserText` (already in `vite-plugin-sessions.ts`) to drop slash commands, command tags, caveats. If it returns `null`, skip.
5. Emit a `PromptMeta`. `promptId = event.uuid`, `ordinal` starts at 0 for the first surviving prompt in the file and increments. `kind = ordinal === 0 ? 'root' : 'followup'`. `text` is truncated to `PROMPT_MAX_CHARS` (140) with an ellipsis.

Sort the global result newest-first by `timestamp`. Send `{ prompts }`.

### Constants

- `PROMPT_MAX_CHARS = 140` (longer than `TITLE_MAX_CHARS` because prompts dominate the row).

### No cache

The dev server re-scans on every request; sessions count is small. If perf bites later, an LRU keyed by `(filepath, mtime)` is the obvious fix — out of scope here.

## 5. Frontend: sidebar restructure

### File layout

```
src/components/library/
  LibraryPanel.tsx     — shell (~220 lines)
  SessionsList.tsx     — session rows (~80 lines)
  PromptsList.tsx      — prompt rows (~60 lines)
```

`src/components/SessionList.tsx` is deleted. `App.tsx` imports `LibraryPanel` instead.

### Selection model

`App.tsx` widens its `Selected` state:

```ts
type Selection =
  | { kind: 'session'; projectId: string; sessionId: string }
  | { kind: 'prompt';  projectId: string; sessionId: string; promptId: string };
```

`useSession(projectId, sessionId)` is called with the projectId/sessionId from the selection (same hook, same cache key for either kind — selecting a prompt from a session you already opened is instant).

### LibraryPanel responsibilities

- Mode dropdown (`<select>`, styled to match the existing `--edge-trail` cyan title) in the row where `<h2>SESSIONS</h2>` lives today. Collapse button stays at the right edge of that row.
- Persisted mode in `localStorage` under `tg.library.mode` (values: `'sessions' | 'prompts'`, default `'sessions'`).
- Filter input (unchanged).
- Calls `useSessionList()` and `usePromptList()` (new hook for `/api/prompts`). Both return cheap metadata. Both are always loaded; the dropdown switch is instantaneous.
- Groups the active list by `projectKey(cwd)` (function unchanged).
- Persists group expansion (`tg.projects.expanded`) and project order with drag/drop (`tg.projects.order`) — same keys as today, shared across modes (a project's group state applies to whichever list is showing).
- Resize handle and collapsed-mode rendering unchanged.
- Hands each group's items to `<SessionsList>` or `<PromptsList>` based on mode.

### SessionsList responsibilities

- Renders a group's session items: title (with persisted-rename via double-click, same `tg.session.titles` store), cwd, `mtime · sizeKB`.
- Highlights the row when `selected.kind === 'session' && selected.sessionId === item.sessionId`.
- Click → `onSelect({ kind: 'session', projectId, sessionId })`.

### PromptsList responsibilities

- Renders a group's prompt items: prompt text snippet (primary, `--text`), session subtitle (small/dim, format: `SESSION ⟨first-8-of-sessionId⟩` or the session's renamed title if present in `tg.session.titles`), and timestamp.
- Within a group, items are ordered newest-first by `timestamp`.
- No rename, no extra metadata.
- Highlights the row when `selected.kind === 'prompt' && selected.promptId === item.promptId`.
- Click → `onSelect({ kind: 'prompt', projectId, sessionId, promptId })`.

### Filter behaviour

Filter input is a lowercase substring match. In Sessions mode it matches `cwd + (renamed-title || cwd basename)` (current behaviour). In Prompts mode it matches `cwd + prompt.text`. Same input, behaviour switches with mode.

### Dropdown styling

Native `<select>` with `appearance: none`, a custom `▾` glyph absolutely-positioned to the right, 1px `--edge-trail` border, `letter-spacing: 3px`, uppercase options (`SESSIONS`, `PROMPTS`), matching today's title typography. Sits where `<h2>SESSIONS</h2>` is today; collapse button stays right-aligned in the same row.

## 6. Scoped sub-graph

### New module: `src/parse/slice.ts`

```ts
export function sliceSession(session: Session, promptId: string): Session | null;
```

Returns a `Session`-shaped object whose `root` is the milestone chain starting at the given prompt and stopping before the next user follow-up. The returned object carries the same `id`, `cwd`, and `startedAt` as the input; `totalMilestones` is recomputed for the slice; `successPath` is the intersection of the original `successPath` with the slice's ids.

The parsed milestone chain is linear with one extra branch only at `subagent_spawn` nodes (see `parse/milestones.ts` and `App.tsx:collectSubagentIds`). The slice walks the primary `children[0]` chain:

1. Walk the chain from `session.root`, following `children[0]`.
2. Find the node where `id === promptId`. If not found, return `null`.
3. Starting at that node, walk forward via `children[0]` and collect until we reach a node with `kind === 'user_followup'` (exclusive — that node terminates the slice) or until `children` is empty.
4. Rebuild a fresh chain over the collected nodes: clone each node shallowly and rewrite `children` so each points at its successor in the slice. The terminating prompt is not included.
5. **Subagent branches are preserved verbatim.** If a collected node is a `subagent_spawn`, its `children[1]` sub-tree (the subagent's own milestones) is carried along by reference, so the scoped graph still renders subagents correctly.
6. Build the returned `Session`: `root` = head of the rebuilt chain, `totalMilestones` = count of collected nodes (plus subagent descendants, matching how the original counter works), `successPath` = `new Set(originalSuccessPath ∩ slicedIds)`.

### Wiring in App.tsx

```ts
const effectiveSession = useMemo(() => {
  if (!session) return null;
  if (selected?.kind === 'prompt') return sliceSession(session, selected.promptId);
  return session;
}, [session, selected]);

const { state: playback, controls } = usePlayback(effectiveSession?.root ?? null);
```

`effectiveSession` replaces `session` in every downstream consumer (`GraphCanvas`, `NowPlaying`, `DetailPanel`, the session-header overlay, the overflow gate). The components themselves are unchanged — they take a `Session`, we just hand them a different one.

### Failure mode

If `sliceSession` returns `null` (prompt id not found in the parsed session — likely because the JSONL changed since indexing), the empty/error state in `App.tsx` renders with the copy `PROMPT NOT FOUND` instead of `SELECT A SESSION`. The user can pick another prompt or switch modes.

### Header relabel

The `SESSION xxxxxxxx` overlay (top-left, `App.tsx:sessionHeader`) becomes `PROMPT ⟨ordinal+1⟩` when `selected.kind === 'prompt'`, where the ordinal is read off the selected `PromptMeta`. The cwd line beneath it stays the same. Same styling, just a different first line.

### Overflow gate

The "LARGE SESSION — N MILESTONES" confirm overlay (current threshold: 1000 milestones) is keyed on `session.totalMilestones` and `session.id`. Because we feed `effectiveSession` to the same check, a slice with a recomputed (small) `totalMilestones` naturally bypasses the gate without any special case. No code change here beyond replacing `session` with `effectiveSession` everywhere it's read.

## 7. New hook

`src/api/hooks.ts` gains:

```ts
export function usePromptList() {
  return useQuery({
    queryKey: ['prompts'],
    queryFn: fetchPromptList,
  });
}
```

`src/api/client.ts` gains a corresponding `fetchPromptList` that hits `/api/prompts` and returns `PromptMeta[]`.

`PromptMeta` lives in `src/parse/types.ts` next to `SessionMeta`.

## 8. Edge cases

- **Empty prompts result.** Same handling as empty session list: render a muted `(none)` placeholder.
- **A project with sessions but no surviving user prompts** (e.g., every prompt was a slash command). The project's group header doesn't appear in Prompts mode. Group order persistence is by `projectKey`; a project that's absent in one mode and present in the other still keeps its order slot when toggled back.
- **A renamed session.** The PromptsList subtitle prefers `tg.session.titles[sessionId]` over the bare `SESSION xxxxxxxx`, so renames flow through automatically.
- **Selection survives mode switch.** Switching modes preserves the underlying selection — if you pick a session, switch to Prompts, then switch back, the session is still selected. The selected-row highlight only renders when the active mode's row id matches the selection's kind.
- **Selection across reload.** Out of scope. Selection is in-memory only (matches today).

## 9. Testing

- **E2E (Playwright)** — one new test: open Prompts mode via the dropdown, assert at least one prompt row renders from the fixture session, click it, assert the canvas mounts and the playback bar's milestone count equals the slice length (less than the full session's). Existing Sessions-mode E2E tests continue to pass unchanged.
- **Unit** — `sliceSession` against a hand-built session: root prompt → tool call → tool call → user follow-up → tool call → tool call. Slicing root returns a session whose root chain has 3 nodes; slicing the follow-up returns a session whose root chain has 3 nodes; slicing an unknown id returns `null`. One additional case: a chain with a `subagent_spawn` mid-slice — confirm `children[1]` is preserved by reference and that the returned `successPath` is the intersection of the input's `successPath` with the slice's ids.
- **No dedicated server test** for `/api/prompts`; the E2E covers the happy path through the fixture, and the extraction logic is small enough that the unit-tested cleaning helper (`isMeaningfulUserText`) carries most of the risk.

## 10. Out of scope / future

- Server-side LRU cache for `/api/prompts` (mtime-keyed).
- Cross-session prompt comparison or templating.
- Prompt rename / pinning / starring.
- Project-category filter dropdown (separate from the mode switcher).
- Deep-linking to a specific prompt via URL.