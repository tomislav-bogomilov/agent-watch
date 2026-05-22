# Left Panel: Sessions / Prompts Modes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dropdown switcher to the left panel that toggles between two modes — **Sessions** (existing) and **Prompts** (new). Prompts mode lists every user-typed prompt across all session JSONLs, grouped by project, draggable. Clicking a prompt opens a scoped sub-graph (the milestone slice from that prompt to the next user prompt) using the existing GraphCanvas + playback machinery.

**Architecture:** New `/api/prompts` server endpoint extracts prompts from JSONL files (reusing the existing `isMeaningfulUserText` helper). Split `src/components/SessionList.tsx` into `src/components/library/{LibraryPanel,SessionsList,PromptsList}.tsx` — the shell owns dropdown, filter, project grouping, persisted order and expansion; the child renderers own per-mode row layout. A pure `sliceSession(session, promptId)` in `src/parse/slice.ts` returns a `Session`-shaped object with the milestone chain restricted to that prompt's turn; `App.tsx` selects `effectiveSession` and passes it to existing components unchanged.

**Tech Stack:** React 19, TypeScript, Vite (with custom server plugin), TanStack Query, Vitest, Playwright.

---

## Reference: Spec

The full design lives at `docs/superpowers/specs/2026-05-22-left-panel-modes-design.md`. Tasks below reference its sections.

## File-by-file map

**Modified:**

- `server/vite-plugin-sessions.ts` — add `/api/prompts` endpoint + prompt-extraction helper.
- `src/api/client.ts` — add `fetchPromptList`.
- `src/api/hooks.ts` — add `usePromptList`.
- `src/parse/types.ts` — add `PromptMeta` type.
- `src/App.tsx` — widen `Selection` to a discriminated union, replace `session` consumers with `effectiveSession`, relabel session-header overlay in prompt mode, import `LibraryPanel`.
- `tests/fixtures/claude-projects/C--demo-happy/2026-01-01-aaaa.jsonl` — append a `user_followup` + tool call so the fixture exercises a multi-prompt session.

**Added:**

- `src/parse/slice.ts` — `sliceSession(session, promptId): Session | null`.
- `src/components/library/LibraryPanel.tsx` — shell.
- `src/components/library/SessionsList.tsx` — session row renderer.
- `src/components/library/PromptsList.tsx` — prompt row renderer.
- `tests/unit/parse/slice.test.ts`.
- `tests/e2e/prompts-mode.spec.ts`.

**Deleted:**

- `src/components/SessionList.tsx` — superseded by the library/ split.

---

## Conventions used in every task

- After each task: `npm run typecheck` MUST pass. Vitest runs via `npm test`; Playwright runs via `npm run test:e2e`. Both must pass at the end of any task that touches them.
- Stage explicit paths in git — never `git add -A` or `git add .`.
- Each task ends in a single commit. Commit message uses HEREDOC syntax for safety on Windows shells (the repo's pre-existing convention).
- The Playwright config sets `CLAUDE_HOME` to `tests/fixtures/claude-projects` (`playwright.config.ts:23`), so any new server endpoint that reads JSONL automatically sees the fixture projects during E2E.
- The existing `SessionList.tsx` is preserved as a working component until Task 8 swaps it out. Earlier tasks introduce the new files without removing the old one so the app keeps building.

---

## Task 1: Add a follow-up prompt to the happy fixture

**Why:** The current fixture session (`tests/fixtures/claude-projects/C--demo-happy/2026-01-01-aaaa.jsonl`) has exactly one user prompt — fine for Sessions-mode tests but useless for Prompts mode (no follow-up = no slicing case). Add one follow-up prompt with its own tool call so the fixture exposes both a `root_prompt` and a `user_followup` and supports a meaningful `sliceSession` test through the real parse pipeline.

**Files:**
- Modify: `tests/fixtures/claude-projects/C--demo-happy/2026-01-01-aaaa.jsonl`

- [ ] **Step 1: Append two events to the fixture**

Open `tests/fixtures/claude-projects/C--demo-happy/2026-01-01-aaaa.jsonl` and append (preserving the existing 5 lines untouched, adding a trailing newline if missing):

```
{"uuid":"h5","parentUuid":"h4","timestamp":"2026-01-01T00:00:04Z","type":"user","message":{"role":"user","content":"Now print goodbye"}}
{"uuid":"h6","parentUuid":"h5","timestamp":"2026-01-01T00:00:05Z","type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_h2","name":"Bash","input":{"command":"echo goodbye"}}]}}
{"uuid":"h7","parentUuid":"h6","timestamp":"2026-01-01T00:00:06Z","type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu_h2","content":"<stdout>\ngoodbye\n</stdout>\n<exit_code>0</exit_code>","is_error":false}]}}
{"uuid":"h8","parentUuid":"h7","timestamp":"2026-01-01T00:00:07Z","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Goodbye said."}]}}
```

The session now produces, after milestone construction, the chain `root_prompt(h1)` → `assistant_turn(h1b)` → `tool_call(h2)` → `assistant_turn(h4)` → `user_followup(h5)` → `tool_call(h6)` → `completion(h8)`. That's **7 milestones total**. (The promotion of the final `assistant_turn` to `completion` moves from h4 to h8 because h8 is now the last — h4 reverts to a plain `assistant_turn`.) The `discovery-load.spec.ts` assertion `toHaveCount(4)` will now read 7 — fix that in the next step.

- [ ] **Step 2: Update existing E2E assertions to the new milestone count**

Two E2E tests assert milestone counts against the demo-happy fixture and must be updated:

In `tests/e2e/discovery-load.spec.ts:10`, change the expected count from `4` to `7`:

```ts
await expect(page.locator('svg g[data-id]')).toHaveCount(7, { timeout: 5_000 });
```

In `tests/e2e/playback.spec.ts:29`, change the success-state count from `4` to `7` and bump the timeout (7 nodes at 1600ms/node ≈ 11s; the existing 15s leaves little slack):

```ts
await expect(page.locator('svg g[data-state="success"]')).toHaveCount(7, { timeout: 20_000 });
```

The other tests touching `demo/happy` (`hud-readout`, `scrubber-step`, `zoom-and-tooltip`, `camera-preserve-on-click`) do not assert milestone counts — they target `.first()` nodes or scrubber positions and continue to pass.

- [ ] **Step 3: Verify the existing tests still pass**

Run: `npm test`
Expected: all parse unit tests pass (none touch this fixture's milestone count).

Run: `npm run test:e2e -- --grep "discovery|playback"`
Expected: `discovery-load` and `playback` pass with the new counts.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/claude-projects/C--demo-happy/2026-01-01-aaaa.jsonl tests/e2e/discovery-load.spec.ts tests/e2e/playback.spec.ts
git commit -m "$(cat <<'EOF'
test(fixture): extend happy session with a follow-up prompt

Adds a user_followup + tool call + completion to the demo-happy
fixture so it exposes both a root_prompt and a follow-up, enabling
slice-session tests and Prompts-mode E2E coverage.

EOF
)"
```

---

## Task 2: Add `PromptMeta` type

**Why:** Both server and client need a shared shape. Define it in `parse/types.ts` next to `SessionMeta` so no new module is required.

**Files:**
- Modify: `src/parse/types.ts`

- [ ] **Step 1: Add the type at the bottom of `src/parse/types.ts`**

Append (after `SessionMeta`):

```ts
export type PromptMeta = {
  projectId: string;
  sessionId: string;
  promptId: string;
  kind: 'root' | 'followup';
  text: string;
  timestamp: string;
  ordinal: number;
};
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/parse/types.ts
git commit -m "$(cat <<'EOF'
feat(types): add PromptMeta shape for the prompts list

Shared between /api/prompts and the new sidebar Prompts mode.

EOF
)"
```

---

## Task 3: Add `/api/prompts` server endpoint

**Why:** Spec §4. Server-side extraction over the same JSONL files `/api/sessions` already reads.

**Files:**
- Modify: `server/vite-plugin-sessions.ts`

- [ ] **Step 1: Add the prompt-extraction helper above `sessionsPlugin()`**

In `server/vite-plugin-sessions.ts`, add the following helper just before `export function sessionsPlugin()`. The constants and types match the spec (PROMPT_MAX_CHARS = 140, projectId/sessionId mirror what `listSessions` produces, ordinal counts surviving prompts).

```ts
const PROMPT_MAX_CHARS = 140;

type PromptMeta = {
  projectId: string;
  sessionId: string;
  promptId: string;
  kind: 'root' | 'followup';
  text: string;
  timestamp: string;
  ordinal: number;
};

async function extractPrompts(filePath: string, projectId: string, sessionId: string): Promise<PromptMeta[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return [];
  }
  const out: PromptMeta[] = [];
  let ordinal = 0;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let ev: unknown;
    try { ev = JSON.parse(trimmed); } catch { continue; }
    const e = ev as {
      uuid?: string;
      timestamp?: string;
      type?: string;
      isMeta?: boolean;
      message?: { role?: string; content?: unknown };
    };
    if (e.isMeta) continue;
    if (e.type !== 'user' || e.message?.role !== 'user') continue;
    if (!e.uuid || !e.timestamp) continue;

    const content = e.message.content;
    let text: string | undefined;
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      const textBlocks = content
        .filter((b) => typeof b === 'object' && b && (b as { type?: string }).type === 'text')
        .map((b) => (b as { text?: string }).text ?? '');
      if (textBlocks.length === 0) continue; // tool-result-only user events
      text = textBlocks.join('').trim();
    }
    if (!text) continue;

    const cleaned = isMeaningfulUserText(text);
    if (!cleaned) continue;

    const snippet = cleaned.length > PROMPT_MAX_CHARS
      ? `${cleaned.slice(0, PROMPT_MAX_CHARS)}…`
      : cleaned;

    out.push({
      projectId,
      sessionId,
      promptId: e.uuid,
      kind: ordinal === 0 ? 'root' : 'followup',
      text: snippet,
      timestamp: e.timestamp,
      ordinal,
    });
    ordinal += 1;
  }
  return out;
}

async function listPrompts(root: string): Promise<PromptMeta[]> {
  let projects: string[];
  try {
    projects = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: PromptMeta[] = [];
  for (const projectId of projects) {
    const projectDir = path.join(root, projectId);
    let entries: string[];
    try {
      entries = await fs.readdir(projectDir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.jsonl')) continue;
      const full = path.join(projectDir, name);
      let stat;
      try { stat = await fs.stat(full); } catch { continue; }
      if (!stat.isFile()) continue;
      const sessionId = name.replace(/\.jsonl$/, '');
      const prompts = await extractPrompts(full, projectId, sessionId);
      out.push(...prompts);
    }
  }
  out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return out;
}
```

- [ ] **Step 2: Register the route inside `sessionsPlugin().configureServer`**

In `server/vite-plugin-sessions.ts`, add a second middleware registration alongside the existing `/api/sessions` one. Inside the existing `configureServer(server)` block, immediately after the `server.middlewares.use('/api/sessions', ...)` block closes, insert:

```ts
server.middlewares.use('/api/prompts', async (req, res, next) => {
  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method not allowed' });
      return;
    }
    const url = req.url ?? '/';
    if (url !== '/' && url !== '') {
      sendJson(res, 400, { error: 'expected /api/prompts' });
      return;
    }
    const prompts = await listPrompts(root);
    sendJson(res, 200, { prompts });
  } catch (err) {
    next(err as Error);
  }
});
```

- [ ] **Step 3: Smoke-check the endpoint manually**

Run: `npm run dev -- --port 5174` in one terminal. In another:

```bash
curl http://localhost:5174/api/prompts
```

Expected: `{"prompts":[...]}` with at least the `Please print hello world` and `Now print goodbye` entries from the demo-happy fixture (since CLAUDE_HOME is the dev server's normal `~/.claude/projects` here, the response depends on local data — the E2E in Task 11 will assert against fixture data).

Stop the dev server.

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/vite-plugin-sessions.ts
git commit -m "$(cat <<'EOF'
feat(server): add /api/prompts endpoint

Streams each session JSONL, extracts user-typed prompts using the
existing isMeaningfulUserText cleaner, returns a flat list sorted
newest-first. Tool-result-only user events and slash commands are
filtered out, matching the session-title extractor.

EOF
)"
```

---

## Task 4: Add `fetchPromptList` API client function

**Why:** Spec §7. Mirrors `fetchSessionList`.

**Files:**
- Modify: `src/api/client.ts`

- [ ] **Step 1: Add the function to `src/api/client.ts`**

Append (and import `PromptMeta` at the top):

```ts
import type { PromptMeta, SessionMeta, SessionPayload } from '../parse/types';
```

(replace the existing import line)

Then at the bottom of the file:

```ts
export async function fetchPromptList(): Promise<PromptMeta[]> {
  const res = await fetch('/api/prompts');
  if (!res.ok) throw new Error(`prompt list failed: ${res.status}`);
  const json = (await res.json()) as { prompts: PromptMeta[] };
  return json.prompts;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/client.ts
git commit -m "$(cat <<'EOF'
feat(api): add fetchPromptList client

Hits /api/prompts and returns PromptMeta[].

EOF
)"
```

---

## Task 5: Add `usePromptList` React Query hook

**Why:** Spec §7. Mirrors `useSessionList`.

**Files:**
- Modify: `src/api/hooks.ts`

- [ ] **Step 1: Add the hook to `src/api/hooks.ts`**

Replace the file's import block and add the new hook below `useSessionList`. The final file should read:

```ts
import { useQuery } from '@tanstack/react-query';
import { fetchPromptList, fetchSessionList, fetchSessionPayload } from './client';
import { parseSession } from '../parse';
import type { Session } from '../parse/types';

export function useSessionList() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessionList,
  });
}

export function usePromptList() {
  return useQuery({
    queryKey: ['prompts'],
    queryFn: fetchPromptList,
  });
}

export function useSession(projectId: string | null, sessionId: string | null) {
  return useQuery<Session>({
    queryKey: ['session', projectId, sessionId],
    queryFn: async () => {
      const payload = await fetchSessionPayload(projectId!, sessionId!);
      return parseSession(payload);
    },
    enabled: !!projectId && !!sessionId,
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/hooks.ts
git commit -m "$(cat <<'EOF'
feat(api): add usePromptList hook

Wraps fetchPromptList with TanStack Query under the ['prompts'] key.

EOF
)"
```

---

## Task 6: Add `sliceSession` (TDD)

**Why:** Spec §6. Pure function. Test-first because the slicing rules (chain walk, terminate before next `user_followup`, preserve subagent branches, recompute totalMilestones, intersect successPath) are all easy to get subtly wrong.

**Files:**
- Create: `src/parse/slice.ts`
- Test: `tests/unit/parse/slice.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/parse/slice.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sliceSession } from '../../../src/parse/slice';
import type { Milestone, MilestoneKind, Session } from '../../../src/parse/types';

function ms(id: string, kind: MilestoneKind, children: Milestone[] = []): Milestone {
  return {
    id,
    kind,
    label: id,
    summary: id,
    timestamp: '',
    failed: false,
    raw: null,
    children,
  };
}

function chain(nodes: Milestone[]): Milestone {
  for (let i = nodes.length - 1; i > 0; i--) nodes[i - 1].children = [nodes[i]];
  return nodes[0];
}

function makeSession(root: Milestone, ids: string[]): Session {
  return {
    id: 's1',
    cwd: 'C:/demo',
    startedAt: '',
    root,
    successPath: new Set(ids),
    totalMilestones: ids.length,
  };
}

describe('sliceSession', () => {
  it('returns the chain from root_prompt up to (but excluding) the next user_followup', () => {
    const nodes = [
      ms('p1', 'root_prompt'),
      ms('t1', 'tool_call'),
      ms('t2', 'tool_call'),
      ms('p2', 'user_followup'),
      ms('t3', 'tool_call'),
      ms('c1', 'completion'),
    ];
    const root = chain(nodes);
    const session = makeSession(root, ['p1', 't1', 't2', 'p2', 't3', 'c1']);

    const sliced = sliceSession(session, 'p1');
    expect(sliced).not.toBeNull();

    const head = sliced!.root;
    const collected: string[] = [];
    let cur: Milestone | undefined = head;
    while (cur) { collected.push(cur.id); cur = cur.children[0]; }
    expect(collected).toEqual(['p1', 't1', 't2']);
    expect(sliced!.totalMilestones).toBe(3);
    expect(sliced!.successPath).toEqual(new Set(['p1', 't1', 't2']));
  });

  it('slices a follow-up prompt to the end of the session', () => {
    const nodes = [
      ms('p1', 'root_prompt'),
      ms('t1', 'tool_call'),
      ms('p2', 'user_followup'),
      ms('t2', 'tool_call'),
      ms('c1', 'completion'),
    ];
    const root = chain(nodes);
    const session = makeSession(root, ['p1', 't1', 'p2', 't2', 'c1']);

    const sliced = sliceSession(session, 'p2');
    expect(sliced).not.toBeNull();

    const head = sliced!.root;
    const collected: string[] = [];
    let cur: Milestone | undefined = head;
    while (cur) { collected.push(cur.id); cur = cur.children[0]; }
    expect(collected).toEqual(['p2', 't2', 'c1']);
  });

  it('returns null for an unknown prompt id', () => {
    const root = chain([ms('p1', 'root_prompt'), ms('t1', 'tool_call')]);
    const session = makeSession(root, ['p1', 't1']);
    expect(sliceSession(session, 'nope')).toBeNull();
  });

  it('preserves a subagent branch (children[1]) by reference', () => {
    const subRoot = ms('sub_root', 'root_prompt', [ms('sub_t', 'tool_call')]);
    const spawn = ms('spawn', 'subagent_spawn');
    const after = ms('after', 'tool_call');
    const root = chain([ms('p1', 'root_prompt'), spawn, after]);
    spawn.children = [after, subRoot];

    const session = makeSession(root, ['p1', 'spawn', 'after', 'sub_root', 'sub_t']);

    const sliced = sliceSession(session, 'p1');
    expect(sliced).not.toBeNull();

    const slicedSpawn = sliced!.root.children[0];
    expect(slicedSpawn.id).toBe('spawn');
    expect(slicedSpawn.children).toHaveLength(2);
    expect(slicedSpawn.children[1]).toBe(subRoot);
    expect(sliced!.totalMilestones).toBe(5);
    expect(sliced!.successPath).toEqual(new Set(['p1', 'spawn', 'after', 'sub_root', 'sub_t']));
  });

  it('intersects successPath: ids not in the slice are dropped', () => {
    const nodes = [
      ms('p1', 'root_prompt'),
      ms('t1', 'tool_call'),
      ms('p2', 'user_followup'),
      ms('t2', 'tool_call'),
    ];
    const root = chain(nodes);
    const session = makeSession(root, ['p1', 't1', 'p2', 't2']);

    const sliced = sliceSession(session, 'p1');
    expect(sliced!.successPath).toEqual(new Set(['p1', 't1']));
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- tests/unit/parse/slice.test.ts`
Expected: FAIL — `Cannot find module './slice'` (or similar).

- [ ] **Step 3: Implement `sliceSession`**

Create `src/parse/slice.ts`:

```ts
import type { Milestone, Session } from './types';

function collectAllIds(node: Milestone, into: Set<string>): void {
  into.add(node.id);
  for (const c of node.children) collectAllIds(c, into);
}

export function sliceSession(session: Session, promptId: string): Session | null {
  // Walk the primary children[0] chain from the root looking for the prompt.
  let cursor: Milestone | null = session.root;
  while (cursor && cursor.id !== promptId) {
    cursor = cursor.children[0] ?? null;
  }
  if (!cursor) return null;

  // Collect the slice: from `cursor` forward, stop BEFORE the next user_followup.
  const slice: Milestone[] = [];
  let walker: Milestone | null = cursor;
  while (walker) {
    if (walker !== cursor && walker.kind === 'user_followup') break;
    slice.push(walker);
    walker = walker.children[0] ?? null;
  }

  // Rebuild as a fresh chain. Clone each node shallowly; rewrite children[0]
  // to point at the next slice node. Preserve children[1] (subagent branch)
  // by reference when present.
  const rebuilt: Milestone[] = slice.map((node) => ({ ...node, children: [...node.children] }));
  for (let i = 0; i < rebuilt.length; i++) {
    const original = slice[i];
    const next = rebuilt[i + 1];
    if (next) {
      // Replace the primary child with the rebuilt next node; keep subagent
      // branch (children[1]) by reference if present on the original.
      const secondary = original.children[1];
      rebuilt[i].children = secondary ? [next, secondary] : [next];
    } else {
      // Last node in the slice has no successor — drop the primary child
      // (it pointed at user_followup or beyond), keep subagent branch only.
      const secondary = original.children[1];
      rebuilt[i].children = secondary ? [secondary] : [];
    }
  }

  // Derive stats. totalMilestones counts the slice chain plus any subagent
  // descendants attached via children[1]. successPath is the intersection
  // of the original with all ids reachable from the rebuilt root.
  const allIds = new Set<string>();
  collectAllIds(rebuilt[0], allIds);

  const successPath = new Set<string>();
  for (const id of session.successPath) {
    if (allIds.has(id)) successPath.add(id);
  }

  return {
    id: session.id,
    cwd: session.cwd,
    startedAt: session.startedAt,
    root: rebuilt[0],
    successPath,
    totalMilestones: allIds.size,
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- tests/unit/parse/slice.test.ts`
Expected: PASS — all 5 cases green.

- [ ] **Step 5: Run the full unit test suite**

Run: `npm test`
Expected: PASS — no regressions in any existing parse test.

- [ ] **Step 6: Commit**

```bash
git add src/parse/slice.ts tests/unit/parse/slice.test.ts
git commit -m "$(cat <<'EOF'
feat(parse): sliceSession returns a Session restricted to one prompt's turn

Walks the primary children[0] chain from the given promptId, stops
before the next user_followup, rebuilds a fresh chain with subagent
branches preserved by reference, recomputes totalMilestones and
intersects successPath with the slice's ids.

EOF
)"
```

---

## Task 7: Create `SessionsList` row renderer

**Why:** Spec §5. Extracted from the existing `SessionList.tsx`. Keep all per-session row behaviour (title + persisted rename via double-click, cwd, mtime · sizeKB) but accept the rows as a prop instead of fetching/grouping them itself.

**Files:**
- Create: `src/components/library/SessionsList.tsx`

- [ ] **Step 1: Create the file**

Create `src/components/library/SessionsList.tsx`:

```tsx
import { useState } from 'react';
import type { SessionMeta } from '../../parse/types';

type Props = {
  items: SessionMeta[];
  selectedSessionId: string | null;
  titles: Record<string, string>;
  onSelect: (s: SessionMeta) => void;
  onRename: (sessionId: string, title: string) => void;
};

function basename(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

export function SessionsList({ items, selectedSessionId, titles, onSelect, onRename }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  function startEdit(s: SessionMeta, e: React.MouseEvent): void {
    e.stopPropagation();
    setEditingId(s.sessionId);
    setDraftTitle(titles[s.sessionId] ?? s.title ?? basename(s.cwd));
  }

  function commitEdit(s: SessionMeta): void {
    onRename(s.sessionId, draftTitle.trim());
    setEditingId(null);
  }

  return (
    <ul style={styles.list}>
      {items.map((s) => {
        const isSelected = selectedSessionId === s.sessionId;
        const displayTitle = titles[s.sessionId] ?? s.title ?? basename(s.cwd);
        const isEditing = editingId === s.sessionId;
        return (
          <li
            key={`${s.projectId}/${s.sessionId}`}
            onClick={() => { if (!isEditing) onSelect(s); }}
            style={{ ...styles.item, ...(isSelected ? styles.itemSelected : {}) }}
            data-testid={`session-item-${s.sessionId}`}
          >
            {isEditing ? (
              <input
                autoFocus
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.currentTarget.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => commitEdit(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitEdit(s); }
                  else if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                }}
                style={styles.editInput}
                data-testid={`session-rename-${s.sessionId}`}
              />
            ) : (
              <div
                style={styles.itemTitle}
                onDoubleClick={(e) => startEdit(s, e)}
                title={displayTitle}
              >
                {displayTitle}
              </div>
            )}
            <div style={styles.itemCwd} title={s.cwd}>{s.cwd}</div>
            <div style={styles.itemMeta}>
              {new Date(s.startedAt).toLocaleString()} · {Math.round(s.sizeBytes / 1024)}KB
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const styles = {
  list: { listStyle: 'none', padding: 0, margin: 0 },
  item: {
    padding: '8px 12px',
    cursor: 'pointer',
    borderLeft: '2px solid transparent',
  },
  itemSelected: {
    borderLeftColor: 'var(--edge-trail)',
    background: 'rgba(0, 229, 255, 0.04)',
  },
  itemTitle: {
    fontSize: 12,
    color: 'var(--text)',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontFamily: 'ui-monospace, monospace',
  },
  itemCwd: {
    fontSize: 10,
    color: 'var(--text-dim)',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontFamily: 'ui-monospace, monospace',
    marginTop: 2,
  },
  itemMeta: {
    fontSize: 10,
    color: 'var(--text-dim)',
    marginTop: 2,
    fontFamily: 'ui-monospace, monospace',
  },
  editInput: {
    width: '100%',
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid var(--edge-trail)',
    color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12,
    padding: '2px 4px',
    boxSizing: 'border-box' as const,
  },
};
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/library/SessionsList.tsx
git commit -m "$(cat <<'EOF'
feat(library): extract SessionsList row renderer

A presentational component that takes a group's SessionMeta[] and
renders the rows (with double-click rename). Owns only its local
edit state; selection + rename persistence are lifted to the caller.

EOF
)"
```

---

## Task 8: Create `PromptsList` row renderer

**Why:** Spec §5. Renders prompt rows: snippet (primary), session subtitle, timestamp. No rename.

**Files:**
- Create: `src/components/library/PromptsList.tsx`

- [ ] **Step 1: Create the file**

Create `src/components/library/PromptsList.tsx`:

```tsx
import type { PromptMeta } from '../../parse/types';

type Props = {
  items: PromptMeta[];
  sessionTitles: Record<string, string>;
  selectedPromptId: string | null;
  onSelect: (p: PromptMeta) => void;
};

function sessionSubtitle(p: PromptMeta, titles: Record<string, string>): string {
  const renamed = titles[p.sessionId];
  if (renamed) return renamed;
  return `SESSION ${p.sessionId.slice(0, 8)}`;
}

export function PromptsList({ items, sessionTitles, selectedPromptId, onSelect }: Props) {
  return (
    <ul style={styles.list}>
      {items.map((p) => {
        const isSelected = selectedPromptId === p.promptId;
        return (
          <li
            key={p.promptId}
            onClick={() => onSelect(p)}
            style={{ ...styles.item, ...(isSelected ? styles.itemSelected : {}) }}
            data-testid={`prompt-item-${p.promptId}`}
          >
            <div style={styles.itemTitle} title={p.text}>{p.text}</div>
            <div style={styles.itemSub} title={p.sessionId}>{sessionSubtitle(p, sessionTitles)}</div>
            <div style={styles.itemMeta}>{new Date(p.timestamp).toLocaleString()}</div>
          </li>
        );
      })}
    </ul>
  );
}

const styles = {
  list: { listStyle: 'none', padding: 0, margin: 0 },
  item: {
    padding: '8px 12px',
    cursor: 'pointer',
    borderLeft: '2px solid transparent',
  },
  itemSelected: {
    borderLeftColor: 'var(--edge-trail)',
    background: 'rgba(0, 229, 255, 0.04)',
  },
  itemTitle: {
    fontSize: 12,
    color: 'var(--text)',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontFamily: 'ui-monospace, monospace',
  },
  itemSub: {
    fontSize: 10,
    color: 'var(--edge-trail)',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontFamily: 'ui-monospace, monospace',
    letterSpacing: 1,
    marginTop: 2,
  },
  itemMeta: {
    fontSize: 10,
    color: 'var(--text-dim)',
    marginTop: 2,
    fontFamily: 'ui-monospace, monospace',
  },
};
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/library/PromptsList.tsx
git commit -m "$(cat <<'EOF'
feat(library): add PromptsList row renderer

Renders prompt snippet (primary), session subtitle (cyan, small),
and timestamp. Falls back to SESSION <first-8-of-id> when there's
no renamed session title.

EOF
)"
```

---

## Task 9: Create `LibraryPanel` shell

**Why:** Spec §5. Owns the mode dropdown, filter, collapse, resize, project grouping with drag/drop, persisted expansion and order. Delegates row rendering to `SessionsList` or `PromptsList`.

**Files:**
- Create: `src/components/library/LibraryPanel.tsx`

- [ ] **Step 1: Create the file**

Create `src/components/library/LibraryPanel.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePromptList, useSessionList } from '../../api/hooks';
import type { PromptMeta, SessionMeta } from '../../parse/types';
import { ResizeHandle } from '../ResizeHandle';
import { PromptsList } from './PromptsList';
import { SessionsList } from './SessionsList';

export type LibraryMode = 'sessions' | 'prompts';

export type Selection =
  | { kind: 'session'; projectId: string; sessionId: string }
  | { kind: 'prompt'; projectId: string; sessionId: string; promptId: string };

type Props = {
  selected: Selection | null;
  onSelect: (s: Selection) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  width: number;
  onResize: (delta: number) => void;
};

const STORAGE_MODE = 'tg.library.mode';
const STORAGE_EXPANDED = 'tg.projects.expanded';
const STORAGE_ORDER = 'tg.projects.order';
const STORAGE_TITLES = 'tg.session.titles';

function projectKey(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.slice(-2).join('/');
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function reorderArray<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function readMode(): LibraryMode {
  const raw = readJson<string>(STORAGE_MODE, 'sessions');
  return raw === 'prompts' ? 'prompts' : 'sessions';
}

export function LibraryPanel({ selected, onSelect, collapsed, onToggleCollapsed, width, onResize }: Props) {
  const sessionsQuery = useSessionList();
  const promptsQuery = usePromptList();

  const [mode, setModeState] = useState<LibraryMode>(() => readMode());
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(readJson<string[]>(STORAGE_EXPANDED, [])));
  const [order, setOrder] = useState<string[]>(() => readJson<string[]>(STORAGE_ORDER, []));
  const [titles, setTitles] = useState<Record<string, string>>(() => readJson<Record<string, string>>(STORAGE_TITLES, {}));
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const expandedInit = useRef(false);

  function setMode(next: LibraryMode): void {
    setModeState(next);
    writeJson(STORAGE_MODE, next);
  }

  function onRename(sessionId: string, title: string): void {
    setTitles((prev) => {
      const nextTitles = { ...prev };
      if (!title) delete nextTitles[sessionId];
      else nextTitles[sessionId] = title;
      writeJson(STORAGE_TITLES, nextTitles);
      return nextTitles;
    });
  }

  const sessionsByProject = useMemo(() => {
    if (!sessionsQuery.data) return new Map<string, SessionMeta[]>();
    const filtered = query
      ? sessionsQuery.data.filter((s) => {
          const q = query.toLowerCase();
          const t = (titles[s.sessionId] ?? s.title ?? '').toLowerCase();
          return s.cwd.toLowerCase().includes(q) || t.includes(q);
        })
      : sessionsQuery.data;
    const map = new Map<string, SessionMeta[]>();
    for (const s of filtered) {
      const k = projectKey(s.cwd);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return map;
  }, [sessionsQuery.data, query, titles]);

  const promptsByProject = useMemo(() => {
    if (!promptsQuery.data || !sessionsQuery.data) return new Map<string, PromptMeta[]>();
    // Map projectId -> cwd from the sessions response (the prompt response
    // only carries projectId; cwd lives on SessionMeta).
    const cwdByProject = new Map<string, string>();
    for (const s of sessionsQuery.data) cwdByProject.set(s.projectId, s.cwd);
    const filtered = query
      ? promptsQuery.data.filter((p) => {
          const q = query.toLowerCase();
          const cwd = (cwdByProject.get(p.projectId) ?? '').toLowerCase();
          return cwd.includes(q) || p.text.toLowerCase().includes(q);
        })
      : promptsQuery.data;
    const map = new Map<string, PromptMeta[]>();
    for (const p of filtered) {
      const cwd = cwdByProject.get(p.projectId);
      if (!cwd) continue; // session not yet loaded; skip
      const k = projectKey(cwd);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    // Within each project, newest-first (server already sorted globally,
    // but bucketing preserves order so this is essentially a no-op).
    for (const arr of map.values()) {
      arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }
    return map;
  }, [promptsQuery.data, sessionsQuery.data, query]);

  const groups = useMemo(() => {
    const source = mode === 'sessions' ? sessionsByProject : promptsByProject;
    const arr = Array.from(source.entries()).map(([key, items]) => ({ key, items }));
    const idx = new Map(order.map((k, i) => [k, i]));
    arr.sort((a, b) => {
      const ia = idx.get(a.key);
      const ib = idx.get(b.key);
      if (ia != null && ib != null) return ia - ib;
      if (ia != null) return -1;
      if (ib != null) return 1;
      return a.key.localeCompare(b.key);
    });
    return arr;
  }, [mode, sessionsByProject, promptsByProject, order]);

  useEffect(() => {
    if (expandedInit.current) return;
    const haveData = mode === 'sessions' ? !!sessionsQuery.data : !!promptsQuery.data;
    if (!haveData || groups.length === 0) return;
    expandedInit.current = true;
    if (expanded.size === 0 && readJson<string[]>(STORAGE_EXPANDED, []).length === 0) {
      setExpanded(new Set(groups.map((g) => g.key)));
    }
  }, [mode, sessionsQuery.data, promptsQuery.data, groups, expanded.size]);

  function toggleExpanded(key: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      writeJson(STORAGE_EXPANDED, Array.from(next));
      return next;
    });
  }

  function moveGroup(fromKey: string, toKey: string): void {
    const keys = groups.map((g) => g.key);
    const from = keys.indexOf(fromKey);
    const to = keys.indexOf(toKey);
    if (from < 0 || to < 0 || from === to) return;
    const nextKeys = reorderArray(keys, from, to);
    setOrder(nextKeys);
    writeJson(STORAGE_ORDER, nextKeys);
  }

  if (collapsed) {
    return (
      <aside style={{ ...styles.aside, width: 40, padding: '12px 0' }} data-testid="session-list">
        <button
          onClick={onToggleCollapsed}
          style={styles.collapseBtn}
          aria-label="expand sidebar"
          data-testid="sidebar-toggle"
          title="expand (\\)"
        >»</button>
      </aside>
    );
  }

  const selectedSessionId = selected?.kind === 'session' ? selected.sessionId : null;
  const selectedPromptId = selected?.kind === 'prompt' ? selected.promptId : null;
  const isLoading = mode === 'sessions' ? sessionsQuery.isLoading : promptsQuery.isLoading;
  const error = mode === 'sessions' ? sessionsQuery.error : promptsQuery.error;
  const hasData = mode === 'sessions' ? !!sessionsQuery.data : !!promptsQuery.data;

  return (
    <aside style={{ ...styles.aside, width }} data-testid="session-list">
      <ResizeHandle side="right" onResize={onResize} testId="sidebar-resize" />
      <div style={styles.header}>
        <span style={styles.dropdownWrap}>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as LibraryMode)}
            style={styles.dropdown}
            data-testid="library-mode"
            aria-label="library mode"
          >
            <option value="sessions">SESSIONS</option>
            <option value="prompts">PROMPTS</option>
          </select>
        </span>
        <button
          onClick={onToggleCollapsed}
          style={styles.collapseBtn}
          aria-label="collapse sidebar"
          data-testid="sidebar-toggle"
          title="collapse (\\)"
        >«</button>
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="filter…"
        style={styles.filter}
        data-testid="session-filter"
      />
      {isLoading && <div style={styles.muted}>scanning…</div>}
      {error && <div style={styles.error}>error: {(error as Error).message}</div>}
      {hasData && groups.length === 0 && <div style={styles.muted}>(none)</div>}
      <div style={styles.scroll}>
        {groups.map((g) => {
          const isOpen = expanded.has(g.key);
          const isDragOver = dragOverKey === g.key && dragKey !== null && dragKey !== g.key;
          return (
            <div
              key={g.key}
              style={{ ...styles.group, ...(isDragOver ? styles.groupDragOver : {}) }}
              onDragOver={(e) => { if (dragKey) { e.preventDefault(); setDragOverKey(g.key); } }}
              onDragLeave={() => { if (dragOverKey === g.key) setDragOverKey(null); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragKey && dragKey !== g.key) moveGroup(dragKey, g.key);
                setDragKey(null);
                setDragOverKey(null);
              }}
            >
              <div
                style={styles.groupHeader}
                draggable
                data-testid={`project-header-${g.key}`}
                onDragStart={(e) => { setDragKey(g.key); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => { setDragKey(null); setDragOverKey(null); }}
                onClick={() => toggleExpanded(g.key)}
                title="drag to reorder · click to collapse"
              >
                <span style={styles.grip} aria-hidden>⋮⋮</span>
                <span style={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
                <span style={styles.groupName}>{g.key}</span>
                <span style={styles.groupCount}>({g.items.length})</span>
              </div>
              {isOpen && mode === 'sessions' && (
                <SessionsList
                  items={g.items as SessionMeta[]}
                  selectedSessionId={selectedSessionId}
                  titles={titles}
                  onSelect={(s) => onSelect({ kind: 'session', projectId: s.projectId, sessionId: s.sessionId })}
                  onRename={onRename}
                />
              )}
              {isOpen && mode === 'prompts' && (
                <PromptsList
                  items={g.items as PromptMeta[]}
                  sessionTitles={titles}
                  selectedPromptId={selectedPromptId}
                  onSelect={(p) => onSelect({ kind: 'prompt', projectId: p.projectId, sessionId: p.sessionId, promptId: p.promptId })}
                />
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

const styles = {
  aside: {
    height: '100%',
    borderRight: '1px solid var(--grid)',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    padding: '12px 0',
    position: 'relative' as const,
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px 6px',
    gap: 6,
  },
  dropdownWrap: { position: 'relative' as const, display: 'inline-block' },
  dropdown: {
    appearance: 'none' as const,
    background: 'transparent',
    border: '1px solid var(--edge-trail)',
    color: 'var(--edge-trail)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    letterSpacing: 3,
    padding: '4px 22px 4px 8px',
    cursor: 'pointer',
    backgroundImage: 'linear-gradient(45deg, transparent 50%, var(--edge-trail) 50%), linear-gradient(135deg, var(--edge-trail) 50%, transparent 50%)',
    backgroundPosition: 'calc(100% - 11px) 50%, calc(100% - 7px) 50%',
    backgroundSize: '4px 4px',
    backgroundRepeat: 'no-repeat',
  },
  collapseBtn: {
    background: 'transparent',
    border: '1px solid var(--edge-idle)',
    color: 'var(--text)',
    cursor: 'pointer',
    padding: '0 8px',
    fontSize: 12,
    fontFamily: 'ui-monospace, monospace',
  },
  filter: {
    margin: '0 12px 8px',
    padding: '4px 6px',
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid var(--edge-idle)',
    color: 'var(--text)',
    fontSize: 11,
    fontFamily: 'ui-monospace, monospace',
  },
  scroll: { overflowY: 'auto' as const, flex: 1 },
  group: { marginBottom: 8, borderTop: '1px solid transparent' },
  groupDragOver: { borderTop: '1px solid var(--edge-trail)' },
  groupHeader: {
    padding: '6px 12px 2px',
    fontSize: 10,
    letterSpacing: 2,
    color: 'var(--edge-trail)',
    fontFamily: 'ui-monospace, monospace',
    cursor: 'grab',
    display: 'flex' as const,
    alignItems: 'center',
    gap: 6,
    userSelect: 'none' as const,
  },
  grip: { color: 'var(--text-dim)', cursor: 'grab' },
  chevron: { width: 10, display: 'inline-block', color: 'var(--text-dim)' },
  groupName: { flex: 1, overflow: 'hidden' as const, textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  groupCount: { color: 'var(--text-dim)' },
  muted: { padding: '0 12px', color: 'var(--text-dim)', fontSize: 12 },
  error: { padding: '0 12px', color: 'var(--node-failed)', fontSize: 12 },
};
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/library/LibraryPanel.tsx
git commit -m "$(cat <<'EOF'
feat(library): add LibraryPanel shell with mode dropdown

Owns mode (persisted to tg.library.mode), filter, collapse, resize,
project grouping with persisted order and expansion, drag/drop
group reorder, and session-rename persistence. Delegates row
rendering to SessionsList or PromptsList. The dropdown sits where
the SESSIONS title used to be; collapse button stays at the right.

EOF
)"
```

---

## Task 10: Wire `LibraryPanel` into `App.tsx`, add `effectiveSession`, delete old SessionList

**Why:** Spec §6. Widens `Selected` to the discriminated union, computes `effectiveSession` via `sliceSession` for prompt mode, relabels the session-header overlay as `PROMPT N` in prompt mode, and removes the old component.

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/components/SessionList.tsx`

- [ ] **Step 1: Rewrite `src/App.tsx`**

Replace the contents of `src/App.tsx` with the following. This widens `Selected`, derives a per-prompt `Session` via `sliceSession`, relabels the overlay, and imports `LibraryPanel`. Everything else (playback, panels, follow controls, keyboard, resize widths) stays identical to the current behaviour.

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { LibraryPanel, type Selection } from './components/library/LibraryPanel';
import { GraphCanvas } from './components/GraphCanvas';
import { NowPlaying } from './components/NowPlaying';
import { PlaybackControls } from './components/PlaybackControls';
import { DetailPanel } from './components/DetailPanel';
import { FilterToggles, type Filters } from './components/FilterToggles';
import { Legend } from './components/Legend';
import { usePromptList, useSession } from './api/hooks';
import { sliceSession } from './parse/slice';
import { usePlayback } from './playback/usePlayback';
import { useKeyboard } from './playback/useKeyboard';
import { usePersistentWidth } from './util/usePersistentWidth';
import type { CameraApi } from './graph/useCamera';
import type { Milestone, Session } from './parse/types';

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 520;
const DETAIL_MIN = 320;
const DETAIL_MAX = 720;

function collectSubagentIds(root: Milestone): Set<string> {
  const ids = new Set<string>();
  function walk(node: Milestone, inSub: boolean): void {
    if (inSub) ids.add(node.id);
    if (node.kind === 'subagent_spawn' && node.children.length >= 1) {
      walk(node.children[0], true);
      if (node.children[1]) walk(node.children[1], inSub);
      return;
    }
    for (const c of node.children) walk(c, inSub);
  }
  walk(root, false);
  return ids;
}

export default function App() {
  const [selected, setSelected] = useState<Selection | null>(null);
  const { data: rawSession, isLoading, error } = useSession(
    selected?.projectId ?? null,
    selected?.sessionId ?? null
  );
  const promptsQuery = usePromptList();

  // For prompt selections, derive an `effectiveSession` whose root is the
  // sliced chain. For session selections, pass the parsed session through.
  const effectiveSession: Session | null = useMemo(() => {
    if (!rawSession) return null;
    if (selected?.kind === 'prompt') return sliceSession(rawSession, selected.promptId);
    return rawSession;
  }, [rawSession, selected]);

  const { state: playback, controls } = usePlayback(effectiveSession?.root ?? null);
  const subagentIds = useMemo(
    () => (effectiveSession ? collectSubagentIds(effectiveSession.root) : new Set<string>()),
    [effectiveSession]
  );

  const currentMilestone = playback.order[playback.index] ?? null;
  const inSubagent = currentMilestone ? subagentIds.has(currentMilestone.id) : false;

  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filters, setFilters] = useState<Filters>({ hidePruned: false, hideSubagents: false, successOnly: false });
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [panelDismissed, setPanelDismissed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = usePersistentWidth('tg.sidebar.width', 280, SIDEBAR_MIN, SIDEBAR_MAX);
  const [detailWidth, setDetailWidth] = usePersistentWidth('tg.detail.width', 420, DETAIL_MIN, DETAIL_MAX);
  useEffect(() => { setPinnedId(null); setPanelDismissed(false); }, [selected]);
  useEffect(() => {
    if (playback.playing) {
      setPanelDismissed(false);
      setPinnedId(null);
    }
  }, [playback.playing]);

  const pinnedMilestone = useMemo(() => {
    if (!effectiveSession || !pinnedId) return null;
    return playback.order.find((m) => m.id === pinnedId) ?? null;
  }, [effectiveSession, pinnedId, playback.order]);

  const showLive = !pinnedMilestone && !panelDismissed && (playback.playing || playback.index > 0);
  const displayedMilestone = pinnedMilestone ?? (showLive ? currentMilestone : null);

  function handleDetailClose(): void {
    if (pinnedId) setPinnedId(null);
    else setPanelDismissed(true);
  }

  const cameraRef = useRef<CameraApi | null>(null);
  const followingControls = useMemo<typeof controls>(() => ({
    ...controls,
    play: () => { cameraRef.current?.setFollow(true); controls.play(); },
    toggle: () => {
      if (!playback.playing) cameraRef.current?.setFollow(true);
      controls.toggle();
    },
    step: (d) => { cameraRef.current?.setFollow(true); controls.step(d); },
    scrubTo: (i) => { cameraRef.current?.setFollow(true); controls.scrubTo(i); },
    restart: () => { cameraRef.current?.setFollow(true); controls.restart(); },
  }), [controls, playback.playing]);
  useKeyboard({
    controls: followingControls,
    onFit: () => cameraRef.current?.fit(),
    onToggleFollow: () => cameraRef.current?.setFollow(!cameraRef.current.follow),
    onToggleSidebar: () => setSidebarCollapsed((v) => !v),
    onCloseDetail: handleDetailClose,
  });
  const needsConfirm = !!effectiveSession && effectiveSession.totalMilestones > 1000 && !confirmedIds.has(effectiveSession.id);

  // Header overlay: in prompt mode, show `PROMPT N` where N = ordinal+1
  // taken from the prompts query (cheap lookup, falls back to id).
  const headerTitle = useMemo(() => {
    if (!effectiveSession) return '';
    if (selected?.kind === 'prompt') {
      const p = promptsQuery.data?.find((x) => x.promptId === selected.promptId);
      const n = p ? p.ordinal + 1 : null;
      return n != null ? `PROMPT ${n}` : 'PROMPT';
    }
    return `SESSION ${effectiveSession.id.slice(0, 8)}`;
  }, [effectiveSession, selected, promptsQuery.data]);

  const isMissingSlice = !!rawSession && selected?.kind === 'prompt' && effectiveSession === null;

  return (
    <div style={styles.shell}>
      <LibraryPanel
        selected={selected}
        onSelect={setSelected}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        width={sidebarWidth}
        onResize={(d) => setSidebarWidth((w) => w + d)}
      />
      <main style={{
        ...styles.main,
        paddingRight: displayedMilestone ? detailWidth : 0,
      }}>
        {!selected && <div style={styles.empty}>SELECT A SESSION</div>}
        {selected && isLoading && <div style={styles.empty}>LOADING…</div>}
        {selected && error && <div style={styles.error}>error: {(error as Error).message}</div>}
        {isMissingSlice && <div style={styles.empty} data-testid="prompt-not-found">PROMPT NOT FOUND</div>}
        {effectiveSession && needsConfirm && (
          <div style={styles.overflow} data-testid="overflow-confirm">
            <div style={styles.overflowMsg}>
              LARGE SESSION — {effectiveSession.totalMilestones} MILESTONES
            </div>
            <div style={styles.overflowSub}>Rendering may take a moment.</div>
            <button
              style={styles.overflowBtn}
              data-testid="load-anyway"
              onClick={() => setConfirmedIds((s) => new Set(s).add(effectiveSession.id))}
            >
              LOAD ANYWAY
            </button>
          </div>
        )}
        {effectiveSession && !needsConfirm && (
          <div style={styles.canvasSlot}>
            <div style={styles.sessionHeader} data-testid="session-header">
              <div style={styles.sessionTitle}>{headerTitle}</div>
              <div style={styles.sessionCwd}>{effectiveSession.cwd}</div>
            </div>
            <GraphCanvas
              session={effectiveSession}
              playback={playback}
              subagentIds={subagentIds}
              pinnedId={pinnedId}
              onPin={setPinnedId}
              filters={filters}
              onCameraReady={(api) => { cameraRef.current = api; }}
            />
            <FilterToggles value={filters} onChange={setFilters} />
            <Legend />
          </div>
        )}
        {effectiveSession && !needsConfirm && (
          <div data-testid="chrome-gutter" style={styles.gutter}>
            <NowPlaying current={currentMilestone} edgeProgress={playback.edgeProgress} inSubagent={inSubagent} speed={playback.speed} />
            <PlaybackControls state={playback} controls={followingControls} />
          </div>
        )}
        <DetailPanel
          milestone={displayedMilestone}
          onClose={handleDetailClose}
          width={detailWidth}
          onResize={(d) => setDetailWidth((w) => w + d)}
        />
      </main>
    </div>
  );
}

const GUTTER_HEIGHT = 110;

const styles = {
  shell: { display: 'flex', height: '100%' },
  main: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'hidden' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  canvasSlot: { flex: 1, minHeight: 0, position: 'relative' as const },
  gutter: {
    flexShrink: 0,
    height: GUTTER_HEIGHT,
    borderTop: '1px solid var(--grid)',
    background: 'rgba(5,8,13,0.5)',
    display: 'flex' as const,
    alignItems: 'center',
    gap: 16,
    padding: '0 16px',
    minWidth: 0,
    overflow: 'hidden' as const,
  },
  empty: {
    position: 'absolute' as const, inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-dim)', letterSpacing: 4,
  },
  error: { padding: 24, color: 'var(--node-failed)' },
  sessionHeader: {
    position: 'absolute' as const,
    top: 16,
    left: 24,
    zIndex: 5,
    pointerEvents: 'none' as const,
  },
  sessionTitle: {
    fontSize: 11,
    letterSpacing: 3,
    color: 'var(--edge-trail)',
    fontFamily: 'ui-monospace, monospace',
  },
  sessionCwd: {
    fontSize: 11,
    color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
    marginTop: 2,
  },
  overflow: {
    position: 'absolute' as const, inset: 0,
    display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-dim)', gap: 12,
  },
  overflowMsg: {
    letterSpacing: 4, fontSize: 13, color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
  },
  overflowSub: {
    fontSize: 11, color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
  },
  overflowBtn: {
    background: 'transparent', border: '1px solid var(--edge-trail)',
    color: 'var(--edge-trail)', padding: '8px 18px', cursor: 'pointer',
    fontFamily: 'ui-monospace, monospace', letterSpacing: 3, fontSize: 11,
    boxShadow: '0 0 12px rgba(0, 229, 255, 0.25)',
  },
};
```

- [ ] **Step 2: Delete `src/components/SessionList.tsx`**

Run:

```bash
git rm src/components/SessionList.tsx
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: no errors. (If a stray import of the old `SessionList` remains anywhere, fix it. The only known importer was `App.tsx`, replaced above.)

- [ ] **Step 4: Run the unit test suite**

Run: `npm test`
Expected: PASS — no regressions.

- [ ] **Step 5: Smoke the dev server**

Run: `npm run dev -- --port 5174` and open `http://localhost:5174`. Confirm:
- The dropdown shows `SESSIONS` by default.
- Picking a session from a project group still loads its graph (Sessions mode unchanged).
- Switching to `PROMPTS` lists user-typed prompts grouped by project.
- Clicking a prompt loads the scoped sub-graph; the header reads `PROMPT N`.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "$(cat <<'EOF'
feat(app): wire LibraryPanel + sliceSession into App

Widens Selected into a discriminated union ({kind: 'session'|'prompt'}),
computes effectiveSession via sliceSession for prompt mode, relabels
the header overlay as PROMPT N, surfaces a PROMPT NOT FOUND empty
state when the slice misses, and deletes the obsolete SessionList
component now superseded by src/components/library/.

EOF
)"
```

---

## Task 11: Add E2E test for Prompts mode

**Why:** Spec §9. End-to-end coverage that the dropdown, prompt list, prompt click, scoped graph, and header relabel all wire together correctly. Runs against the demo-happy fixture (now with 2 prompts after Task 1).

**Files:**
- Create: `tests/e2e/prompts-mode.spec.ts`

- [ ] **Step 1: Write the E2E test**

Create `tests/e2e/prompts-mode.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('prompts mode: dropdown switches the list, clicking a prompt opens a scoped graph', async ({ page }) => {
  await page.goto('/');

  // Default Sessions mode renders a list with 3 fixture projects.
  await expect(page.locator('aside li[data-testid^="session-item"]')).toHaveCount(3);

  // Switch to Prompts mode via the dropdown.
  await page.locator('[data-testid="library-mode"]').selectOption('prompts');

  // Demo-happy fixture has 2 prompts (root + follow-up); the other fixtures
  // each contribute at least 1 prompt. So we expect >= 4 prompt rows total.
  const promptRows = page.locator('aside li[data-testid^="prompt-item"]');
  await expect(promptRows.first()).toBeVisible({ timeout: 5_000 });
  const promptCount = await promptRows.count();
  expect(promptCount).toBeGreaterThanOrEqual(4);

  // Click the prompt whose text contains "Now print goodbye" (the follow-up
  // we added in Task 1). Its slice covers tool_call (h6) + completion (h8)
  // -- 3 milestones total including the prompt itself.
  await page.locator('aside li[data-testid^="prompt-item"]', { hasText: 'Now print goodbye' }).click();

  // The session-header overlay relabels to PROMPT N.
  await expect(page.locator('[data-testid="session-header"]')).toContainText(/PROMPT \d+/);

  // The canvas mounts; the slice contains 3 nodes (prompt + tool + completion).
  await expect(page.locator('svg g[data-id]')).toHaveCount(3, { timeout: 5_000 });

  // Now switch back to Sessions mode and verify the dropdown remains
  // functional and the session list reappears.
  await page.locator('[data-testid="library-mode"]').selectOption('sessions');
  await expect(page.locator('aside li[data-testid^="session-item"]')).toHaveCount(3);
});
```

- [ ] **Step 2: Run the new test**

Run: `npm run test:e2e -- --grep "prompts mode"`
Expected: PASS.

- [ ] **Step 3: Run the full E2E suite**

Run: `npm run test:e2e`
Expected: PASS — no regressions in any existing E2E.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/prompts-mode.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): prompts mode dropdown, slice, header relabel

Switches to Prompts mode, asserts the prompt list populates from
fixture data, clicks the follow-up prompt, asserts the header
overlay reads PROMPT N, and asserts the scoped graph renders 3
milestones (the slice — prompt + tool + completion).

EOF
)"
```

---

## Final verification

After all 11 tasks land:

- [ ] **Step 1: Run the full test suite**

Run: `npm test && npm run test:e2e`
Expected: All unit and E2E tests pass.

- [ ] **Step 2: Smoke walkthrough**

Run `npm run dev` and exercise:

1. Sessions mode: select a session, observe the graph plays, header reads `SESSION xxxxxxxx`.
2. Switch dropdown to Prompts: list repopulates with prompt rows, grouped by project, draggable groups.
3. Click a prompt: graph re-renders with only that turn's milestones, header reads `PROMPT N`, playback works.
4. Switch back to Sessions: existing selection state preserved, list returns to sessions.
5. Reload the page: dropdown remembers the last mode (`tg.library.mode`), session-rename titles still apply.

If everything passes, the implementation is complete.