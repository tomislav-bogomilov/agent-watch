# Live Pause & Steer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pause the main agent, an individual subagent, or all agents of a LIVE Claude Code session from ThoughtGraph's UI, and optionally inject a steering note delivered when the agent resumes.

**Architecture:** A global `PreToolUse` hook script gates every tool call through a long-poll POST to ThoughtGraph's dev server. The server keeps in-memory pause state per session, correlates each gate request to its owning agent by looking up `tool_use_id` in the session's transcript files, and holds the HTTP response while the target is paused. Resume answers `allow`, or `deny` + the user's note (which the model reads). Every failure path allows the tool call (fail-open). The UI is a slim status bar under the LIVE panes that expands into a per-agent control dock.

**Tech Stack:** Vite dev-server plugin (connect middleware), plain Node hook script (no deps, global `fetch`), React 19 + TanStack Query, vitest + @testing-library/react, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-13-live-pause-steer-design.md`

**Branch:** `feature/live-pause-steer`

---

## File structure

New files:

| File | Responsibility |
|---|---|
| `server/plugin-shared.ts` | Helpers shared by both vite plugins (`sendJson`, `readBody`, `isSafeId`, `isSafeScopeKey`, `claudeHome`, `assertInsideRoot`) — extracted from `vite-plugin-sessions.ts` |
| `server/control-state.ts` | In-memory pause-state store + gate decision logic (pure, unit-testable, no HTTP/fs) |
| `server/correlate-tool-use.ts` | `tool_use_id` → owner (`'main'` \| agent file id \| `null`) by scanning transcript tails |
| `server/hook-installer.ts` | Surgical settings.json merge: backup, append one PreToolUse entry, idempotent, refuses corrupt JSON |
| `server/vite-plugin-control.ts` | Thin connect middleware wiring the three modules: `/api/control/{gate,pause,resume,state,install-hook}` |
| `hooks/thoughtgraph-gate.mjs` | The hook script Claude Code runs per tool call (dependency-free Node) |
| `src/api/control.ts` | Client fetchers + TanStack Query hooks for the control endpoints |
| `src/components/live/controlRows.ts` | Pure helper: pane entries + control snapshot → `ControlRow[]` |
| `src/components/live/ControlBar.tsx` | Presentational slim bar / expanded dock (B2 layout) |

Modified files:

| File | Change |
|---|---|
| `server/vite-plugin-sessions.ts` | Import shared helpers from `plugin-shared.ts` instead of local copies |
| `vite.config.ts` | Register `controlPlugin()` |
| `src/components/live/LivePanes.tsx` | New `projectId` prop; fetch control state; render `ControlBar`; pass `agentPaused` to panes |
| `src/components/live/LivePane.tsx` | New `agentPaused` prop → amber PAUSED echo |
| `src/App.tsx` | Pass `projectId` to `LivePanes` |
| `playwright.config.ts` | `TG_CLAUDE_SETTINGS` env for e2e isolation |
| `docs/superpowers/specs/2026-06-13-live-pause-steer-design.md` | Port correction (5173 default, installer bakes the port) |
| `USER_GUIDE.md` | New "Pausing & steering live agents" section |

Tests: `tests/unit/server/control-state.test.ts`, `tests/unit/server/correlate-tool-use.test.ts`, `tests/unit/server/hook-installer.test.ts`, `tests/unit/server/gate-script.test.ts`, `tests/unit/server/vite-plugin-control.test.ts`, `tests/unit/live/controlRows.test.ts`, `tests/unit/components/ControlBar.test.tsx`, `tests/e2e/control-bar.spec.ts`.

Known limitation carried into v1: pane↔file pairing is alphabetical (audit finding H2). A subagent pane with no file mapping can't be individually paused — PAUSE ALL still covers it. `buildControlRows` skips unmapped panes.

---

### Task 1: Spec port correction + shared plugin helpers

**Files:**
- Modify: `docs/superpowers/specs/2026-06-13-live-pause-steer-design.md`
- Create: `server/plugin-shared.ts`
- Modify: `server/vite-plugin-sessions.ts`

- [ ] **Step 1: Fix the spec's port claim**

In the spec, replace the sentence about port 5174 (section "1. Gate hook script", item 2) with:

```markdown
2. POST it to `http://127.0.0.1:<port>/api/control/gate` with a ~300ms
   connect timeout. The port defaults to 5173 (Vite's default for
   `npm run dev`); the installer bakes the actual dev-server port into the
   hook command as `--port <port>`, so a port change only requires
   re-running the installer. A gate pointed at a dead port no-ops
   (fail-open).
```

- [ ] **Step 2: Create `server/plugin-shared.ts`**

Move these five helpers out of `vite-plugin-sessions.ts` verbatim (they are currently module-private there at lines ~87–124 and ~227–238):

```ts
import path from 'node:path';
import os from 'node:os';
import type { Connect } from 'vite';

export function claudeHome(): string {
  return process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.claude', 'projects');
}

export function sendJson(res: Parameters<Connect.NextHandleFunction>[1], status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

export function readBody(req: Parameters<Connect.NextHandleFunction>[0]): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export function isSafeId(s: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(s);
}

export function isSafeScopeKey(s: string): boolean {
  return isSafeId(s) && s !== '.' && s !== '..';
}

// True iff `target` resolves to a path inside `root` (or root itself).
export function assertInsideRoot(root: string, target: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw Object.assign(new Error('path escapes root'), { code: 'EOUTSIDE_ROOT' });
  }
}
```

- [ ] **Step 3: Update `vite-plugin-sessions.ts` to import them**

Delete the five local definitions (`claudeHome`, `sendJson`, `readBody`, `isSafeId`, `isSafeScopeKey`, `assertInsideRoot`) and add:

```ts
import { claudeHome, sendJson, readBody, isSafeScopeKey, assertInsideRoot } from './plugin-shared';
```

(`isSafeId` is only used by `isSafeScopeKey`, which now lives in plugin-shared — don't import it into the sessions plugin.)

- [ ] **Step 4: Verify nothing broke**

Run: `npm run typecheck && npx vitest run tests/unit/server`
Expected: PASS (existing `vite-plugin-sessions.test.ts` traversal tests still green — this is a pure extraction).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-06-13-live-pause-steer-design.md server/plugin-shared.ts server/vite-plugin-sessions.ts
git commit -m "refactor(server): extract shared plugin helpers; fix spec port note"
```

---

### Task 2: Control-state store

**Files:**
- Create: `server/control-state.ts`
- Test: `tests/unit/server/control-state.test.ts`

The store is pure logic: pause flags per session, pending steering notes, and held gate requests as promises. No HTTP, no fs.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/server/control-state.test.ts
import { describe, it, expect } from 'vitest';
import { createControlStore, STEER_PREFIX } from '../../../server/control-state';

const INFO = { toolUseId: 'toolu_1', toolName: 'Bash', toolInputSummary: '{"command":"ls"}' };

describe('control store — gate decisions', () => {
  it('allows immediately when the session has no control state', async () => {
    const store = createControlStore();
    await expect(store.gate('s1', 'main', INFO)).resolves.toEqual({ action: 'allow' });
  });

  it('allows an agent whose flag is not set even when another agent is paused', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'agent-0');
    await expect(store.gate('s1', 'agent-1', INFO)).resolves.toEqual({ action: 'allow' });
    await expect(store.gate('s1', 'main', INFO)).resolves.toEqual({ action: 'allow' });
  });

  it('holds a paused target, then answers poll after holdMs', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'main');
    const t0 = Date.now();
    const d = await store.gate('s1', 'main', INFO, 50);
    expect(d).toEqual({ action: 'poll' });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(45);
  });

  it('resume without note releases the held request with allow', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'main');
    const pending = store.gate('s1', 'main', INFO, 5000);
    await new Promise((r) => setTimeout(r, 10));
    store.resume('s1', 'proj', 'main');
    await expect(pending).resolves.toEqual({ action: 'allow' });
  });

  it('resume with note releases the held request with deny + the note', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'agent-0');
    const pending = store.gate('s1', 'agent-0', { ...INFO, toolUseId: 'toolu_2' }, 5000);
    await new Promise((r) => setTimeout(r, 10));
    store.resume('s1', 'proj', 'agent-0', 'use the fixtures dir');
    const d = await pending;
    expect(d.action).toBe('deny');
    if (d.action === 'deny') expect(d.reason).toContain('use the fixtures dir');
    if (d.action === 'deny') expect(d.reason).toContain(STEER_PREFIX.trim().slice(0, 10));
  });

  it('pause-all holds even an unknown owner; targeted pause does not', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'main');
    await expect(store.gate('s1', 'unknown', INFO)).resolves.toEqual({ action: 'allow' });
    store.pause('s1', 'proj', 'all');
    const d = await store.gate('s1', 'unknown', INFO, 50);
    expect(d).toEqual({ action: 'poll' });
  });

  it('a pending note (resume while nothing held) is delivered on the next gate call, once', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'main');
    store.resume('s1', 'proj', 'main', 'check the README first'); // nothing held yet
    const d1 = await store.gate('s1', 'main', INFO);
    expect(d1.action).toBe('deny');
    if (d1.action === 'deny') expect(d1.reason).toContain('check the README first');
    await expect(store.gate('s1', 'main', INFO)).resolves.toEqual({ action: 'allow' });
  });

  it('resume-all clears main, agents, and the all flag', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'all');
    store.pause('s1', 'proj', 'agent-0');
    store.resume('s1', 'proj', 'all');
    await expect(store.gate('s1', 'main', INFO)).resolves.toEqual({ action: 'allow' });
    await expect(store.gate('s1', 'agent-0', INFO)).resolves.toEqual({ action: 'allow' });
  });
});

describe('control store — engagement + snapshot', () => {
  it('isEngaged is false for unseen sessions and true once anything is set', () => {
    const store = createControlStore();
    expect(store.isEngaged('s1')).toBe(false);
    store.pause('s1', 'proj', 'agent-0');
    expect(store.isEngaged('s1')).toBe(true);
    store.resume('s1', 'proj', 'agent-0');
    expect(store.isEngaged('s1')).toBe(false);
  });

  it('remembers projectId from pause calls', () => {
    const store = createControlStore();
    expect(store.projectIdOf('s1')).toBeNull();
    store.pause('s1', 'C--proj', 'main');
    expect(store.projectIdOf('s1')).toBe('C--proj');
  });

  it('snapshot exposes flags and held requests without resolvers', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'agent-0');
    const pending = store.gate('s1', 'agent-0', INFO, 5000);
    await new Promise((r) => setTimeout(r, 10));
    const snap = store.snapshot('s1');
    expect(snap.agents).toEqual({ 'agent-0': true });
    expect(snap.held).toHaveLength(1);
    expect(snap.held[0]).toMatchObject({ toolUseId: 'toolu_1', owner: 'agent-0', toolName: 'Bash' });
    expect(typeof snap.held[0].heldSince).toBe('number');
    store.resume('s1', 'proj', 'agent-0');
    await pending;
    expect(store.snapshot('s1').held).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/server/control-state.test.ts`
Expected: FAIL — `Cannot find module '../../../server/control-state'`

- [ ] **Step 3: Implement `server/control-state.ts`**

```ts
export type GateDecision =
  | { action: 'allow' }
  | { action: 'deny'; reason: string }
  | { action: 'poll' };

export type Owner = 'main' | string;            // string = agent file id, e.g. 'agent-0'
export type ControlTarget = 'all' | Owner;
export type GateInfo = { toolUseId: string; toolName: string; toolInputSummary: string };

export type HeldInfo = {
  toolUseId: string;
  owner: Owner | 'unknown';
  toolName: string;
  toolInputSummary: string;
  heldSince: number;
};

export type ControlSnapshot = {
  all: boolean;
  main: boolean;
  agents: Record<string, boolean>;
  held: HeldInfo[];
  pendingNotes: string[];                        // targets that have a note waiting
};

type HeldEntry = HeldInfo & {
  resolve: (d: GateDecision) => void;
  timer: ReturnType<typeof setTimeout>;
};

type SessionControl = {
  projectId: string;
  all: boolean;
  main: boolean;
  agents: Map<string, boolean>;
  notes: Map<ControlTarget, string>;
  held: Map<string, HeldEntry>;
};

export const HOLD_MS = 55_000;
export const STEER_PREFIX = 'The user paused you from ThoughtGraph and left guidance: ';
export const STEER_SUFFIX =
  ' — Re-evaluate with this guidance in mind, then re-issue the held tool call if it is still appropriate.';

export function createControlStore() {
  const sessions = new Map<string, SessionControl>();

  function ensure(sessionId: string, projectId: string): SessionControl {
    let s = sessions.get(sessionId);
    if (!s) {
      s = { projectId, all: false, main: false, agents: new Map(), notes: new Map(), held: new Map() };
      sessions.set(sessionId, s);
    }
    s.projectId = projectId;
    return s;
  }

  function isPaused(s: SessionControl, owner: Owner | 'unknown'): boolean {
    if (s.all) return true;
    if (owner === 'unknown') return false;       // targeted pause never freezes an unidentified caller
    if (owner === 'main') return s.main;
    return s.agents.get(owner) === true;
  }

  function takeNote(s: SessionControl, owner: Owner | 'unknown'): string | null {
    if (owner !== 'unknown') {
      const own = s.notes.get(owner);
      if (own !== undefined) { s.notes.delete(owner); return own; }
    }
    const all = s.notes.get('all');
    if (all !== undefined) { s.notes.delete('all'); return all; }
    return null;
  }

  function release(s: SessionControl, entry: HeldEntry, decision: GateDecision): void {
    clearTimeout(entry.timer);
    s.held.delete(entry.toolUseId);
    entry.resolve(decision);
  }

  // After any pause/resume, settle held entries whose pause flag cleared.
  function reevaluate(sessionId: string): void {
    const s = sessions.get(sessionId);
    if (!s) return;
    for (const entry of [...s.held.values()]) {
      if (isPaused(s, entry.owner)) continue;
      const note = takeNote(s, entry.owner);
      release(s, entry, note
        ? { action: 'deny', reason: STEER_PREFIX + note + STEER_SUFFIX }
        : { action: 'allow' });
    }
  }

  return {
    pause(sessionId: string, projectId: string, target: ControlTarget): void {
      const s = ensure(sessionId, projectId);
      if (target === 'all') s.all = true;
      else if (target === 'main') s.main = true;
      else s.agents.set(target, true);
    },

    resume(sessionId: string, projectId: string, target: ControlTarget, note?: string): void {
      const s = ensure(sessionId, projectId);
      if (target === 'all') { s.all = false; s.main = false; s.agents.clear(); }
      else if (target === 'main') s.main = false;
      else s.agents.delete(target);
      if (note) s.notes.set(target, note);
      reevaluate(sessionId);
    },

    /** Decide a gate request. May stay pending up to holdMs, then answers 'poll'. */
    gate(sessionId: string, owner: Owner | 'unknown', info: GateInfo, holdMs: number = HOLD_MS): Promise<GateDecision> {
      const s = sessions.get(sessionId);
      if (!s) return Promise.resolve({ action: 'allow' });
      const note = takeNote(s, owner);
      if (note) return Promise.resolve({ action: 'deny', reason: STEER_PREFIX + note + STEER_SUFFIX });
      if (!isPaused(s, owner)) return Promise.resolve({ action: 'allow' });
      return new Promise<GateDecision>((resolve) => {
        const entry: HeldEntry = {
          toolUseId: info.toolUseId,
          owner,
          toolName: info.toolName,
          toolInputSummary: info.toolInputSummary,
          heldSince: Date.now(),
          resolve,
          timer: setTimeout(() => release(s, entry, { action: 'poll' }), holdMs),
        };
        s.held.set(info.toolUseId, entry);
      });
    },

    /** Cheap check so the gate hot path can skip transcript I/O entirely. */
    isEngaged(sessionId: string): boolean {
      const s = sessions.get(sessionId);
      return !!s && (s.all || s.main || s.agents.size > 0 || s.notes.size > 0 || s.held.size > 0);
    },

    projectIdOf(sessionId: string): string | null {
      return sessions.get(sessionId)?.projectId ?? null;
    },

    snapshot(sessionId: string): ControlSnapshot {
      const s = sessions.get(sessionId);
      if (!s) return { all: false, main: false, agents: {}, held: [], pendingNotes: [] };
      return {
        all: s.all,
        main: s.main,
        agents: Object.fromEntries(s.agents),
        held: [...s.held.values()].map(({ resolve: _r, timer: _t, ...info }) => info),
        pendingNotes: [...s.notes.keys()],
      };
    },
  };
}

export type ControlStore = ReturnType<typeof createControlStore>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/server/control-state.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add server/control-state.ts tests/unit/server/control-state.test.ts
git commit -m "feat(control): in-memory pause-state store with long-poll gate decisions"
```

---

### Task 3: tool_use_id → owner correlation

**Files:**
- Create: `server/correlate-tool-use.ts`
- Test: `tests/unit/server/correlate-tool-use.test.ts`

Transcript layout (matches `readSessionPayload`): main = `<root>/<projectId>/<sessionId>.jsonl`, subagents = `<root>/<projectId>/<sessionId>/subagents/<agentId>.jsonl`. Transcript JSON is compact (`JSON.stringify`), so a `tool_use` block contains the literal substring `"id":"<toolUseId>"`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/server/correlate-tool-use.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { findToolUseOwner } from '../../../server/correlate-tool-use';

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-correlate-'));
  const projectDir = path.join(root, 'C--proj');
  const subDir = path.join(projectDir, 'sess-1', 'subagents');
  await fs.mkdir(subDir, { recursive: true });
  const mainLine = JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_main_1', name: 'Bash', input: { command: 'ls' } }] },
  });
  const agentLine = JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_agent_1', name: 'Read', input: { file_path: 'x' } }] },
  });
  await fs.writeFile(path.join(projectDir, 'sess-1.jsonl'), mainLine + '\n', 'utf8');
  await fs.writeFile(path.join(subDir, 'agent-0.jsonl'), agentLine + '\n', 'utf8');
});

afterAll(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('findToolUseOwner', () => {
  it('finds a tool_use in the main transcript', async () => {
    await expect(findToolUseOwner(root, 'C--proj', 'sess-1', 'toolu_main_1')).resolves.toBe('main');
  });

  it('finds a tool_use in a subagent transcript and returns the agent file id', async () => {
    await expect(findToolUseOwner(root, 'C--proj', 'sess-1', 'toolu_agent_1')).resolves.toBe('agent-0');
  });

  it('returns null for an id present nowhere', async () => {
    await expect(findToolUseOwner(root, 'C--proj', 'sess-1', 'toolu_nope')).resolves.toBeNull();
  });

  it('returns null (not a crash) for a session with no transcript', async () => {
    await expect(findToolUseOwner(root, 'C--proj', 'missing', 'toolu_main_1')).resolves.toBeNull();
  });

  it('rejects ids/paths that escape the root', async () => {
    await expect(findToolUseOwner(root, '..', 'sess-1', 'toolu_main_1')).rejects.toThrow(/escapes root/);
    await expect(findToolUseOwner(root, 'C--proj', 'sess-1', 'x"} bad')).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/server/correlate-tool-use.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `server/correlate-tool-use.ts`**

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { assertInsideRoot } from './plugin-shared';

// Only the tail matters: the tool_use we're correlating was emitted moments ago.
const TAIL_BYTES = 512 * 1024;

async function tailContains(filePath: string, needle: string): Promise<boolean> {
  let handle: import('node:fs').promises.FileHandle | undefined;
  try {
    handle = await fs.open(filePath, 'r');
    const stat = await handle.stat();
    const start = Math.max(0, stat.size - TAIL_BYTES);
    const buf = Buffer.alloc(Math.min(TAIL_BYTES, stat.size));
    const { bytesRead } = await handle.read(buf, 0, buf.length, start);
    return buf.slice(0, bytesRead).toString('utf8').includes(needle);
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/**
 * Which agent issued this tool_use? 'main', an agent file id ('agent-0'), or
 * null when the id isn't in any transcript yet (write lag, or foreign session).
 */
export async function findToolUseOwner(
  root: string,
  projectId: string,
  sessionId: string,
  toolUseId: string,
): Promise<'main' | string | null> {
  if (!/^[A-Za-z0-9._-]+$/.test(toolUseId)) return null;
  const projectDir = path.join(root, projectId);
  const mainPath = path.join(projectDir, `${sessionId}.jsonl`);
  const subDir = path.join(projectDir, sessionId, 'subagents');
  assertInsideRoot(root, mainPath);
  assertInsideRoot(root, subDir);

  const needle = `"id":"${toolUseId}"`;
  let subFiles: string[] = [];
  try {
    subFiles = (await fs.readdir(subDir)).filter((f) => f.endsWith('.jsonl'));
  } catch {
    // no subagents dir — main-only session
  }
  for (const f of subFiles) {
    if (await tailContains(path.join(subDir, f), needle)) return f.replace(/\.jsonl$/, '');
  }
  if (await tailContains(mainPath, needle)) return 'main';
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/server/correlate-tool-use.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/correlate-tool-use.ts tests/unit/server/correlate-tool-use.test.ts
git commit -m "feat(control): correlate tool_use_id to owning agent via transcript tails"
```

---

### Task 4: Hook installer (surgical settings.json merge)

**Files:**
- Create: `server/hook-installer.ts`
- Test: `tests/unit/server/hook-installer.test.ts`

User constraint (hard requirement): never disturb other configuration. The installer refuses to write when it can't parse the file, takes a timestamped backup before any write, appends exactly one entry, and is idempotent. Note: writing re-serializes with 2-space indentation — keys, values, and order are preserved; only whitespace formatting may change. The backup preserves the original byte-for-byte.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/server/hook-installer.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { installGateHook, isGateHookInstalled } from '../../../server/hook-installer';

let dir: string;
let settingsPath: string;
const OPTS = () => ({ settingsPath, scriptPath: 'C:/tg/hooks/thoughtgraph-gate.mjs', port: 5173 });

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-installer-'));
  settingsPath = path.join(dir, 'settings.json');
});

afterAll(async () => { /* temp dirs cleaned by OS; nothing shared to remove */ });

describe('installGateHook', () => {
  it('creates settings.json when absent (no backup needed)', async () => {
    const res = await installGateHook(OPTS());
    expect(res.status).toBe('installed');
    expect(res.backupPath).toBeNull();
    const written = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    const entry = written.hooks.PreToolUse[0];
    expect(entry.matcher).toBe('*');
    expect(entry.hooks[0].command).toContain('thoughtgraph-gate.mjs');
    expect(entry.hooks[0].command).toContain('--port 5173');
    expect(entry.hooks[0].timeout).toBe(14400);
  });

  it('preserves every existing key, hook, and entry', async () => {
    const existing = {
      model: 'claude-fable-5',
      permissions: { allow: ['Bash(npm test)'] },
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
        Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo stop' }] }],
      },
    };
    await fs.writeFile(settingsPath, JSON.stringify(existing), 'utf8');
    await installGateHook(OPTS());
    const written = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    expect(written.model).toBe('claude-fable-5');
    expect(written.permissions).toEqual(existing.permissions);
    expect(written.hooks.Stop).toEqual(existing.hooks.Stop);
    expect(written.hooks.PreToolUse[0]).toEqual(existing.hooks.PreToolUse[0]);
    expect(written.hooks.PreToolUse).toHaveLength(2);
  });

  it('writes a backup of the original before modifying', async () => {
    const original = JSON.stringify({ hooks: {} });
    await fs.writeFile(settingsPath, original, 'utf8');
    const res = await installGateHook(OPTS());
    expect(res.backupPath).toBeTruthy();
    expect(await fs.readFile(res.backupPath!, 'utf8')).toBe(original);
  });

  it('is idempotent — second call reports already-installed and writes nothing', async () => {
    await installGateHook(OPTS());
    const after1 = await fs.readFile(settingsPath, 'utf8');
    const res = await installGateHook(OPTS());
    expect(res.status).toBe('already-installed');
    expect(await fs.readFile(settingsPath, 'utf8')).toBe(after1);
  });

  it('refuses to touch a file it cannot parse', async () => {
    await fs.writeFile(settingsPath, '{ not json', 'utf8');
    await expect(installGateHook(OPTS())).rejects.toMatchObject({ code: 'EBADSETTINGS' });
    expect(await fs.readFile(settingsPath, 'utf8')).toBe('{ not json');
  });
});

describe('isGateHookInstalled', () => {
  it('false for missing or unrelated settings, true after install', async () => {
    expect(await isGateHookInstalled(settingsPath)).toBe(false);
    await fs.writeFile(settingsPath, JSON.stringify({ hooks: { PreToolUse: [] } }), 'utf8');
    expect(await isGateHookInstalled(settingsPath)).toBe(false);
    await installGateHook(OPTS());
    expect(await isGateHookInstalled(settingsPath)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/server/hook-installer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `server/hook-installer.ts`**

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const GATE_MARKER = 'thoughtgraph-gate.mjs';
export const GATE_HOOK_TIMEOUT_S = 14_400; // 4h; Claude Code kills the hook (and ALLOWS the call) past this

type HookCmd = { type?: string; command?: string; timeout?: number };
type HookEntry = { matcher?: string; hooks?: HookCmd[] };

export type InstallResult = {
  status: 'installed' | 'already-installed';
  backupPath: string | null;
  settingsPath: string;
};

export function defaultSettingsPath(): string {
  return process.env.TG_CLAUDE_SETTINGS ?? path.join(os.homedir(), '.claude', 'settings.json');
}

function hasGateEntry(settings: unknown): boolean {
  const entries = (settings as { hooks?: { PreToolUse?: HookEntry[] } })?.hooks?.PreToolUse ?? [];
  if (!Array.isArray(entries)) return false;
  return entries.some((e) =>
    (e?.hooks ?? []).some((h) => typeof h?.command === 'string' && h.command.includes(GATE_MARKER)));
}

export async function isGateHookInstalled(settingsPath: string): Promise<boolean> {
  try {
    return hasGateEntry(JSON.parse(await fs.readFile(settingsPath, 'utf8')));
  } catch {
    return false;
  }
}

export async function installGateHook(
  opts: { settingsPath: string; scriptPath: string; port: number },
): Promise<InstallResult> {
  const { settingsPath, scriptPath, port } = opts;

  let raw: string | null = null;
  try {
    raw = await fs.readFile(settingsPath, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }

  let settings: Record<string, unknown> = {};
  if (raw !== null) {
    try {
      settings = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // NEVER overwrite a file we can't parse — the user's config is in there.
      throw Object.assign(new Error('settings.json is not valid JSON — refusing to modify it'), { code: 'EBADSETTINGS' });
    }
  }
  if (hasGateEntry(settings)) return { status: 'already-installed', backupPath: null, settingsPath };

  let backupPath: string | null = null;
  if (raw !== null) {
    backupPath = `${settingsPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await fs.writeFile(backupPath, raw, 'utf8');
  }

  const hooks = ((settings.hooks ??= {}) as Record<string, unknown>);
  const pre = ((hooks.PreToolUse ??= []) as HookEntry[]);
  if (!Array.isArray(pre)) {
    throw Object.assign(new Error('hooks.PreToolUse is not an array — refusing to modify it'), { code: 'EBADSETTINGS' });
  }
  pre.push({
    matcher: '*',
    hooks: [{ type: 'command', command: `node "${scriptPath}" --port ${port}`, timeout: GATE_HOOK_TIMEOUT_S }],
  });

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  return { status: 'installed', backupPath, settingsPath };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/server/hook-installer.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add server/hook-installer.ts tests/unit/server/hook-installer.test.ts
git commit -m "feat(control): surgical gate-hook installer with backup and corrupt-JSON refusal"
```

---

### Task 5: Gate hook script

**Files:**
- Create: `hooks/thoughtgraph-gate.mjs`
- Test: `tests/unit/server/gate-script.test.ts`

Dependency-free Node ≥18 (global `fetch`). Contract: exit 0 always; silence = allow; a single JSON line on stdout = PreToolUse decision. Any error anywhere = allow (fail-open).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/server/gate-script.test.ts
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '../../../hooks/thoughtgraph-gate.mjs');
const INPUT = { session_id: 's1', tool_use_id: 'toolu_1', tool_name: 'Bash', tool_input: { command: 'ls' } };

function runGate(port: number, input: unknown): Promise<{ stdout: string; code: number | null; ms: number }> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [SCRIPT, '--port', String(port)], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, code, ms: Date.now() - t0 }));
    child.stdin.write(typeof input === 'string' ? input : JSON.stringify(input));
    child.stdin.end();
  });
}

/** Serve each canned response once, in order (last one repeats). */
function serve(responses: unknown[]): Promise<{ port: number; close: () => void; requests: () => number }> {
  let i = 0;
  const server = http.createServer((_req, res) => {
    const body = JSON.stringify(responses[Math.min(i, responses.length - 1)]);
    i += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      resolve({ port, close: () => server.close(), requests: () => i });
    });
  });
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

describe('thoughtgraph-gate.mjs', () => {
  it('exits 0 with no output, quickly, when no server is listening (fail-open)', async () => {
    const port = await freePort();
    const r = await runGate(port, INPUT);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(r.ms).toBeLessThan(5_000);
  });

  it('exits 0 silently on allow', async () => {
    const srv = await serve([{ action: 'allow' }]);
    const r = await runGate(srv.port, INPUT);
    srv.close();
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('prints a PreToolUse deny decision on deny', async () => {
    const srv = await serve([{ action: 'deny', reason: 'steer note here' }]);
    const r = await runGate(srv.port, INPUT);
    srv.close();
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.permissionDecisionReason).toBe('steer note here');
  });

  it('loops on poll responses until a terminal answer arrives', async () => {
    const srv = await serve([{ action: 'poll' }, { action: 'poll' }, { action: 'allow' }]);
    const r = await runGate(srv.port, INPUT);
    srv.close();
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(srv.requests()).toBe(3);
  });

  it('exits 0 silently on garbage stdin', async () => {
    const srv = await serve([{ action: 'allow' }]);
    const r = await runGate(srv.port, '{ not json');
    srv.close();
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/server/gate-script.test.ts`
Expected: FAIL — spawn ENOENT (script missing)

- [ ] **Step 3: Implement `hooks/thoughtgraph-gate.mjs`**

```js
#!/usr/bin/env node
// ThoughtGraph gate — global PreToolUse hook.
// Silence + exit 0 = allow. One JSON line on stdout = decision for Claude Code.
// EVERY failure path allows the tool call: ThoughtGraph being closed, crashed,
// or on another port must never block a session (fail-open by design).

// Claude Code's per-hook timeout is configured to 14400s by the installer.
// Self-cap 300s under it: if we're still paused near the deadline, deny with a
// retry instruction so the model's retried tool call re-enters this gate.
const DEADLINE_MS = 14_100_000;
const REQUEST_TIMEOUT_MS = 70_000; // server holds ≤55s per poll; leave headroom
const RENEW_REASON =
  'Paused by the user in ThoughtGraph. Re-issue this exact tool call to continue waiting for resume.';

function argPort() {
  const i = process.argv.indexOf('--port');
  if (i !== -1 && process.argv[i + 1]) {
    const p = Number(process.argv[i + 1]);
    if (Number.isInteger(p) && p > 0 && p < 65536) return p;
  }
  return 5173;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    const bail = setTimeout(() => resolve(data), 5_000); // hook input arrives immediately or not at all
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => { clearTimeout(bail); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(bail); resolve(data); });
  });
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }) + '\n');
}

async function main() {
  const raw = await readStdin();
  let input;
  try { input = JSON.parse(raw); } catch { return; }
  if (!input || typeof input.session_id !== 'string') return;

  const url = `http://127.0.0.1:${argPort()}/api/control/gate`;
  const body = JSON.stringify({
    session_id: input.session_id,
    tool_use_id: input.tool_use_id ?? '',
    tool_name: input.tool_name ?? '',
    tool_input: input.tool_input ?? {},
  });
  const started = Date.now();

  while (Date.now() - started < DEADLINE_MS) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch { return; }                 // server gone / refused / timed out → allow
    if (!res.ok) return;
    let out;
    try { out = await res.json(); } catch { return; }
    if (out.action === 'deny' && typeof out.reason === 'string') { deny(out.reason); return; }
    if (out.action !== 'poll') return;  // 'allow' or anything unexpected → allow
  }
  deny(RENEW_REASON);                   // hook-timeout renewal: costs one model turn per 4h paused
}

main().then(() => process.exit(0), () => process.exit(0));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/server/gate-script.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add hooks/thoughtgraph-gate.mjs tests/unit/server/gate-script.test.ts
git commit -m "feat(control): fail-open PreToolUse gate hook script"
```

---

### Task 6: Control middleware + plugin registration

**Files:**
- Create: `server/vite-plugin-control.ts`
- Modify: `vite.config.ts`
- Test: `tests/unit/server/vite-plugin-control.test.ts`

`createControlMiddleware(deps)` is exported separately from the plugin so tests can mount it on a bare `node:http` server with injected store/root/settings paths. Body field `holdMs` (capped at `HOLD_MS`) exists so tests and e2e can shorten the long-poll — the real hook never sends it.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/server/vite-plugin-control.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createControlMiddleware } from '../../../server/vite-plugin-control';
import { createControlStore } from '../../../server/control-state';

let base: string;
let server: http.Server;
let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-control-mw-'));
  const projectDir = path.join(dir, 'projects', 'C--proj');
  await fs.mkdir(projectDir, { recursive: true });
  const line = JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_m1', name: 'Bash', input: { command: 'ls' } }] },
  });
  await fs.writeFile(path.join(projectDir, 'sess-1.jsonl'), line + '\n', 'utf8');

  const middleware = createControlMiddleware({
    store: createControlStore(),
    root: path.join(dir, 'projects'),
    settingsPath: path.join(dir, 'settings.json'),
    scriptPath: path.join(dir, 'thoughtgraph-gate.mjs'),
    defaultPort: 5173,
  });
  server = http.createServer((req, res) =>
    middleware(req as never, res as never, () => { res.statusCode = 404; res.end(); }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  server.close();
  await fs.rm(dir, { recursive: true, force: true });
});

const post = (p: string, body: unknown) =>
  fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('/api/control middleware', () => {
  it('gate allows immediately for a session with no pause state', async () => {
    const res = await post('/gate', { session_id: 'sess-1', tool_use_id: 'toolu_m1', tool_name: 'Bash', tool_input: {} });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ action: 'allow' });
  });

  it('pause main → gate holds the main tool call, then polls; resume with note → deny carrying the note', async () => {
    await post('/pause', { projectId: 'C--proj', sessionId: 'sess-1', target: 'main' });
    const d1 = await (await post('/gate', { session_id: 'sess-1', tool_use_id: 'toolu_m1', tool_name: 'Bash', tool_input: {}, holdMs: 100 })).json();
    expect(d1).toEqual({ action: 'poll' });
    await post('/resume', { projectId: 'C--proj', sessionId: 'sess-1', target: 'main', note: 'look at tests first' });
    const d2 = await (await post('/gate', { session_id: 'sess-1', tool_use_id: 'toolu_m1', tool_name: 'Bash', tool_input: {} })).json();
    expect(d2.action).toBe('deny');
    expect(d2.reason).toContain('look at tests first');
    const d3 = await (await post('/gate', { session_id: 'sess-1', tool_use_id: 'toolu_m1', tool_name: 'Bash', tool_input: {} })).json();
    expect(d3).toEqual({ action: 'allow' });
  });

  it('targeted pause lets an uncorrelatable tool_use through; pause-all holds it', async () => {
    await post('/pause', { projectId: 'C--proj', sessionId: 'sess-1', target: 'agent-0' });
    const d1 = await (await post('/gate', { session_id: 'sess-1', tool_use_id: 'toolu_unknown', tool_name: 'Bash', tool_input: {}, holdMs: 100 })).json();
    expect(d1).toEqual({ action: 'allow' });
    await post('/pause', { projectId: 'C--proj', sessionId: 'sess-1', target: 'all' });
    const d2 = await (await post('/gate', { session_id: 'sess-1', tool_use_id: 'toolu_unknown', tool_name: 'Bash', tool_input: {}, holdMs: 100 })).json();
    expect(d2).toEqual({ action: 'poll' });
    await post('/resume', { projectId: 'C--proj', sessionId: 'sess-1', target: 'all' });
  });

  it('state reports flags, held entries, and installed=false before install', async () => {
    await post('/pause', { projectId: 'C--proj', sessionId: 'sess-1', target: 'main' });
    const res = await fetch(`${base}/state?projectId=C--proj&sessionId=sess-1`);
    const body = await res.json();
    expect(body.installed).toBe(false);
    expect(body.control.main).toBe(true);
    expect(Array.isArray(body.control.held)).toBe(true);
    await post('/resume', { projectId: 'C--proj', sessionId: 'sess-1', target: 'all' });
  });

  it('install-hook writes settings and state flips installed', async () => {
    const res = await post('/install-hook', {});
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('installed');
    const state = await (await fetch(`${base}/state?projectId=C--proj&sessionId=sess-1`)).json();
    expect(state.installed).toBe(true);
  });

  it('rejects bad ids and bad bodies', async () => {
    expect((await post('/pause', { projectId: '..', sessionId: 'sess-1', target: 'main' })).status).toBe(400);
    expect((await post('/pause', { projectId: 'C--proj', sessionId: 'sess-1', target: 'not/safe' })).status).toBe(400);
    expect((await post('/gate', 'not json' as never)).status).toBe(400);
    expect((await fetch(`${base}/state`)).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/server/vite-plugin-control.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `server/vite-plugin-control.ts`**

```ts
import path from 'node:path';
import type { Plugin, Connect } from 'vite';
import { claudeHome, sendJson, readBody, isSafeScopeKey, isSafeId } from './plugin-shared';
import { createControlStore, HOLD_MS, type ControlStore, type ControlTarget, type Owner } from './control-state';
import { findToolUseOwner } from './correlate-tool-use';
import { defaultSettingsPath, installGateHook, isGateHookInstalled } from './hook-installer';

const CORRELATE_RETRIES = 3;
const CORRELATE_RETRY_MS = 300;
const NOTE_MAX_CHARS = 2_000;
const SUMMARY_MAX_CHARS = 200;

function isValidTarget(t: unknown): t is ControlTarget {
  return t === 'all' || t === 'main' || (typeof t === 'string' && isSafeId(t));
}

export function createControlMiddleware(deps: {
  store: ControlStore;
  root: string;
  settingsPath: string;
  scriptPath: string;
  defaultPort: number;
}): Connect.NextHandleFunction {
  const { store, root, settingsPath, scriptPath, defaultPort } = deps;

  // tool_use_id → owner with a short retry: the transcript line may not be
  // flushed yet when the hook fires (spec: "write-lag race").
  async function correlate(projectId: string, sessionId: string, toolUseId: string): Promise<Owner | 'unknown'> {
    for (let i = 0; i < CORRELATE_RETRIES; i += 1) {
      const owner = await findToolUseOwner(root, projectId, sessionId, toolUseId);
      if (owner) return owner;
      if (i < CORRELATE_RETRIES - 1) await new Promise((r) => setTimeout(r, CORRELATE_RETRY_MS));
    }
    return 'unknown';
  }

  return async (req, res, next) => {
    try {
      const url = (req.url ?? '/').split('?')[0];
      const method = req.method ?? 'GET';

      if (method === 'POST' && url === '/gate') {
        let b: { session_id?: string; tool_use_id?: string; tool_name?: string; tool_input?: unknown; holdMs?: number };
        try { b = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'invalid JSON' }); return; }
        if (typeof b.session_id !== 'string' || !isSafeScopeKey(b.session_id)) { sendJson(res, 400, { error: 'invalid session_id' }); return; }
        // Hot path: nothing paused/pending for this session → allow with zero file I/O.
        if (!store.isEngaged(b.session_id)) { sendJson(res, 200, { action: 'allow' }); return; }
        const projectId = store.projectIdOf(b.session_id);
        if (!projectId) { sendJson(res, 200, { action: 'allow' }); return; }
        const owner = await correlate(projectId, b.session_id, typeof b.tool_use_id === 'string' ? b.tool_use_id : '');
        const holdMs = typeof b.holdMs === 'number' ? Math.min(Math.max(b.holdMs, 0), HOLD_MS) : HOLD_MS;
        const decision = await store.gate(b.session_id, owner, {
          toolUseId: typeof b.tool_use_id === 'string' ? b.tool_use_id : '',
          toolName: typeof b.tool_name === 'string' ? b.tool_name : '',
          toolInputSummary: JSON.stringify(b.tool_input ?? {}).slice(0, SUMMARY_MAX_CHARS),
        }, holdMs);
        sendJson(res, 200, decision);
        return;
      }

      if (method === 'POST' && (url === '/pause' || url === '/resume')) {
        let b: { projectId?: string; sessionId?: string; target?: unknown; note?: unknown };
        try { b = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'invalid JSON' }); return; }
        if (typeof b.projectId !== 'string' || !isSafeScopeKey(b.projectId)
          || typeof b.sessionId !== 'string' || !isSafeScopeKey(b.sessionId)
          || !isValidTarget(b.target)) {
          sendJson(res, 400, { error: 'invalid pause/resume request' });
          return;
        }
        if (url === '/pause') {
          store.pause(b.sessionId, b.projectId, b.target);
        } else {
          const note = typeof b.note === 'string' && b.note.trim()
            ? b.note.trim().slice(0, NOTE_MAX_CHARS)
            : undefined;
          store.resume(b.sessionId, b.projectId, b.target, note);
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (method === 'GET' && url === '/state') {
        const q = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
        const projectId = q.get('projectId') ?? '';
        const sessionId = q.get('sessionId') ?? '';
        if (!isSafeScopeKey(projectId) || !isSafeScopeKey(sessionId)) { sendJson(res, 400, { error: 'invalid ids' }); return; }
        sendJson(res, 200, {
          installed: await isGateHookInstalled(settingsPath),
          control: store.snapshot(sessionId),
        });
        return;
      }

      if (method === 'POST' && url === '/install-hook') {
        try {
          sendJson(res, 200, await installGateHook({ settingsPath, scriptPath, port: defaultPort }));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'EBADSETTINGS') { sendJson(res, 409, { error: (e as Error).message }); return; }
          throw e;
        }
        return;
      }

      sendJson(res, 405, { error: 'method not allowed' });
    } catch (err) {
      next(err as Error);
    }
  };
}

export function controlPlugin(): Plugin {
  return {
    name: 'thoughtgraph:control',
    configureServer(server) {
      const middleware = createControlMiddleware({
        store: createControlStore(),
        root: claudeHome(),
        settingsPath: defaultSettingsPath(),
        scriptPath: path.resolve(server.config.root, 'hooks', 'thoughtgraph-gate.mjs'),
        defaultPort: server.config.server.port ?? 5173,
      });
      server.middlewares.use('/api/control', middleware);
    },
  };
}
```

- [ ] **Step 4: Register the plugin in `vite.config.ts`**

```ts
import { sessionsPlugin } from './server/vite-plugin-sessions';
import { controlPlugin } from './server/vite-plugin-control';

export default defineConfig({
  plugins: [react(), sessionsPlugin(), controlPlugin()],
  // ...test block unchanged
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/server/vite-plugin-control.test.ts && npm run typecheck`
Expected: PASS (6 tests), typecheck clean

- [ ] **Step 6: Commit**

```bash
git add server/vite-plugin-control.ts vite.config.ts tests/unit/server/vite-plugin-control.test.ts
git commit -m "feat(control): /api/control endpoints — gate long-poll, pause/resume, state, install"
```

---

### Task 7: Client API module

**Files:**
- Create: `src/api/control.ts`

Mirrors the `client.ts`/`hooks.ts` pattern (fetchers + TanStack hooks; types imported from the server module like `client.ts` does). No dedicated unit test — exercised by the ControlBar component test and e2e.

- [ ] **Step 1: Implement `src/api/control.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { POLL_MS } from '../components/live/liveness';
import type { ControlSnapshot } from '../../server/control-state';
import type { InstallResult } from '../../server/hook-installer';

export type { ControlSnapshot, HeldInfo } from '../../server/control-state';

export type ControlStateResponse = { installed: boolean; control: ControlSnapshot };
export type ControlTarget = 'all' | 'main' | string;

async function fetchControlState(projectId: string, sessionId: string): Promise<ControlStateResponse> {
  const res = await fetch(`/api/control/state?projectId=${encodeURIComponent(projectId)}&sessionId=${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(`control state failed: ${res.status}`);
  return (await res.json()) as ControlStateResponse;
}

async function postControl(path: 'pause' | 'resume', body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`/api/control/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
}

async function postInstallHook(): Promise<InstallResult> {
  const res = await fetch('/api/control/install-hook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!res.ok) throw new Error(`install failed: ${res.status}`);
  return (await res.json()) as InstallResult;
}

export function useControlState(projectId: string, sessionId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['control', projectId, sessionId],
    queryFn: () => fetchControlState(projectId, sessionId),
    enabled: enabled && !!projectId && !!sessionId,
    refetchInterval: POLL_MS,
  });
}

function useControlMutation(projectId: string, sessionId: string) {
  const qc = useQueryClient();
  return { invalidate: () => qc.invalidateQueries({ queryKey: ['control', projectId, sessionId] }) };
}

export function usePauseTarget(projectId: string, sessionId: string) {
  const { invalidate } = useControlMutation(projectId, sessionId);
  return useMutation({
    mutationFn: (target: ControlTarget) => postControl('pause', { projectId, sessionId, target }),
    onSuccess: invalidate,
  });
}

export function useResumeTarget(projectId: string, sessionId: string) {
  const { invalidate } = useControlMutation(projectId, sessionId);
  return useMutation({
    mutationFn: (v: { target: ControlTarget; note: string | null }) =>
      postControl('resume', { projectId, sessionId, target: v.target, ...(v.note ? { note: v.note } : {}) }),
    onSuccess: invalidate,
  });
}

export function useInstallGateHook(projectId: string, sessionId: string) {
  const { invalidate } = useControlMutation(projectId, sessionId);
  return useMutation({ mutationFn: postInstallHook, onSuccess: invalidate });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/api/control.ts
git commit -m "feat(control): client fetchers + query hooks for /api/control"
```

---

### Task 8: Control rows helper

**Files:**
- Create: `src/components/live/controlRows.ts`
- Test: `tests/unit/live/controlRows.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/live/controlRows.test.ts
import { describe, it, expect } from 'vitest';
import { buildControlRows } from '../../../src/components/live/controlRows';
import type { ControlSnapshot } from '../../../server/control-state';

const EMPTY: ControlSnapshot = { all: false, main: false, agents: {}, held: [], pendingNotes: [] };
const entries = [
  { key: 'spawn:a', summary: 'explore auth module' },
  { key: 'spawn:b', summary: 'write e2e specs' },
];
const mapping = new Map([['spawn:a', 'agent-0'], ['spawn:b', 'agent-1']]);

describe('buildControlRows', () => {
  it('emits MAIN first, then one row per mapped subagent entry', () => {
    const rows = buildControlRows(entries, mapping, EMPTY, 'fix the bug');
    expect(rows.map((r) => r.target)).toEqual(['main', 'agent-0', 'agent-1']);
    expect(rows[0]).toMatchObject({ label: 'MAIN', summary: 'fix the bug', paused: false, held: null });
  });

  it('skips entries with no file mapping (alphabetical-pairing gap)', () => {
    const rows = buildControlRows(entries, new Map([['spawn:a', 'agent-0']]), EMPTY, '');
    expect(rows.map((r) => r.target)).toEqual(['main', 'agent-0']);
  });

  it('marks paused per-flag and via all, and attaches held info by owner', () => {
    const snap: ControlSnapshot = {
      all: false, main: true,
      agents: { 'agent-1': true },
      held: [{ toolUseId: 't1', owner: 'agent-1', toolName: 'Bash', toolInputSummary: '{"command":"npm run e2e"}', heldSince: 123 }],
      pendingNotes: [],
    };
    const rows = buildControlRows(entries, mapping, snap, '');
    expect(rows.find((r) => r.target === 'main')!.paused).toBe(true);
    expect(rows.find((r) => r.target === 'agent-0')!.paused).toBe(false);
    const a1 = rows.find((r) => r.target === 'agent-1')!;
    expect(a1.paused).toBe(true);
    expect(a1.held).toMatchObject({ toolName: 'Bash', heldSince: 123 });

    const all = buildControlRows(entries, mapping, { ...EMPTY, all: true }, '');
    expect(all.every((r) => r.paused)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/live/controlRows.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/components/live/controlRows.ts`**

```ts
import type { ControlSnapshot, HeldInfo } from '../../../server/control-state';
import { subagentLabel } from './subagentLabel';

export type ControlRow = {
  target: 'main' | string;     // 'main' or agent file id — the API pause/resume target
  label: string;
  summary: string;
  paused: boolean;
  held: HeldInfo | null;       // the held tool call, once the gate has caught it
};

export function buildControlRows(
  subEntries: { key: string; summary: string }[],
  keyToFileId: Map<string, string>,
  snapshot: ControlSnapshot,
  mainSummary: string,
): ControlRow[] {
  const heldBy = new Map(snapshot.held.map((h) => [h.owner, h]));
  const rows: ControlRow[] = [{
    target: 'main',
    label: 'MAIN',
    summary: mainSummary,
    paused: snapshot.all || snapshot.main,
    held: heldBy.get('main') ?? null,
  }];
  for (const e of subEntries) {
    const fileId = keyToFileId.get(e.key);
    if (!fileId) continue; // unmapped pane: only PAUSE ALL reaches it (audit H2)
    rows.push({
      target: fileId,
      label: subagentLabel(fileId),
      summary: e.summary,
      paused: snapshot.all || snapshot.agents[fileId] === true,
      held: heldBy.get(fileId) ?? null,
    });
  }
  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/live/controlRows.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/live/controlRows.ts tests/unit/live/controlRows.test.ts
git commit -m "feat(control): pane entries + snapshot -> control rows"
```

---

### Task 9: ControlBar component (B2 slim bar → expanding dock)

**Files:**
- Create: `src/components/live/ControlBar.tsx`
- Test: `tests/unit/components/ControlBar.test.tsx`

Presentational: all data/state via props except `expanded` and per-target note drafts (internal). Auto-expands when anything is paused. TRON palette: cyan `#00e5ff` (main), violet `#b894ff` (subagents), amber `#fbbf24` (paused).

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/unit/components/ControlBar.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ControlBar } from '../../../src/components/live/ControlBar';
import type { ControlRow } from '../../../src/components/live/controlRows';

const running: ControlRow = { target: 'main', label: 'MAIN', summary: 'fix the bug', paused: false, held: null };
const pausedRow: ControlRow = {
  target: 'agent-0', label: 'AGENT 0', summary: 'explore auth', paused: true,
  held: { toolUseId: 't1', owner: 'agent-0', toolName: 'Bash', toolInputSummary: '{"command":"npm test"}', heldSince: 0 },
};
const noop = () => {};
const baseProps = {
  installed: true, nowMs: 65_000, installing: false,
  onPause: noop, onResume: noop, onPauseAll: noop, onResumeAll: noop, onInstall: noop,
};

describe('ControlBar', () => {
  it('renders collapsed by default with running count and PAUSE ALL', () => {
    render(<ControlBar rows={[running]} {...baseProps} />);
    expect(screen.getByTestId('control-bar')).toBeTruthy();
    expect(screen.getByText(/1 running/i)).toBeTruthy();
    expect(screen.getByTestId('control-pause-all')).toBeTruthy();
    expect(screen.queryByTestId('control-row-main')).toBeNull();
  });

  it('expands on toggle, showing per-row pause buttons', () => {
    render(<ControlBar rows={[running]} {...baseProps} />);
    fireEvent.click(screen.getByTestId('control-bar-toggle'));
    expect(screen.getByTestId('control-row-main')).toBeTruthy();
    expect(screen.getByTestId('control-pause-main')).toBeTruthy();
  });

  it('auto-expands when a row is paused, showing held call + elapsed timer', () => {
    render(<ControlBar rows={[running, pausedRow]} {...baseProps} />);
    const row = screen.getByTestId('control-row-agent-0');
    expect(row.textContent).toContain('Bash');
    expect(row.textContent).toContain('npm test');
    expect(row.textContent).toContain('01:05'); // heldSince 0, nowMs 65s
  });

  it('shows "engaging" for a paused row the gate has not caught yet', () => {
    render(<ControlBar rows={[{ ...pausedRow, held: null }]} {...baseProps} />);
    expect(screen.getByTestId('control-row-agent-0').textContent?.toLowerCase()).toContain('engaging');
  });

  it('resume sends the typed note, or null when empty', () => {
    const onResume = vi.fn();
    render(<ControlBar rows={[pausedRow]} {...baseProps} onResume={onResume} />);
    fireEvent.change(screen.getByTestId('control-steer-agent-0'), { target: { value: 'use fixtures' } });
    fireEvent.click(screen.getByTestId('control-resume-agent-0'));
    expect(onResume).toHaveBeenCalledWith('agent-0', 'use fixtures');
  });

  it('pause buttons are disabled and an install prompt shows when the hook is missing', () => {
    const onInstall = vi.fn();
    render(<ControlBar rows={[running]} {...baseProps} installed={false} onInstall={onInstall} />);
    fireEvent.click(screen.getByTestId('control-bar-toggle'));
    expect((screen.getByTestId('control-pause-main') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('control-install'));
    expect(onInstall).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/components/ControlBar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/components/live/ControlBar.tsx`**

```tsx
import { useEffect, useState, type CSSProperties } from 'react';
import type { ControlRow } from './controlRows';

type Props = {
  rows: ControlRow[];
  installed: boolean;
  installing: boolean;
  nowMs: number;
  onPause: (target: string) => void;
  onResume: (target: string, note: string | null) => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onInstall: () => void;
};

const CYAN = '#00e5ff';
const VIOLET = '#b894ff';
const AMBER = '#fbbf24';

const barStyle: CSSProperties = {
  marginTop: 10,
  flexShrink: 0,
  border: '1px solid rgba(0,229,255,0.25)',
  background: 'rgba(5,8,13,0.85)',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 10,
  letterSpacing: 1,
  color: '#a5f3fc',
  padding: '4px 10px',
};

const lineStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minHeight: 22 };

const btnStyle = (color: string, disabled = false): CSSProperties => ({
  background: 'rgba(5,8,13,0.6)',
  border: `1px solid ${color}`,
  color,
  fontFamily: 'ui-monospace, monospace',
  fontSize: 9,
  letterSpacing: 2,
  padding: '2px 8px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.4 : 1,
  flexShrink: 0,
});

const dotStyle = (color: string): CSSProperties => ({
  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
  background: color, boxShadow: `0 0 6px ${color}`,
});

const steerInputStyle: CSSProperties = {
  flex: 1, minWidth: 80,
  background: 'rgba(69,42,7,0.3)',
  border: `1px solid rgba(245,158,11,0.5)`,
  color: '#fde68a',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 10,
  padding: '2px 6px',
};

function rowColor(row: ControlRow): string {
  if (row.paused) return AMBER;
  return row.target === 'main' ? CYAN : VIOLET;
}

function fmtElapsed(heldSince: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - heldSince) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function ControlBar({
  rows, installed, installing, nowMs,
  onPause, onResume, onPauseAll, onResumeAll, onInstall,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const anyPaused = rows.some((r) => r.paused);
  useEffect(() => { if (anyPaused) setExpanded(true); }, [anyPaused]);

  const runningCount = rows.filter((r) => !r.paused).length;
  const pausedCount = rows.length - runningCount;

  return (
    <div data-testid="control-bar" style={barStyle}>
      <div style={lineStyle}>
        <span style={{ fontSize: 8, letterSpacing: 3, color: '#6e95a5' }}>AGENTS</span>
        {rows.map((r) => <span key={r.target} style={dotStyle(rowColor(r))} title={r.label} />)}
        <span style={{ color: '#6e95a5' }}>
          {runningCount} running{pausedCount > 0 ? ` · ${pausedCount} paused` : ''}
        </span>
        <span style={{ flex: 1 }} />
        {anyPaused ? (
          <button type="button" data-testid="control-resume-all" style={btnStyle(AMBER)} onClick={onResumeAll}>
            ▶ RESUME ALL
          </button>
        ) : (
          <button
            type="button"
            data-testid="control-pause-all"
            style={btnStyle(AMBER, !installed)}
            disabled={!installed}
            title={installed ? 'pause all agents at their next tool call' : 'install the gate hook first'}
            onClick={onPauseAll}
          >⏸ ALL</button>
        )}
        <button
          type="button"
          data-testid="control-bar-toggle"
          aria-expanded={expanded}
          style={btnStyle('#155e6e')}
          onClick={() => setExpanded((v) => !v)}
        >{expanded ? '▾' : '▴'}</button>
      </div>

      {expanded && !installed && (
        <div style={{ ...lineStyle, color: AMBER }}>
          <span>gate hook not installed — pausing needs one entry in ~/.claude/settings.json (backup taken)</span>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="control-install" style={btnStyle(AMBER, installing)} disabled={installing} onClick={onInstall}>
            {installing ? 'INSTALLING…' : 'INSTALL GATE HOOK'}
          </button>
        </div>
      )}

      {expanded && rows.map((row) => {
        const color = rowColor(row);
        return (
          <div key={row.target} data-testid={`control-row-${row.target}`} style={{ ...lineStyle, color }}>
            <span style={dotStyle(color)} />
            <span style={{ flexShrink: 0 }}>{row.label}</span>
            <span style={{
              color: '#6e95a5', overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', flex: row.paused ? '0 1 auto' : 1, minWidth: 0,
            }}>{row.summary}</span>
            {row.paused ? (
              <>
                <span style={{ color: AMBER, flexShrink: 0 }}>
                  {row.held
                    ? `holding: ${row.held.toolName}(${row.held.toolInputSummary.slice(0, 60)}) · paused ${fmtElapsed(row.held.heldSince, nowMs)}`
                    : 'engaging… (catches the next tool call)'}
                </span>
                <input
                  data-testid={`control-steer-${row.target}`}
                  style={steerInputStyle}
                  placeholder="steer › guidance delivered on resume"
                  value={notes[row.target] ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [row.target]: e.target.value }))}
                />
                <button
                  type="button"
                  data-testid={`control-resume-${row.target}`}
                  style={btnStyle(AMBER)}
                  onClick={() => {
                    const note = (notes[row.target] ?? '').trim();
                    onResume(row.target, note || null);
                    setNotes((n) => ({ ...n, [row.target]: '' }));
                  }}
                >▶ RESUME</button>
              </>
            ) : (
              <button
                type="button"
                data-testid={`control-pause-${row.target}`}
                style={btnStyle(color, !installed)}
                disabled={!installed}
                title={installed ? `pause ${row.label} at its next tool call` : 'install the gate hook first'}
                onClick={() => onPause(row.target)}
              >⏸</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/components/ControlBar.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/live/ControlBar.tsx tests/unit/components/ControlBar.test.tsx
git commit -m "feat(control): B2 slim status bar with expanding per-agent dock"
```

---

### Task 10: Wire into LivePanes, LivePane echo, App

**Files:**
- Modify: `src/components/live/LivePanes.tsx`
- Modify: `src/components/live/LivePane.tsx`
- Modify: `src/App.tsx`
- Test: existing `tests/unit/components/LivePanes.test.tsx` and `LivePane.test.tsx` must stay green (new props are optional / have defaults where tests construct these components — check and extend fixtures if the new required `projectId` prop breaks `LivePanes.test.tsx`, add `projectId="C--test"` there).

- [ ] **Step 1: LivePane — amber agent-paused echo**

Add to `Props` in `LivePane.tsx`:

```ts
  /** True when the AGENT behind this pane is paused via the control gate (not view-freeze). Amber echo: header chip + glow. */
  agentPaused?: boolean;
```

Destructure `agentPaused = false` in the component. In the header (inside `{showHeader && (...)}`, next to the `{label}` span), add:

```tsx
{agentPaused && (
  <span
    data-testid="live-pane-paused-chip"
    style={{
      flexShrink: 0, border: '1px solid #fbbf24', color: '#fbbf24',
      fontSize: 8, letterSpacing: 2, padding: '0 5px', borderRadius: 2,
      boxShadow: '0 0 6px rgba(245,158,11,0.5)',
    }}
  >PAUSED</span>
)}
```

And on the outer wrapper div's style, after the animation spread:

```tsx
...(agentPaused ? { boxShadow: '0 0 18px rgba(245,158,11,0.35)' } : {}),
```

- [ ] **Step 2: LivePanes — control state, bar, pane echo**

In `LivePanes.tsx`:

```tsx
// new imports
import { ControlBar } from './ControlBar';
import { buildControlRows } from './controlRows';
import { useControlState, usePauseTarget, useResumeTarget, useInstallGateHook } from '../../api/control';
```

Change `Props` to add `projectId: string;`. Inside the component (after `displayable` is computed):

```tsx
const sessionId = session.id;
const controlQuery = useControlState(projectId, sessionId, true);
const pauseMut = usePauseTarget(projectId, sessionId);
const resumeMut = useResumeTarget(projectId, sessionId);
const installMut = useInstallGateHook(projectId, sessionId);
const snapshot = controlQuery.data?.control
  ?? { all: false, main: false, agents: {}, held: [], pendingNotes: [] };
const controlRows = buildControlRows(
  displayable.map((e) => ({ key: e.key, summary: e.root.summary })),
  keyToFileId,
  snapshot,
  mainRoot.summary,
);
```

Render the bar as the last child of the outer div (after the grid):

```tsx
<ControlBar
  rows={controlRows}
  installed={controlQuery.data?.installed ?? false}
  installing={installMut.isPending}
  nowMs={nowMs}
  onPause={(target) => pauseMut.mutate(target)}
  onResume={(target, note) => resumeMut.mutate({ target, note })}
  onPauseAll={() => pauseMut.mutate('all')}
  onResumeAll={() => resumeMut.mutate({ target: 'all', note: null })}
  onInstall={() => installMut.mutate()}
/>
```

Pane echo — main pane gets:

```tsx
agentPaused={snapshot.all || snapshot.main}
```

and each subagent `LivePane` gets:

```tsx
agentPaused={snapshot.all || snapshot.agents[fileId] === true}
```

(`fileId` is already computed in that map callback.)

- [ ] **Step 3: App.tsx — pass projectId**

At the `LivePanes` call site (~line 388):

```tsx
<LivePanes
  session={effectiveSession}
  projectId={(selected?.kind === 'session' || selected?.kind === 'prompt') ? selected.projectId : ''}
  subagentMtimes={effectiveSession.subagentMtimes}
  onToggleLive={() => setLiveEngaged((v) => !v)}
/>
```

(Verify the discriminant values against the actual `selected` union in App.tsx; adjust to whatever kinds carry `projectId`.)

- [ ] **Step 4: Fix any broken component tests**

Run: `npx vitest run tests/unit/components`
Expected: `LivePanes.test.tsx` may fail on the new required prop — add `projectId="C--test"` to its render calls. The control query fires a fetch in jsdom; if the test environment lacks a fetch mock, stub it at the top of the test file:

```ts
vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
  installed: false,
  control: { all: false, main: false, agents: {}, held: [], pendingNotes: [] },
}), { status: 200, headers: { 'content-type': 'application/json' } })));
```

(Match however `LivePanes.test.tsx` already handles network — it may already wrap in a QueryClientProvider with fetch mocked; follow the existing pattern.)

- [ ] **Step 5: Full unit suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/live/LivePanes.tsx src/components/live/LivePane.tsx src/App.tsx tests/unit/components
git commit -m "feat(control): wire control bar into LIVE panes with paused-pane echo"
```

---

### Task 11: E2E

**Files:**
- Modify: `playwright.config.ts`
- Create: `tests/e2e/control-bar.spec.ts`

E2E must not touch the real `~/.claude/settings.json` — point `TG_CLAUDE_SETTINGS` at a scratch path. Gate round-trips are tested with deterministic note-pending paths (no long-poll timing races). Mind the port-5174 stray-dev-server gotcha: kill any stray `npm run dev` first.

- [ ] **Step 1: Add the settings env to `playwright.config.ts`**

In `webServer.env`:

```ts
TG_CLAUDE_SETTINGS: path.resolve(__dirname, '.local/e2e-claude-settings.json'),
```

- [ ] **Step 2: Write `tests/e2e/control-bar.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS = path.resolve(__dirname, '../../.local/e2e-claude-settings.json');
const FIXTURES = path.resolve(__dirname, '../fixtures/claude-projects');

// Mirror live-session-tag.spec.ts: a session is LIVE when its mtime is fresh.
// Find the fixture project/session that spec uses and reuse the same helper if
// one exists; otherwise touch the newest fixture session like this:
async function touchNewestFixtureSession(): Promise<{ projectId: string; sessionId: string }> {
  const projects = await fs.readdir(FIXTURES);
  for (const projectId of projects) {
    const dir = path.join(FIXTURES, projectId);
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.jsonl'));
    if (files.length > 0) {
      const sessionId = files[0].replace(/\.jsonl$/, '');
      const now = new Date();
      await fs.utimes(path.join(dir, files[0]), now, now);
      return { projectId, sessionId };
    }
  }
  throw new Error('no fixture session found');
}

test.describe('LIVE control bar', () => {
  let projectId: string;
  let sessionId: string;

  test.beforeAll(async () => {
    // Pre-seed an "installed" settings file so pause buttons are enabled.
    await fs.mkdir(path.dirname(SETTINGS), { recursive: true });
    await fs.writeFile(SETTINGS, JSON.stringify({
      hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'node "x/thoughtgraph-gate.mjs" --port 5174', timeout: 14400 }] }] },
    }, null, 2), 'utf8');
    ({ projectId, sessionId } = await touchNewestFixtureSession());
  });

  test('bar renders collapsed, expands, pauses, steers, resumes', async ({ page, request }) => {
    await touchNewestFixtureSession(); // keep it inside the 3-min LIVE window
    await page.goto('/');
    // Open the live session + engage LIVE the same way live-session-tag.spec.ts does.
    await page.getByTestId('live-tag').first().click();
    await page.getByTestId('live-button').click();

    const bar = page.getByTestId('control-bar');
    await expect(bar).toBeVisible();
    await expect(page.getByTestId('control-row-main')).toHaveCount(0); // collapsed

    await page.getByTestId('control-bar-toggle').click();
    await expect(page.getByTestId('control-row-main')).toBeVisible();

    // Pause MAIN → row flips to paused/engaging, pane shows amber chip.
    await page.getByTestId('control-pause-main').click();
    await expect(page.getByTestId('control-row-main')).toContainText(/engaging|holding/i);

    // Deterministic gate round-trip via the API (fake hook client):
    // resume with a note → note is pending → next gate call gets deny+note.
    await page.getByTestId('control-steer-main').fill('use the fixtures dir');
    await page.getByTestId('control-resume-main').click();
    const gate = await request.post('/api/control/gate', {
      data: { session_id: sessionId, tool_use_id: 'toolu_e2e', tool_name: 'Bash', tool_input: {}, holdMs: 100 },
    });
    const decision = await gate.json();
    expect(decision.action).toBe('deny');
    expect(decision.reason).toContain('use the fixtures dir');

    // After the note is consumed and nothing is paused, gate allows.
    const gate2 = await request.post('/api/control/gate', {
      data: { session_id: sessionId, tool_use_id: 'toolu_e2e', tool_name: 'Bash', tool_input: {}, holdMs: 100 },
    });
    expect((await gate2.json()).action).toBe('allow');

    // PAUSE ALL → collapsed line shows paused count; RESUME ALL clears it.
    await page.getByTestId('control-pause-all').click();
    await expect(bar).toContainText(/paused/i);
    await page.getByTestId('control-resume-all').click();
    await expect(bar).not.toContainText(/paused/i);
  });
});
```

Note for the executor: the selector flow into a live session (`live-tag`, `live-button`) must match what `live-session-tag.spec.ts` actually does — read that spec first and reuse its navigation verbatim. The fixture session's `session_id` used by the gate POST is the fixture file name. The note-pending gate test targets `'main'`; correlation of `toolu_e2e` returns `unknown`, and `takeNote` only matches owner — so the note must be left on target `all` instead if this proves flaky: pausing ALL and resuming ALL with the note makes the unknown-owner path consume it deterministically. Prefer that variant if the main-targeted note doesn't reach the unknown owner (it won't — `takeNote('unknown')` only consumes `'all'` notes). **Use PAUSE ALL / RESUME ALL with the steer note on the MAIN row only if the main row's note fails the deny assertion; the `all`-note path is the spec-correct deterministic choice.**

- [ ] **Step 3: Run the e2e spec**

First kill any stray dev server (port-5174 gotcha), then:

Run: `npx playwright test tests/e2e/control-bar.spec.ts`
Expected: PASS. (The 7 known-failing hologram/playback specs are unrelated baseline — don't chase them.)

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e/control-bar.spec.ts
git commit -m "test(e2e): LIVE control bar pause/steer/resume flow"
```

---

### Task 12: Docs, full verification, manual checklist

**Files:**
- Modify: `USER_GUIDE.md`

- [ ] **Step 1: Add a USER_GUIDE section**

Add under the LIVE-view documentation:

```markdown
## Pausing & steering live agents

In a LIVE session, the slim **AGENTS** bar under the canvas controls the
running agents. Expand it (▴) for one row per agent.

- **⏸** pauses that agent at its **next tool call** (it can't interrupt
  mid-response — the row shows "engaging…" until the gate catches it, then
  the held tool call and a paused timer).
- While paused, type into **steer ›** and hit **▶ RESUME** — the note is
  delivered to the agent, which re-evaluates before continuing. Resume with
  an empty field releases the held call untouched.
- **⏸ ALL / ▶ RESUME ALL** cover every agent, including subagents the UI
  can't individually target.

First use installs a `PreToolUse` gate hook into `~/.claude/settings.json`
(one entry, timestamped backup taken, nothing else touched). The gate
**fails open**: if ThoughtGraph isn't running — or you close it while
something is paused — every agent resumes. Pause state lives in server
memory only; restarting the dev server unpauses everything.

Limits: pause lands on tool-call boundaries; pausing longer than ~4h costs
one model turn to renew the hold; subagent identification relies on
transcript correlation and falls back to allow when it can't tell who's
calling (PAUSE ALL never needs correlation).
```

- [ ] **Step 2: Full verification**

Run: `npm run typecheck && npm test && npx playwright test`
Expected: typecheck clean; unit suite PASS; e2e PASS except the 7 known-failing baseline specs (hologram/playback/camera/hud/zoom — pre-existing on main).

- [ ] **Step 3: Manual end-to-end check (real session)**

1. `npm run dev` (port 5173), open ThoughtGraph.
2. Start a real Claude Code session on any scratch project; give it a long multi-tool task.
3. In ThoughtGraph: open the session, engage LIVE, expand the bar → INSTALL GATE HOOK. Verify `~/.claude/settings.json` got exactly one new PreToolUse entry + a `.bak-*` sibling, everything else byte-identical.
4. Pause MAIN → watch "engaging…" become `holding: <tool>` when the agent's next tool call hits the gate; confirm the Claude Code terminal sits idle (no token burn).
5. Steer + resume → confirm the model visibly receives the note (deny reason in the terminal) and re-issues/adjusts the tool call.
6. Pause, then quit the ThoughtGraph dev server → confirm the agent resumes within ~70s (fail-open).
7. Spawn subagents (ask the session to use the Task tool) → pause one subagent row; confirm the other pane keeps streaming.
8. Note any undocumented hook-timeout behavior observed (the 14400s cap is empirically unverified — if Claude Code rejects or clamps it, file it in the spec).

- [ ] **Step 4: Commit + update memory**

```bash
git add USER_GUIDE.md
git commit -m "docs: pausing & steering live agents"
```

Update the project memory file `project-live-pause-steer.md`: status → implemented on `feature/live-pause-steer`, pending merge authorization.

---

## Self-review notes (already applied)

- **Spec coverage:** gate script (Task 5), control endpoints + in-memory state (Tasks 2, 6), correlation + write-lag fallback (Task 3, 6), installer constraints (Task 4), B2 bar + B3 row detail + pane echo + pause-pending (Tasks 9, 10), edge cases (fail-open in Tasks 2/5/6; hook-missing prompt Task 9; multi-session keying Task 2), testing pyramid per spec (Tasks 2–11), manual timeout verification (Task 12).
- **Port discrepancy** between spec (5174) and reality (Vite default 5173) — corrected in Task 1; installer bakes the port.
- **Type consistency:** `ControlSnapshot`/`HeldInfo`/`GateDecision` defined once in `server/control-state.ts`, imported everywhere (client via `src/api/control.ts` re-export, rows via direct import) — same cross-boundary import pattern `client.ts` already uses.
- **Known v1 gaps stated:** unmapped subagent panes are PAUSE-ALL-only (audit H2); steering targets an unknown owner only via `all` notes.
