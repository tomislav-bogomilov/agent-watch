# Memory Page — Design

## Summary

A fourth top-level library mode (`memory`) alongside Sessions / Prompts / Usage that lets
you **visualize, follow, analyze, and edit** Claude Code's memory store — both the global
store and the per-project stores. The store is already a graph: memories cross-link via
`[[wikilinks]]`, and each memory records the `originSessionId` of the session it was born
in, which ties straight back into ClaudeWatch's existing Sessions view.

The page is **library-first**: the existing sidebar becomes the memory list (grouped GLOBAL
+ per-project, with type badges); the main area carries a **DETAIL ⇄ GRAPH ⇄ STATS** toggle.
Editing uses a hybrid form (enum-safe frontmatter fields + a markdown body with `[[ ]]`
autocomplete). This introduces the app's **first filesystem write endpoints**, so write
safety is a first-class concern.

## Goals

- Browse every memory (global + each project) in one place, grouped by scope and typed by
  category (user / feedback / project / reference).
- Read a memory's full content and **follow** its relationships: outgoing `[[links]]`,
  incoming backlinks, and a jump to the session that created it (`originSessionId`).
- **Visualize** the whole store as a constellation graph (memories + links + origin-session
  tethers), reusing the TRON aesthetic of the rest of the app.
- **Analyze** the store: composition by type/scope, health (orphans, broken links, index
  drift), staleness, and provenance/growth.
- **Edit** memories: create, edit, and delete, with `MEMORY.md` kept in sync automatically.
- No new runtime dependencies (React + d3 + TanStack Query only).

## Non-goals

- **Rename** of a memory's slug. Deferred — it must rewrite every `[[link]]` that points at
  it plus the index, and is the highest-risk operation. v1 ships edit/create/delete only.
- **Git-style version history / diff viewer.** "Follow over time" is satisfied by staleness
  (file mtime) and growth/provenance, not a per-memory change log. Backups (below) provide
  recoverability, not browsable history.
- **Rich markdown rendering.** The body uses light markdown (`**bold**`, `[[links]]`); a
  minimal renderer handles bold + clickable wikilinks. No markdown library.
- **Cross-machine / remote stores.** Local `~/.claude` only, like the rest of the app.

## Data source

Memory files live as markdown-with-frontmatter under the Claude home directory
(`CLAUDE_HOME` env override, else `~/.claude`):

- **Per-project**: `~/.claude/projects/<projectId>/memory/`
- **Global**: `~/.claude/memory/` — does not exist until the first global memory is written.

Each scope contains:

- `MEMORY.md` — the index, one line per memory: `- [Title](file.md) — hook`.
- One `.md` file per memory:

```markdown
---
name: feedback-visual-prototyping
description: "For ThoughtGraph visual / design decisions, propose mockups…"
metadata:
  node_type: memory
  type: feedback            # user | feedback | project | reference
  originSessionId: 44525a7e-f053-40f4-b974-0f5c92f85c6f
---

For visual work, **propose mockups or working prototypes — always**.

**Why:** …
**How to apply:** … See [[thoughtgraph-visual-direction]].
```

Relationships derivable from the store:

- **Memory → memory**: every `[[name]]` occurrence in a body (outgoing link). Backlinks are
  the inverse, computed across the set.
- **Memory → session**: `metadata.originSessionId` resolves to a session in the Sessions list
  (matched by `sessionId`).
- **Type / scope**: `metadata.type` (color/category) and the directory (global vs which
  project).
- **Index membership**: whether a memory has a matching line in its scope's `MEMORY.md`.

`projectId` ↔ `cwd` mapping reuses the existing `decodeProjectId` in the plugin.

## Architecture

### Server: `/api/memory` (extends `sessionsPlugin()` in `server/vite-plugin-sessions.ts`)

These are the app's **first write endpoints**; all existing endpoints are GET-only. Safety
controls are specified in the Write Safety section below.

**`GET /api/memory`** → the full store across global + every project:

```ts
type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

type MemoryScope =
  | { kind: 'global' }
  | { kind: 'project'; projectId: string; cwd: string };

type MemoryRecord = {
  scopeKey: string;          // 'global' | projectId  — addresses the file
  scope: MemoryScope;
  name: string;              // slug; matches the filename without .md
  description: string;
  type: MemoryType | null;   // null when frontmatter is malformed/missing
  originSessionId: string | null;
  links: string[];           // outgoing [[names]] found in the body
  body: string;              // raw markdown body (after frontmatter)
  mtimeMs: number;
  inIndex: boolean;          // has a matching MEMORY.md line
  indexTitle?: string;
  indexHook?: string;
  parseError?: string;       // set when YAML frontmatter failed to parse
};

type MemoryIndexEntry = { name: string; title: string; hook?: string; filePresent: boolean };

type MemoryResponse = {
  memories: MemoryRecord[];
  indexes: { scopeKey: string; entries: MemoryIndexEntry[] }[];
};
```

**`POST /api/memory/:scopeKey`** (create):
body `{ name, description, type, body }`. Writes a new `<name>.md` with valid frontmatter and
adds a `MEMORY.md` line. `409` if `<name>.md` already exists in the scope.

**`PUT /api/memory/:scopeKey/:name`** (update):
body `{ description, type, body }`. Rewrites the file's frontmatter + body (preserving
`originSessionId` and `node_type`) and updates the matching `MEMORY.md` line.

**`DELETE /api/memory/:scopeKey/:name`** (delete):
removes the file and its `MEMORY.md` line. Response includes `brokenBacklinks: string[]` — the
names of memories whose `[[link]]` now dangles — so the UI can report what broke. The UI
confirms (and surfaces the warning) before calling DELETE.

`scopeKey` is `global` or a `projectId`. Validation: `scopeKey` matches the existing
`isSafeId`; for projects it must exist under `projects/`. `name` must be a bare kebab slug
(`^[a-z0-9][a-z0-9-]*$`) — no separators, no `..`.

Server helpers (new module, e.g. `server/memory-store.ts`):
- `parseMemoryFile(raw)` → `{ frontmatter, body, links, parseError? }` (YAML frontmatter +
  `[[name]]` regex; tolerant — a parse failure yields `parseError`, never throws).
- `parseIndex(raw)` → `MemoryIndexEntry[]`.
- `serializeMemory({ name, description, type, originSessionId, body })` → file text.
- `upsertIndexLine` / `removeIndexLine` → index reconciliation.

### Frontend data layer

- `src/api/client.ts`: `fetchMemory()`, `createMemory()`, `updateMemory()`, `deleteMemory()`.
- `src/api/hooks.ts`: `useMemoryList()` (`useQuery`, key `['memory']`); `useCreateMemory` /
  `useUpdateMemory` / `useDeleteMemory` (`useMutation`, each invalidates `['memory']` on
  success). Requires a `QueryClient` mutation path; the app already wraps in
  `QueryClientProvider`.

### Components — new `src/memory/` directory (mirrors `src/tokens/`)

- **`MemoryPage.tsx`** — main pane. Owns the DETAIL ⇄ GRAPH ⇄ STATS toggle and the selected
  memory; rendered by `App.tsx` when `mode === 'memory'` (the way `TokensPage` is rendered for
  `usage`). Bypasses the session-loading machinery.
- **`MemoryDetail.tsx`** — reading view: description, Why/How body (minimal renderer),
  badges, and a **Connections** section (outgoing links, backlinks, jump-to-origin-session).
  Hosts the edit / delete actions.
- **`MemoryEditor.tsx`** — the hybrid editor, reused for create and edit: frontmatter as
  enum-safe fields (description input, `type` dropdown) + a markdown body textarea with
  `[[ ]]` autocomplete sourced from the loaded memory names.
- **`MemoryGraph.tsx`** — d3 force-directed constellation: nodes = memories (colored by
  type), edges = `[[links]]`, dashed tethers to origin sessions. Click a node → select →
  DETAIL. A lightweight standalone force layout (not the session milestone-tree layout).
- **`MemoryStats.tsx`** — composition (bars by type & scope), health (orphans, broken links,
  index drift), staleness (mtime), provenance/growth (top sessions/projects by
  `originSessionId`, growth over time).
- **`insights.ts`** — pure derivation over `MemoryRecord[]`: `findOrphans`, `findBrokenLinks`,
  `backlinkIndex`, `composition`, `staleness`, `provenance`. Unit-tested.

### Sidebar — `src/components/library/MemoryList.tsx`

`LibraryPanel` gains `'memory'` in `LibraryMode` and a `MEMORY` option in the mode dropdown.
In memory mode it renders `MemoryList`, grouped **GLOBAL** + one group per project (reusing
the existing group/expand/reorder machinery), each item a card with a **type badge** + name,
honoring the existing filter box. Selecting an item calls
`onSelect({ kind: 'memory', scopeKey, name })`.

### Selection & origin-session jump

- `Selection` gains `{ kind: 'memory'; scopeKey: string; name: string }`.
- "Jump to origin session" sets the app selection to the matching
  `{ kind: 'session', projectId, sessionId: originSessionId }` and switches `mode` to
  `'sessions'`. The projectId is resolved from the sessions list by matching `sessionId`. If
  no match (session deleted/compacted away), the action is disabled with an explanatory tooltip.

## Write safety ⚠️

Writes target the user's real `~/.claude`, which Claude Code itself reads. Controls:

- **Path containment.** Resolve the final absolute path and assert (with `path.resolve` +
  prefix check) that it stays inside the intended scope's memory directory. Reject any `name`
  that is not a bare kebab slug; reject `scopeKey` that fails `isSafeId` or names a
  nonexistent project.
- **Frontmatter validation on write.** `type` ∈ the enum, `name` matches the slug + filename,
  and the serialized frontmatter round-trips as valid YAML. Reject with `400` otherwise.
- **Backup before write.** Before overwriting or deleting, copy the prior file to a sibling
  backups location (e.g. `memory/.backups/<name>.<mtime>.md`) so edits and deletes are
  recoverable.
- **Localhost-only.** The dev server binds loopback; there is no production build. Writes are
  inherently local-operator only.
- **Explicit delete confirmation** in the UI, including the broken-backlinks warning.
- **Tests never touch the real store** — all server/integration tests run against a temp
  `CLAUDE_HOME` fixture.

A `/security-review` pass should be run on the diff before the PR, per the managed policy,
given this is the first write surface.

## Error handling

- Missing global memory directory → empty GLOBAL group, no error (matches the existing
  `try/catch → []` pattern for absent dirs).
- A memory with malformed YAML → returned with `type: null` + `parseError`; the UI shows it as
  a **health issue** (flagged in STATS and in DETAIL), never a crash.
- Write failures → surfaced inline; the editor retains the user's content (mutation error
  state, no optimistic clobber).
- A `[[link]]` to a nonexistent memory → reported under STATS → health (broken links); in
  DETAIL the connection pill renders as broken/disabled.
- Index drift (a memory missing from `MEMORY.md`, or an index line with no file) → reported
  under STATS → health. (Writes auto-maintain the index, so drift is pre-existing data.)

## Testing

Repo conventions: Vitest (unit) + Playwright (e2e, Chromium).

- **Vitest — parsing & derivation**
  - `parseMemoryFile`: frontmatter extraction, `[[link]]` extraction, malformed-YAML →
    `parseError` (no throw).
  - `parseIndex`: index line parsing, file-present reconciliation.
  - `serializeMemory`: round-trip (parse → serialize → parse) is stable; preserves
    `originSessionId` / `node_type`.
  - `insights.ts`: orphans, broken links, backlink index, composition, staleness, provenance.
  - Path-containment guard rejects `..`, separators, and out-of-scope names.
- **Server — endpoints against a temp `CLAUDE_HOME` fixture**
  - `GET /api/memory` aggregates global + project memories with correct scopes & links.
  - `POST` creates file + index line; `409` on duplicate name.
  - `PUT` rewrites body/frontmatter, preserves `originSessionId`, updates index line.
  - `DELETE` removes file + index line; returns `brokenBacklinks`; creates a backup.
  - Backup file is written before overwrite/delete.
- **Playwright — e2e against the fixture home**
  - Switch to MEMORY mode → sidebar groups GLOBAL/project with type badges.
  - Select a memory → DETAIL shows body + Connections; backlinks/origin-session present.
  - Toggle GRAPH (nodes + edges render) and STATS (composition/health/staleness).
  - Edit + save; create a new memory; delete with the backlink warning shown.
  - Jump-to-origin-session switches to SESSIONS mode with the right session selected.

## Out-of-scope / deferred (YAGNI)

- Rename (slug change + link rewrite).
- Git-style diff/history viewer.
- Markdown library / full GFM rendering.
- Bulk operations (multi-select edit/delete).
