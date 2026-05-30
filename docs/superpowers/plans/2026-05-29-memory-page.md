# Memory Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth library mode (`memory`) to ClaudeWatch that visualizes, follows, analyzes, and edits Claude Code's memory store (global + per-project).

**Architecture:** A new server module (`server/memory-store.ts`) reads and writes memory markdown files and reconciles `MEMORY.md`, exposed over new `/api/memory` GET/POST/PUT/DELETE endpoints in the existing Vite plugin. The frontend adds a `src/memory/` feature directory (mirroring `src/tokens/`) with a `MemoryPage` that carries a DETAIL ⇄ GRAPH ⇄ STATS toggle, plus a `MemoryList` rendered in the existing sidebar. These are the app's first filesystem write endpoints, so path containment, frontmatter validation, and backup-before-write are built in.

**Tech Stack:** React 19, TypeScript, Vite 6, TanStack Query 5, d3-force 7, Vitest, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-29-memory-page-design.md`

---

## File structure

**Server (create):**
- `server/memory-store.ts` — parsing, serialization, index reconciliation, path safety, read aggregator, and write operations. Exports the canonical types.

**Server (modify):**
- `server/vite-plugin-sessions.ts` — register the `/api/memory` middleware (GET/POST/PUT/DELETE).

**Frontend data (modify):**
- `src/api/client.ts` — `fetchMemory`, `createMemory`, `updateMemory`, `deleteMemory` + type re-exports.
- `src/api/hooks.ts` — `useMemoryList`, `useCreateMemory`, `useUpdateMemory`, `useDeleteMemory`.

**Frontend feature (create) — `src/memory/`:**
- `insights.ts` — pure derivation (backlinks, orphans, broken links, composition, staleness, provenance).
- `renderBody.tsx` — minimal markdown body renderer (bold + clickable `[[links]]`).
- `MemoryPage.tsx` — main pane; DETAIL/GRAPH/STATS toggle + empty state.
- `MemoryDetail.tsx` — reading view + Connections + edit/delete actions.
- `MemoryEditor.tsx` — hybrid editor (frontmatter fields + markdown body + `[[ ]]` autocomplete).
- `MemoryStats.tsx` — composition / health / staleness / provenance.
- `MemoryGraph.tsx` — d3-force constellation.

**Frontend sidebar (create + modify):**
- `src/components/library/MemoryList.tsx` (create) — grouped GLOBAL + per-project list.
- `src/components/library/LibraryPanel.tsx` (modify) — add `'memory'` to `LibraryMode` + `Selection`, dropdown option, render `MemoryList`.
- `src/App.tsx` (modify) — route `mode === 'memory'` to `MemoryPage`; handle memory selection + origin-session jump; guard the session-loading machinery.

**Tests (create):**
- `tests/unit/server/memory-store.test.ts`
- `tests/unit/memory/insights.test.ts`
- `tests/unit/memory/renderBody.test.tsx`
- `tests/unit/memory/MemoryEditor.test.tsx`
- `tests/unit/memory/MemoryStats.test.tsx`
- `tests/unit/memory/MemoryGraph.test.tsx`
- `tests/e2e/memory-page.spec.ts`
- Read fixtures under `tests/fixtures/claude-projects/C--demo-mem/memory/`.
- Extend `tests/unit/App-mode-routing.test.tsx`.

---

## Canonical types (defined in Task 1, used everywhere)

```ts
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export type MemoryScope =
  | { kind: 'global' }
  | { kind: 'project'; projectId: string; cwd: string };

export type MemoryRecord = {
  scopeKey: string;            // 'global' | projectId
  scope: MemoryScope;
  name: string;
  description: string;
  type: MemoryType | null;     // null when frontmatter malformed/missing
  originSessionId: string | null;
  links: string[];             // outgoing [[names]], deduped
  body: string;                // raw markdown after frontmatter
  mtimeMs: number;
  inIndex: boolean;
  parseError?: string;
};

export type MemoryIndexEntry = { name: string; title: string; hook?: string; filePresent: boolean };

export type MemoryResponse = {
  memories: MemoryRecord[];
  indexes: { scopeKey: string; entries: MemoryIndexEntry[] }[];
};
```

---

## Task 1: Frontmatter parse + serialize

**Files:**
- Create: `server/memory-store.ts`
- Test: `tests/unit/server/memory-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/server/memory-store.test.ts
import { describe, it, expect } from 'vitest';
import { parseMemoryFile, serializeMemory } from '../../../server/memory-store';

const SAMPLE = `---
name: feedback-visual-prototyping
description: "For ThoughtGraph visual decisions, propose mockups"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 44525a7e-f053
---

Body line one. See [[thoughtgraph-visual-direction]] and [[git-workflow]].
`;

describe('parseMemoryFile', () => {
  it('extracts frontmatter fields, body, and deduped links', () => {
    const p = parseMemoryFile(SAMPLE);
    expect(p.parseError).toBeUndefined();
    expect(p.frontmatter.name).toBe('feedback-visual-prototyping');
    expect(p.frontmatter.description).toBe('For ThoughtGraph visual decisions, propose mockups');
    expect(p.frontmatter.type).toBe('feedback');
    expect(p.frontmatter.originSessionId).toBe('44525a7e-f053');
    expect(p.body.trim().startsWith('Body line one')).toBe(true);
    expect(p.links).toEqual(['thoughtgraph-visual-direction', 'git-workflow']);
  });

  it('returns parseError (no throw) when frontmatter is missing', () => {
    const p = parseMemoryFile('no frontmatter here');
    expect(p.parseError).toBeTruthy();
    expect(p.links).toEqual([]);
  });

  it('round-trips through serializeMemory preserving originSessionId', () => {
    const text = serializeMemory({
      name: 'a-memory', description: 'desc', type: 'project',
      originSessionId: 'sess-1', body: 'Hello [[a-memory]]',
    });
    const p = parseMemoryFile(text);
    expect(p.frontmatter.name).toBe('a-memory');
    expect(p.frontmatter.type).toBe('project');
    expect(p.frontmatter.originSessionId).toBe('sess-1');
    expect(p.body.trim()).toBe('Hello [[a-memory]]');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/memory-store.test.ts`
Expected: FAIL — "does not provide an export named 'parseMemoryFile'".

- [ ] **Step 3: Write minimal implementation**

```ts
// server/memory-store.ts
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

const MEMORY_TYPES: readonly MemoryType[] = ['user', 'feedback', 'project', 'reference'];

export type ParsedFrontmatter = {
  name?: string;
  description?: string;
  type?: MemoryType;
  originSessionId?: string;
  nodeType?: string;
};

export type ParsedMemory = {
  frontmatter: ParsedFrontmatter;
  body: string;
  links: string[];
  parseError?: string;
};

const LINK_RE = /\[\[([a-z0-9][a-z0-9-]*)\]\]/g;

export function extractLinks(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(LINK_RE)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

export function parseMemoryFile(raw: string): ParsedMemory {
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { frontmatter: {}, body: normalized, links: [], parseError: 'missing frontmatter' };
  }
  const end = normalized.indexOf('\n---', 3);
  if (end === -1) {
    return { frontmatter: {}, body: normalized, links: [], parseError: 'unterminated frontmatter' };
  }
  const fmBlock = normalized.slice(4, end);
  const afterFence = normalized.indexOf('\n', end + 1);
  const body = afterFence === -1 ? '' : normalized.slice(afterFence + 1);

  const fm: ParsedFrontmatter = {};
  for (const line of fmBlock.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = unquote(m[2]);
    if (key === 'name') fm.name = val;
    else if (key === 'description') fm.description = val;
    else if (key === 'node_type') fm.nodeType = val;
    else if (key === 'originSessionId') fm.originSessionId = val || undefined;
    else if (key === 'type' && (MEMORY_TYPES as readonly string[]).includes(val)) fm.type = val as MemoryType;
  }
  return { frontmatter: fm, body, links: extractLinks(body) };
}

export function serializeMemory(input: {
  name: string;
  description: string;
  type: MemoryType;
  originSessionId?: string | null;
  body: string;
}): string {
  const lines = [
    '---',
    `name: ${input.name}`,
    `description: ${JSON.stringify(input.description)}`,
    'metadata:',
    '  node_type: memory',
    `  type: ${input.type}`,
  ];
  if (input.originSessionId) lines.push(`  originSessionId: ${input.originSessionId}`);
  lines.push('---', '', input.body.replace(/\r\n/g, '\n').replace(/\s+$/, ''), '');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/memory-store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/memory-store.ts tests/unit/server/memory-store.test.ts
git commit -m "feat(memory): frontmatter parse + serialize"
```

---

## Task 2: Index parsing, name/path safety, scope dirs

**Files:**
- Modify: `server/memory-store.ts`
- Test: `tests/unit/server/memory-store.test.ts`

- [ ] **Step 1: Write the failing test (append to the existing file)**

```ts
import {
  parseIndex, upsertIndexLine, removeIndexLine, deriveIndexEntry,
  isMemoryName, memoryDirFor, resolveMemoryFile,
} from '../../../server/memory-store';
import path from 'node:path';

describe('index + safety', () => {
  const INDEX = `- [Visual Direction](thoughtgraph-visual-direction.md) — TRON aesthetic
- [Git Workflow](git-workflow.md)
not-an-entry-line
`;

  it('parses index entries with optional hook', () => {
    const entries = parseIndex(INDEX);
    expect(entries.map((e) => e.name)).toEqual(['thoughtgraph-visual-direction', 'git-workflow']);
    expect(entries[0].hook).toBe('TRON aesthetic');
    expect(entries[1].hook).toBeUndefined();
  });

  it('upsert replaces an existing line and appends a new one', () => {
    const e = deriveIndexEntry('git-workflow', 'A clear git workflow. More text.');
    const next = upsertIndexLine(INDEX, e.name, e.title, e.hook);
    expect(next.match(/git-workflow\.md/g)).toHaveLength(1);
    const added = upsertIndexLine(next, 'new-one', 'New One', 'hook');
    expect(added).toContain('- [New One](new-one.md) — hook');
  });

  it('removeIndexLine drops the matching line', () => {
    expect(removeIndexLine(INDEX, 'git-workflow')).not.toContain('git-workflow.md');
  });

  it('isMemoryName rejects separators and traversal', () => {
    expect(isMemoryName('good-name-1')).toBe(true);
    expect(isMemoryName('Bad_Name')).toBe(false);
    expect(isMemoryName('..')).toBe(false);
    expect(isMemoryName('a/b')).toBe(false);
  });

  it('memoryDirFor puts global as a sibling of the projects root', () => {
    const root = path.join('C:', 'home', '.claude', 'projects');
    expect(memoryDirFor(root, 'global')).toBe(path.join('C:', 'home', '.claude', 'memory'));
    expect(memoryDirFor(root, 'C--demo')).toBe(path.join(root, 'C--demo', 'memory'));
  });

  it('resolveMemoryFile rejects names that escape the scope dir', () => {
    const root = path.join('C:', 'home', '.claude', 'projects');
    expect(() => resolveMemoryFile(root, 'global', '../escape')).toThrow();
    expect(resolveMemoryFile(root, 'global', 'ok-name')).toBe(
      path.join(memoryDirFor(root, 'global'), 'ok-name.md')
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/memory-store.test.ts`
Expected: FAIL — exports not found.

- [ ] **Step 3: Write minimal implementation (append to `server/memory-store.ts`)**

```ts
import path from 'node:path';

export type MemoryIndexEntry = { name: string; title: string; hook?: string; filePresent: boolean };

const INDEX_LINE_RE = /^-\s*\[([^\]]+)\]\(([^)]+)\.md\)(?:\s*[—-]\s*(.*))?$/;

export function parseIndex(raw: string): MemoryIndexEntry[] {
  const out: MemoryIndexEntry[] = [];
  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const m = line.trim().match(INDEX_LINE_RE);
    if (!m) continue;
    out.push({ title: m[1].trim(), name: m[2].trim(), hook: m[3]?.trim() || undefined, filePresent: false });
  }
  return out;
}

export function indexLineFor(name: string, title: string, hook?: string): string {
  return hook ? `- [${title}](${name}.md) — ${hook}` : `- [${title}](${name}.md)`;
}

export function upsertIndexLine(raw: string, name: string, title: string, hook?: string): string {
  const line = indexLineFor(name, title, hook);
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const idx = lines.findIndex((l) => {
    const m = l.trim().match(INDEX_LINE_RE);
    return m?.[2].trim() === name;
  });
  if (idx >= 0) { lines[idx] = line; return lines.join('\n'); }
  const trimmed = raw.replace(/\s*$/, '');
  return trimmed ? `${trimmed}\n${line}\n` : `${line}\n`;
}

export function removeIndexLine(raw: string, name: string): string {
  const kept = raw.replace(/\r\n/g, '\n').split('\n').filter((l) => {
    const m = l.trim().match(INDEX_LINE_RE);
    return m?.[2].trim() !== name;
  });
  return kept.join('\n');
}

export function deriveIndexEntry(name: string, description: string): { name: string; title: string; hook: string } {
  const title = name.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
  const firstSentence = description.split(/(?<=[.!?])\s/)[0] ?? description;
  const hook = firstSentence.length > 70 ? `${firstSentence.slice(0, 67)}…` : firstSentence;
  return { name, title, hook };
}

export function isMemoryName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(name);
}

export function memoryDirFor(projectsRoot: string, scopeKey: string): string {
  if (scopeKey === 'global') return path.join(projectsRoot, '..', 'memory');
  return path.join(projectsRoot, scopeKey, 'memory');
}

export function resolveMemoryFile(projectsRoot: string, scopeKey: string, name: string): string {
  // isMemoryName already forbids separators, dots, and traversal, so a simple
  // join cannot escape the scope dir. We avoid path.resolve here so the result
  // is independent of process.cwd() (keeps tests deterministic across OSes).
  if (!isMemoryName(name)) throw new Error(`invalid memory name: ${name}`);
  return path.join(memoryDirFor(projectsRoot, scopeKey), `${name}.md`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/memory-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/memory-store.ts tests/unit/server/memory-store.test.ts
git commit -m "feat(memory): index parsing + name/path safety"
```

---

## Task 3: Read the whole store

**Files:**
- Modify: `server/memory-store.ts`
- Test: `tests/unit/server/memory-store.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { readMemoryStore } from '../../../server/memory-store';
import { promises as fs } from 'node:fs';
import os from 'node:os';

async function makeStore(): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mem-'));
  const projects = path.join(tmp, 'projects');
  const projMem = path.join(projects, 'C--demo', 'memory');
  const globalMem = path.join(tmp, 'memory');
  await fs.mkdir(projMem, { recursive: true });
  await fs.mkdir(globalMem, { recursive: true });
  await fs.writeFile(path.join(projMem, 'alpha.md'),
    `---\nname: alpha\ndescription: "A"\nmetadata:\n  type: project\n---\n\nLinks to [[beta]].\n`);
  await fs.writeFile(path.join(projMem, 'beta.md'),
    `---\nname: beta\ndescription: "B"\nmetadata:\n  type: feedback\n---\n\nNo links.\n`);
  await fs.writeFile(path.join(projMem, 'MEMORY.md'), `- [Alpha](alpha.md) — a hook\n`);
  await fs.writeFile(path.join(globalMem, 'g1.md'),
    `---\nname: g1\ndescription: "G"\nmetadata:\n  type: user\n---\n\nGlobal.\n`);
  return projects;
}

describe('readMemoryStore', () => {
  it('reads global + project memories with scope, links, and index flags', async () => {
    const projects = await makeStore();
    const out = await readMemoryStore(projects);
    const names = out.memories.map((m) => m.name).sort();
    expect(names).toEqual(['alpha', 'beta', 'g1']);

    const alpha = out.memories.find((m) => m.name === 'alpha')!;
    expect(alpha.scopeKey).toBe('C--demo');
    expect(alpha.scope.kind).toBe('project');
    expect(alpha.links).toEqual(['beta']);
    expect(alpha.inIndex).toBe(true);

    const beta = out.memories.find((m) => m.name === 'beta')!;
    expect(beta.inIndex).toBe(false);

    const g1 = out.memories.find((m) => m.name === 'g1')!;
    expect(g1.scopeKey).toBe('global');
    expect(g1.type).toBe('user');
  });

  it('returns empty when the root does not exist', async () => {
    const out = await readMemoryStore(path.join(os.tmpdir(), 'nope-xyz'));
    expect(out).toEqual({ memories: [], indexes: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/memory-store.test.ts`
Expected: FAIL — `readMemoryStore` not exported.

- [ ] **Step 3: Write minimal implementation (append)**

```ts
import { promises as fs } from 'node:fs';

export type MemoryScope =
  | { kind: 'global' }
  | { kind: 'project'; projectId: string; cwd: string };

export type MemoryRecord = {
  scopeKey: string;
  scope: MemoryScope;
  name: string;
  description: string;
  type: MemoryType | null;
  originSessionId: string | null;
  links: string[];
  body: string;
  mtimeMs: number;
  inIndex: boolean;
  parseError?: string;
};

export type MemoryResponse = {
  memories: MemoryRecord[];
  indexes: { scopeKey: string; entries: MemoryIndexEntry[] }[];
};

// Mirrors decodeProjectId in vite-plugin-sessions.ts.
function decodeProjectId(id: string): string {
  if (/^[A-Za-z]--/.test(id)) {
    const driveLetter = id[0];
    const rest = id.slice(3).replace(/-/g, '/');
    return `${driveLetter}:/${rest}`;
  }
  return id.replace(/-/g, '/');
}

async function listSafe(p: string): Promise<string[]> {
  try { return await fs.readdir(p); } catch { return []; }
}

async function readScope(
  projectsRoot: string, scopeKey: string, scope: MemoryScope,
  out: MemoryRecord[], indexes: MemoryResponse['indexes'],
): Promise<void> {
  const dir = memoryDirFor(projectsRoot, scopeKey);
  const files = await listSafe(dir);
  if (files.length === 0) return;

  let indexEntries: MemoryIndexEntry[] = [];
  if (files.includes('MEMORY.md')) {
    const raw = await fs.readFile(path.join(dir, 'MEMORY.md'), 'utf8').catch(() => '');
    indexEntries = parseIndex(raw);
  }
  const indexNames = new Set(indexEntries.map((e) => e.name));

  for (const f of files) {
    if (!f.endsWith('.md') || f === 'MEMORY.md') continue;
    const full = path.join(dir, f);
    let stat;
    try { stat = await fs.stat(full); } catch { continue; }
    if (!stat.isFile()) continue;
    const raw = await fs.readFile(full, 'utf8').catch(() => '');
    const parsed = parseMemoryFile(raw);
    const name = parsed.frontmatter.name ?? f.replace(/\.md$/, '');
    out.push({
      scopeKey, scope, name,
      description: parsed.frontmatter.description ?? '',
      type: parsed.frontmatter.type ?? null,
      originSessionId: parsed.frontmatter.originSessionId ?? null,
      links: parsed.links,
      body: parsed.body,
      mtimeMs: stat.mtimeMs,
      inIndex: indexNames.has(name),
      parseError: parsed.parseError,
    });
  }

  const fileNames = new Set(
    files.filter((f) => f.endsWith('.md') && f !== 'MEMORY.md').map((f) => f.replace(/\.md$/, ''))
  );
  indexes.push({
    scopeKey,
    entries: indexEntries.map((e) => ({ ...e, filePresent: fileNames.has(e.name) })),
  });
}

export async function readMemoryStore(projectsRoot: string): Promise<MemoryResponse> {
  const memories: MemoryRecord[] = [];
  const indexes: MemoryResponse['indexes'] = [];
  await readScope(projectsRoot, 'global', { kind: 'global' }, memories, indexes);
  for (const projectId of await listSafe(projectsRoot)) {
    const stat = await fs.stat(path.join(projectsRoot, projectId)).catch(() => null);
    if (!stat?.isDirectory()) continue;
    await readScope(
      projectsRoot, projectId,
      { kind: 'project', projectId, cwd: decodeProjectId(projectId) },
      memories, indexes,
    );
  }
  memories.sort((a, b) => a.name.localeCompare(b.name));
  return { memories, indexes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/memory-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/memory-store.ts tests/unit/server/memory-store.test.ts
git commit -m "feat(memory): read the full store (global + projects)"
```

---

## Task 4: Write operations (create / update / delete) with backup + index sync

**Files:**
- Modify: `server/memory-store.ts`
- Test: `tests/unit/server/memory-store.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { createMemory, updateMemory, deleteMemory } from '../../../server/memory-store';

describe('write operations', () => {
  it('creates a file, syncs the index, and rejects duplicates', async () => {
    const projects = await makeStore();
    const rec = await createMemory(projects, 'C--demo', {
      name: 'gamma', description: 'Gamma desc.', type: 'reference', body: 'Body [[alpha]]',
    });
    expect(rec.name).toBe('gamma');
    const dir = memoryDirFor(projects, 'C--demo');
    const written = await fs.readFile(path.join(dir, 'gamma.md'), 'utf8');
    expect(parseMemoryFile(written).frontmatter.type).toBe('reference');
    const index = await fs.readFile(path.join(dir, 'MEMORY.md'), 'utf8');
    expect(index).toContain('gamma.md');
    await expect(createMemory(projects, 'C--demo', {
      name: 'gamma', description: 'x', type: 'project', body: 'y',
    })).rejects.toThrow(/exists/);
  });

  it('updates body + type, preserves originSessionId, and backs up the prior file', async () => {
    const projects = await makeStore();
    const dir = memoryDirFor(projects, 'C--demo');
    await fs.writeFile(path.join(dir, 'alpha.md'),
      `---\nname: alpha\ndescription: "A"\nmetadata:\n  type: project\n  originSessionId: keep-me\n---\n\nold\n`);
    const rec = await updateMemory(projects, 'C--demo', 'alpha', { description: 'A2', type: 'feedback', body: 'new body' });
    expect(rec.type).toBe('feedback');
    expect(rec.originSessionId).toBe('keep-me');
    const written = await fs.readFile(path.join(dir, 'alpha.md'), 'utf8');
    expect(written).toContain('new body');
    const backups = await fs.readdir(path.join(dir, '.backups'));
    expect(backups.some((b) => b.startsWith('alpha.'))).toBe(true);
  });

  it('delete removes the file + index line and reports broken backlinks', async () => {
    const projects = await makeStore();
    const res = await deleteMemory(projects, 'C--demo', 'beta');
    const dir = memoryDirFor(projects, 'C--demo');
    await expect(fs.stat(path.join(dir, 'beta.md'))).rejects.toThrow();
    expect(res.brokenBacklinks).toContain('alpha'); // alpha links to beta
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/server/memory-store.test.ts`
Expected: FAIL — write fns not exported.

- [ ] **Step 3: Write minimal implementation (append)**

```ts
async function backupFile(filePath: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    const dir = path.join(path.dirname(filePath), '.backups');
    await fs.mkdir(dir, { recursive: true });
    const base = path.basename(filePath, '.md');
    await fs.copyFile(filePath, path.join(dir, `${base}.${Math.round(stat.mtimeMs)}.md`));
  } catch { /* nothing to back up */ }
}

async function readRecord(projectsRoot: string, scopeKey: string, name: string): Promise<MemoryRecord> {
  const file = resolveMemoryFile(projectsRoot, scopeKey, name);
  const stat = await fs.stat(file);
  const parsed = parseMemoryFile(await fs.readFile(file, 'utf8'));
  const scope: MemoryScope = scopeKey === 'global'
    ? { kind: 'global' }
    : { kind: 'project', projectId: scopeKey, cwd: decodeProjectId(scopeKey) };
  const indexRaw = await fs.readFile(path.join(memoryDirFor(projectsRoot, scopeKey), 'MEMORY.md'), 'utf8').catch(() => '');
  const inIndex = parseIndex(indexRaw).some((e) => e.name === name);
  return {
    scopeKey, scope, name,
    description: parsed.frontmatter.description ?? '',
    type: parsed.frontmatter.type ?? null,
    originSessionId: parsed.frontmatter.originSessionId ?? null,
    links: parsed.links, body: parsed.body, mtimeMs: stat.mtimeMs, inIndex,
    parseError: parsed.parseError,
  };
}

async function writeIndex(projectsRoot: string, scopeKey: string, mutate: (raw: string) => string): Promise<void> {
  const indexPath = path.join(memoryDirFor(projectsRoot, scopeKey), 'MEMORY.md');
  const raw = await fs.readFile(indexPath, 'utf8').catch(() => '');
  await backupFile(indexPath);
  await fs.writeFile(indexPath, mutate(raw), 'utf8');
}

export async function createMemory(
  projectsRoot: string, scopeKey: string,
  input: { name: string; description: string; type: MemoryType; body: string },
): Promise<MemoryRecord> {
  const file = resolveMemoryFile(projectsRoot, scopeKey, input.name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  try { await fs.access(file); throw new Error(`memory exists: ${input.name}`); }
  catch (e) { if ((e as Error).message.startsWith('memory exists')) throw e; }
  await fs.writeFile(file, serializeMemory({ ...input }), 'utf8');
  const e = deriveIndexEntry(input.name, input.description);
  await writeIndex(projectsRoot, scopeKey, (raw) => upsertIndexLine(raw, e.name, e.title, e.hook));
  return readRecord(projectsRoot, scopeKey, input.name);
}

export async function updateMemory(
  projectsRoot: string, scopeKey: string, name: string,
  patch: { description: string; type: MemoryType; body: string },
): Promise<MemoryRecord> {
  const file = resolveMemoryFile(projectsRoot, scopeKey, name);
  const prior = parseMemoryFile(await fs.readFile(file, 'utf8'));
  await backupFile(file);
  await fs.writeFile(file, serializeMemory({
    name, description: patch.description, type: patch.type,
    originSessionId: prior.frontmatter.originSessionId ?? null, body: patch.body,
  }), 'utf8');
  const e = deriveIndexEntry(name, patch.description);
  await writeIndex(projectsRoot, scopeKey, (raw) => upsertIndexLine(raw, e.name, e.title, e.hook));
  return readRecord(projectsRoot, scopeKey, name);
}

export async function deleteMemory(
  projectsRoot: string, scopeKey: string, name: string,
): Promise<{ brokenBacklinks: string[] }> {
  const file = resolveMemoryFile(projectsRoot, scopeKey, name);
  const store = await readMemoryStore(projectsRoot);
  const brokenBacklinks = store.memories
    .filter((m) => m.name !== name && m.links.includes(name))
    .map((m) => m.name);
  await backupFile(file);
  await fs.rm(file);
  await writeIndex(projectsRoot, scopeKey, (raw) => removeIndexLine(raw, name));
  return { brokenBacklinks };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/server/memory-store.test.ts`
Expected: PASS (all memory-store tests).

- [ ] **Step 5: Commit**

```bash
git add server/memory-store.ts tests/unit/server/memory-store.test.ts
git commit -m "feat(memory): create/update/delete with backup + index sync"
```

---

## Task 5: HTTP endpoints in the Vite plugin

**Files:**
- Modify: `server/vite-plugin-sessions.ts`

> No automated test here — the plugin layer is verified by e2e (Task 15-16), mirroring how `/api/token-usage` is wired (the logic lives in tested functions). This task is wiring + a manual smoke check.

- [ ] **Step 1: Add the import (top of `server/vite-plugin-sessions.ts`, near the existing import of `aggregate-token-usage`)**

```ts
import {
  readMemoryStore, createMemory, updateMemory, deleteMemory,
  isMemoryName, type MemoryType,
} from './memory-store';
```

- [ ] **Step 2: Add a body-reading helper (place it next to `sendJson`)**

```ts
function readBody(req: Parameters<Connect.NextHandleFunction>[0]): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const MEMORY_TYPES = ['user', 'feedback', 'project', 'reference'];
function isMemoryType(v: unknown): v is MemoryType {
  return typeof v === 'string' && MEMORY_TYPES.includes(v);
}
```

- [ ] **Step 3: Register the middleware (inside `configureServer(server)`, after the `/api/token-usage` block)**

```ts
server.middlewares.use('/api/memory', async (req, res, next) => {
  try {
    const url = (req.url ?? '/').split('?')[0];
    const method = req.method ?? 'GET';

    if (method === 'GET' && (url === '/' || url === '')) {
      sendJson(res, 200, await readMemoryStore(root));
      return;
    }

    // POST /:scopeKey  (create)
    const createMatch = url.match(/^\/([^/]+)$/);
    if (method === 'POST' && createMatch) {
      const scopeKey = decodeURIComponent(createMatch[1]);
      if (!isSafeId(scopeKey)) { sendJson(res, 400, { error: 'invalid scope' }); return; }
      const b = JSON.parse(await readBody(req)) as { name?: string; description?: string; type?: unknown; body?: string };
      if (!b.name || !isMemoryName(b.name)) { sendJson(res, 400, { error: 'invalid name' }); return; }
      if (!isMemoryType(b.type)) { sendJson(res, 400, { error: 'invalid type' }); return; }
      try {
        const rec = await createMemory(root, scopeKey, {
          name: b.name, description: b.description ?? '', type: b.type, body: b.body ?? '',
        });
        sendJson(res, 201, rec);
      } catch (e) {
        if ((e as Error).message.startsWith('memory exists')) { sendJson(res, 409, { error: 'exists' }); return; }
        throw e;
      }
      return;
    }

    // PUT / DELETE /:scopeKey/:name
    const itemMatch = url.match(/^\/([^/]+)\/([^/]+)$/);
    if (itemMatch) {
      const scopeKey = decodeURIComponent(itemMatch[1]);
      const name = decodeURIComponent(itemMatch[2]);
      if (!isSafeId(scopeKey) || !isMemoryName(name)) { sendJson(res, 400, { error: 'invalid id' }); return; }

      if (method === 'PUT') {
        const b = JSON.parse(await readBody(req)) as { description?: string; type?: unknown; body?: string };
        if (!isMemoryType(b.type)) { sendJson(res, 400, { error: 'invalid type' }); return; }
        const rec = await updateMemory(root, scopeKey, name, {
          description: b.description ?? '', type: b.type, body: b.body ?? '',
        });
        sendJson(res, 200, rec);
        return;
      }
      if (method === 'DELETE') {
        sendJson(res, 200, await deleteMemory(root, scopeKey, name));
        return;
      }
    }

    sendJson(res, 405, { error: 'method not allowed' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') { sendJson(res, 404, { error: 'not found' }); return; }
    next(err as Error);
  }
});
```

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev` then in a second shell:
`curl http://localhost:5173/api/memory`
Expected: JSON `{ "memories": [...], "indexes": [...] }` listing your real memories. Stop the dev server after.

- [ ] **Step 5: Commit**

```bash
git add server/vite-plugin-sessions.ts
git commit -m "feat(memory): /api/memory GET/POST/PUT/DELETE endpoints"
```

---

## Task 6: Frontend data layer (client + hooks)

**Files:**
- Modify: `src/api/client.ts`
- Modify: `src/api/hooks.ts`

> Covered by component/e2e tests downstream; no dedicated unit test for the fetch wrappers.

- [ ] **Step 1: Add to `src/api/client.ts`**

```ts
import type { MemoryResponse, MemoryRecord, MemoryType } from '../../server/memory-store';
export type { MemoryResponse, MemoryRecord, MemoryType, MemoryScope, MemoryIndexEntry } from '../../server/memory-store';

export async function fetchMemory(): Promise<MemoryResponse> {
  const res = await fetch('/api/memory');
  if (!res.ok) throw new Error(`memory fetch failed: ${res.status}`);
  return (await res.json()) as MemoryResponse;
}

export async function createMemory(
  scopeKey: string, input: { name: string; description: string; type: MemoryType; body: string }
): Promise<MemoryRecord> {
  const res = await fetch(`/api/memory/${encodeURIComponent(scopeKey)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  });
  if (res.status === 409) throw new Error('A memory with that name already exists');
  if (!res.ok) throw new Error(`create failed: ${res.status}`);
  return (await res.json()) as MemoryRecord;
}

export async function updateMemory(
  scopeKey: string, name: string, patch: { description: string; type: MemoryType; body: string }
): Promise<MemoryRecord> {
  const res = await fetch(`/api/memory/${encodeURIComponent(scopeKey)}/${encodeURIComponent(name)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`update failed: ${res.status}`);
  return (await res.json()) as MemoryRecord;
}

export async function deleteMemory(scopeKey: string, name: string): Promise<{ brokenBacklinks: string[] }> {
  const res = await fetch(`/api/memory/${encodeURIComponent(scopeKey)}/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete failed: ${res.status}`);
  return (await res.json()) as { brokenBacklinks: string[] };
}
```

- [ ] **Step 2: Add to `src/api/hooks.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchMemory, createMemory, updateMemory, deleteMemory,
} from './client';
import type { MemoryResponse, MemoryType } from './client';

export function useMemoryList() {
  return useQuery<MemoryResponse>({ queryKey: ['memory'], queryFn: fetchMemory });
}

export function useCreateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scopeKey: string; name: string; description: string; type: MemoryType; body: string }) =>
      createMemory(v.scopeKey, { name: v.name, description: v.description, type: v.type, body: v.body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory'] }),
  });
}

export function useUpdateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scopeKey: string; name: string; description: string; type: MemoryType; body: string }) =>
      updateMemory(v.scopeKey, v.name, { description: v.description, type: v.type, body: v.body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory'] }),
  });
}

export function useDeleteMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scopeKey: string; name: string }) => deleteMemory(v.scopeKey, v.name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory'] }),
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/api/client.ts src/api/hooks.ts
git commit -m "feat(memory): client fetchers + query/mutation hooks"
```

---

## Task 7: Insights derivation

**Files:**
- Create: `src/memory/insights.ts`
- Test: `tests/unit/memory/insights.test.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/memory/insights.test.ts
import { describe, it, expect } from 'vitest';
import { deriveInsights, STALE_DAYS } from '../../../src/memory/insights';
import type { MemoryRecord } from '../../../src/api/client';

function rec(p: Partial<MemoryRecord> & { name: string }): MemoryRecord {
  return {
    scopeKey: 'C--demo', scope: { kind: 'project', projectId: 'C--demo', cwd: 'C:/demo' },
    name: p.name, description: p.description ?? '', type: p.type ?? 'project',
    originSessionId: p.originSessionId ?? null, links: p.links ?? [], body: p.body ?? '',
    mtimeMs: p.mtimeMs ?? Date.now(), inIndex: p.inIndex ?? true, parseError: p.parseError,
  };
}

describe('deriveInsights', () => {
  const now = Date.parse('2026-05-29T00:00:00Z');
  it('computes backlinks, orphans, broken links, composition, staleness', () => {
    const memories = [
      rec({ name: 'a', links: ['b', 'ghost'], type: 'feedback' }),
      rec({ name: 'b', links: [], type: 'project' }),
      rec({ name: 'lonely', links: [], type: 'reference', inIndex: false,
        mtimeMs: now - (STALE_DAYS + 5) * 86400_000 }),
    ];
    const ins = deriveInsights(memories, now);
    expect(ins.backlinks.get('b')).toEqual(['a']);
    expect(ins.orphans.map((m) => m.name)).toContain('lonely');
    expect(ins.orphans.map((m) => m.name)).not.toContain('a');
    expect(ins.brokenLinks).toEqual([{ from: 'a', to: 'ghost' }]);
    expect(ins.composition.byType.feedback).toBe(1);
    expect(ins.stale.map((m) => m.name)).toEqual(['lonely']);
    expect(ins.missingFromIndex.map((m) => m.name)).toEqual(['lonely']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/memory/insights.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/memory/insights.ts
import type { MemoryRecord, MemoryType } from '../api/client';

export const STALE_DAYS = 14;

export type Insights = {
  backlinks: Map<string, string[]>;
  orphans: MemoryRecord[];
  brokenLinks: { from: string; to: string }[];
  missingFromIndex: MemoryRecord[];
  parseErrors: MemoryRecord[];
  stale: MemoryRecord[];
  composition: { byType: Record<MemoryType, number>; byScope: Record<string, number>; total: number };
  provenance: { bySession: { sessionId: string; count: number }[] };
};

export function deriveInsights(memories: MemoryRecord[], now: number): Insights {
  const names = new Set(memories.map((m) => m.name));
  const backlinks = new Map<string, string[]>();
  const brokenLinks: { from: string; to: string }[] = [];

  for (const m of memories) {
    for (const target of m.links) {
      if (names.has(target)) {
        backlinks.set(target, [...(backlinks.get(target) ?? []), m.name]);
      } else {
        brokenLinks.push({ from: m.name, to: target });
      }
    }
  }

  const orphans = memories.filter((m) => m.links.length === 0 && (backlinks.get(m.name)?.length ?? 0) === 0);
  const missingFromIndex = memories.filter((m) => !m.inIndex);
  const parseErrors = memories.filter((m) => m.parseError);
  const staleCutoff = now - STALE_DAYS * 86400_000;
  const stale = memories.filter((m) => m.mtimeMs < staleCutoff).sort((a, b) => a.mtimeMs - b.mtimeMs);

  const byType: Record<MemoryType, number> = { user: 0, feedback: 0, project: 0, reference: 0 };
  const byScope: Record<string, number> = {};
  for (const m of memories) {
    if (m.type) byType[m.type] += 1;
    byScope[m.scopeKey] = (byScope[m.scopeKey] ?? 0) + 1;
  }

  const sessionCounts = new Map<string, number>();
  for (const m of memories) {
    if (m.originSessionId) sessionCounts.set(m.originSessionId, (sessionCounts.get(m.originSessionId) ?? 0) + 1);
  }
  const bySession = [...sessionCounts.entries()]
    .map(([sessionId, count]) => ({ sessionId, count }))
    .sort((a, b) => b.count - a.count);

  return {
    backlinks, orphans, brokenLinks, missingFromIndex, parseErrors, stale,
    composition: { byType, byScope, total: memories.length },
    provenance: { bySession },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/memory/insights.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memory/insights.ts tests/unit/memory/insights.test.ts
git commit -m "feat(memory): insights derivation (orphans, broken links, staleness, composition)"
```

---

## Task 8: Body renderer (bold + clickable links)

**Files:**
- Create: `src/memory/renderBody.tsx`
- Test: `tests/unit/memory/renderBody.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/memory/renderBody.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderBody } from '../../../src/memory/renderBody';

describe('renderBody', () => {
  it('renders bold spans and clickable links', () => {
    const onLink = vi.fn();
    render(<div>{renderBody('Hello **world** see [[target-name]]', new Set(['target-name']), onLink)}</div>);
    expect(screen.getByText('world').tagName).toBe('STRONG');
    fireEvent.click(screen.getByTestId('body-link-target-name'));
    expect(onLink).toHaveBeenCalledWith('target-name');
  });

  it('marks links to unknown memories as broken', () => {
    render(<div>{renderBody('see [[ghost]]', new Set<string>(), () => {})}</div>);
    expect(screen.getByTestId('body-link-ghost').getAttribute('data-broken')).toBe('true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/memory/renderBody.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/memory/renderBody.tsx
import { Fragment, type ReactNode } from 'react';

const TOKEN_RE = /(\*\*[^*]+\*\*|\[\[[a-z0-9][a-z0-9-]*\]\])/g;

export function renderBody(body: string, known: Set<string>, onLink: (name: string) => void): ReactNode {
  return body.split('\n').map((line, li) => (
    <Fragment key={li}>
      {li > 0 && <br />}
      {line.split(TOKEN_RE).map((tok, ti) => {
        if (tok.startsWith('**') && tok.endsWith('**')) {
          return <strong key={ti} style={{ color: 'var(--text)' }}>{tok.slice(2, -2)}</strong>;
        }
        if (tok.startsWith('[[') && tok.endsWith(']]')) {
          const name = tok.slice(2, -2);
          const broken = !known.has(name);
          return (
            <span
              key={ti}
              data-testid={`body-link-${name}`}
              data-broken={broken ? 'true' : 'false'}
              onClick={() => onLink(name)}
              style={{
                color: broken ? 'var(--node-failed)' : 'var(--edge-trail)',
                borderBottom: `1px dashed ${broken ? 'var(--node-failed)' : 'var(--edge-trail)'}`,
                cursor: 'pointer',
              }}
            >{name}</span>
          );
        }
        return <Fragment key={ti}>{tok}</Fragment>;
      })}
    </Fragment>
  ));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/memory/renderBody.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memory/renderBody.tsx tests/unit/memory/renderBody.test.tsx
git commit -m "feat(memory): minimal body renderer (bold + clickable links)"
```

---

## Task 9: Sidebar — extend modes, add `MemoryList`

**Files:**
- Create: `src/components/library/MemoryList.tsx`
- Modify: `src/components/library/LibraryPanel.tsx`
- Test: extend `tests/unit/App-mode-routing.test.tsx`

- [ ] **Step 1: Write the failing test (append cases to `tests/unit/App-mode-routing.test.tsx`)**

First, extend the existing `vi.mock('../../src/api/hooks', …)` block to add a memory list mock alongside the others:

```tsx
    useMemoryList: () => ({
      data: {
        memories: [
          { scopeKey: 'C--demo', scope: { kind: 'project', projectId: 'C--demo', cwd: 'C:/demo' },
            name: 'alpha', description: 'A', type: 'feedback', originSessionId: null,
            links: [], body: 'body', mtimeMs: 0, inIndex: true },
        ],
        indexes: [],
      },
      isLoading: false, error: null,
    }),
    useCreateMemory: () => ({ mutateAsync: async () => {}, isPending: false }),
    useUpdateMemory: () => ({ mutateAsync: async () => {}, isPending: false }),
    useDeleteMemory: () => ({ mutateAsync: async () => ({ brokenBacklinks: [] }), isPending: false }),
```

Then add:

```tsx
  it('renders the MemoryPage and sidebar list when mode is "memory"', () => {
    localStorage.setItem('tg.library.mode', 'memory');
    renderApp();
    expect(screen.getByTestId('memory-page')).toBeDefined();
    expect(screen.getByTestId('memory-item-C--demo-alpha')).toBeDefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/App-mode-routing.test.tsx`
Expected: FAIL — `memory` not assignable / `memory-page` testid missing. (MemoryPage arrives in Task 10; this task makes the sidebar + types compile and the list render.)

- [ ] **Step 3: Implement `MemoryList` and wire the panel**

Create `src/components/library/MemoryList.tsx`:

```tsx
import { useMemo } from 'react';
import { useMemoryList } from '../../api/hooks';
import type { MemoryRecord } from '../../api/client';

const TYPE_COLOR: Record<string, string> = {
  feedback: '#ff9d00', project: '#00e5ff', reference: '#b06cff', user: '#4dffa6',
};

type Props = {
  query: string;
  selectedKey: string | null; // `${scopeKey}/${name}`
  onSelect: (scopeKey: string, name: string) => void;
};

export function MemoryList({ query, selectedKey, onSelect }: Props) {
  const { data, isLoading, error } = useMemoryList();

  const groups = useMemo(() => {
    const memories = (data?.memories ?? []).filter((m) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
    });
    const map = new Map<string, { label: string; items: MemoryRecord[] }>();
    for (const m of memories) {
      const label = m.scope.kind === 'global' ? 'GLOBAL'
        : m.scope.cwd.replace(/\\/g, '/').split('/').filter(Boolean).slice(-1)[0].toUpperCase();
      if (!map.has(m.scopeKey)) map.set(m.scopeKey, { label, items: [] });
      map.get(m.scopeKey)!.items.push(m);
    }
    return [...map.entries()].map(([scopeKey, g]) => ({ scopeKey, ...g }));
  }, [data, query]);

  if (isLoading) return <div style={styles.muted}>scanning…</div>;
  if (error) return <div style={styles.error}>error: {(error as Error).message}</div>;
  if (groups.length === 0) return <div style={styles.muted}>(no memories)</div>;

  return (
    <div data-testid="memory-list">
      {groups.map((g) => (
        <div key={g.scopeKey} style={styles.group}>
          <div style={styles.groupHeader}>{g.label} <span style={styles.count}>({g.items.length})</span></div>
          {g.items.map((m) => {
            const key = `${m.scopeKey}/${m.name}`;
            return (
              <div
                key={key}
                data-testid={`memory-item-${m.scopeKey}-${m.name}`}
                onClick={() => onSelect(m.scopeKey, m.name)}
                style={{ ...styles.item, ...(selectedKey === key ? styles.itemSel : null) }}
              >
                <span style={{ ...styles.badge, color: TYPE_COLOR[m.type ?? ''] ?? 'var(--text-dim)',
                  borderColor: TYPE_COLOR[m.type ?? ''] ?? 'var(--edge-idle)' }}>{m.type ?? '?'}</span>
                <span style={styles.name}>{m.name}</span>
                {m.parseError && <span style={styles.warn} title={m.parseError}>⚠</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const styles = {
  group: { marginBottom: 8 },
  groupHeader: { padding: '6px 12px 2px', fontSize: 10, letterSpacing: 2, color: 'var(--edge-trail)', fontFamily: 'ui-monospace, monospace' },
  count: { color: 'var(--text-dim)' },
  item: { display: 'flex' as const, alignItems: 'center' as const, gap: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11 },
  itemSel: { background: 'rgba(255,157,0,0.08)', borderLeft: '2px solid #ff9d00' },
  badge: { fontSize: 8, padding: '1px 5px', borderRadius: 8, border: '1px solid', textTransform: 'uppercase' as const },
  name: { color: 'var(--text)', fontFamily: 'ui-monospace, monospace', overflow: 'hidden' as const, textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  warn: { color: 'var(--node-failed)', marginLeft: 'auto' as const },
  muted: { padding: '0 12px', color: 'var(--text-dim)', fontSize: 12 },
  error: { padding: '0 12px', color: 'var(--node-failed)', fontSize: 12 },
};
```

In `src/components/library/LibraryPanel.tsx`:

1. Change the mode type:
```ts
export type LibraryMode = 'sessions' | 'prompts' | 'usage' | 'memory';
```
2. Extend `Selection`:
```ts
export type Selection =
  | { kind: 'session'; projectId: string; sessionId: string }
  | { kind: 'prompt'; projectId: string; sessionId: string; promptId: string }
  | { kind: 'memory'; scopeKey: string; name: string };
```
3. Import the list at the top: `import { MemoryList } from './MemoryList';`
4. Add the dropdown option after the `usage` option:
```tsx
<option value="memory">MEMORY</option>
```
5. The filter input currently shows when `mode !== 'usage'`. Memory also wants a filter, so that stays correct (memory ≠ usage). The loading/error/empty block guarded by `mode !== 'usage'` reads session/prompt query state — narrow it to the list modes:
```tsx
{(mode === 'sessions' || mode === 'prompts') && (
  <>
    {isLoading && <div style={styles.muted}>scanning…</div>}
    {error && <div style={styles.error}>error: {(error as Error).message}</div>}
    {hasData && groups.length === 0 && <div style={styles.muted}>(none)</div>}
  </>
)}
```
6. In the scroll body, render `MemoryList` for memory mode. Replace the `mode === 'usage' ? (…) : (groups.map(…))` ternary with:
```tsx
{mode === 'usage' ? (
  <UsageCardsList rows={usageRows} projectId={usageProjectId} cutoffDay={usageCutoffDay} selected={usageFamily} onSelect={onUsageFamilyChange} />
) : mode === 'memory' ? (
  <MemoryList
    query={query}
    selectedKey={selected?.kind === 'memory' ? `${selected.scopeKey}/${selected.name}` : null}
    onSelect={(scopeKey, name) => onSelect({ kind: 'memory', scopeKey, name })}
  />
) : (
  groups.map((g) => { /* unchanged */ })
)}
```

- [ ] **Step 4: Run test to verify the sidebar part passes**

Run: `npx vitest run tests/unit/App-mode-routing.test.tsx -t "MemoryPage and sidebar"`
Expected: still FAILS on `memory-page` (MemoryPage not built yet) but no longer fails to compile. If it errors on `memory-page`, that is expected — proceed to Task 10. (To confirm the list renders now, temporarily assert only `memory-item-C--demo-alpha`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/library/MemoryList.tsx src/components/library/LibraryPanel.tsx tests/unit/App-mode-routing.test.tsx
git commit -m "feat(memory): sidebar MemoryList + library mode wiring"
```

---

## Task 10: `MemoryPage` shell + App routing

**Files:**
- Create: `src/memory/MemoryPage.tsx`
- Modify: `src/App.tsx`
- Test: `tests/unit/App-mode-routing.test.tsx` (the case from Task 9 now fully passes)

- [ ] **Step 1: Create `src/memory/MemoryPage.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { useMemoryList } from '../api/hooks';
import type { Selection } from '../components/library/LibraryPanel';
import { MemoryDetail } from './MemoryDetail';
import { MemoryStats } from './MemoryStats';
import { MemoryGraph } from './MemoryGraph';
import { deriveInsights } from './insights';

type View = 'detail' | 'graph' | 'stats';

type Props = {
  selected: Selection | null;
  onSelectMemory: (scopeKey: string, name: string) => void;
  onJumpToSession: (sessionId: string) => void;
};

export function MemoryPage({ selected, onSelectMemory, onJumpToSession }: Props) {
  const { data, isLoading, error } = useMemoryList();
  const [view, setView] = useState<View>('detail');

  const memories = data?.memories ?? [];
  const selectedMemory = selected?.kind === 'memory'
    ? memories.find((m) => m.scopeKey === selected.scopeKey && m.name === selected.name) ?? null
    : null;
  const insights = useMemo(() => deriveInsights(memories, Date.now()), [memories]);

  return (
    <div style={styles.page} data-testid="memory-page">
      <div style={styles.chrome}>
        <div style={styles.title}>MEMORY</div>
        <div style={styles.tabs}>
          {(['detail', 'graph', 'stats'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              data-testid={`memory-view-${v}`}
              onClick={() => setView(v)}
              style={{ ...styles.tab, ...(view === v ? styles.tabOn : null) }}
              aria-pressed={view === v}
            >{v.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {isLoading && <div style={styles.muted}>LOADING…</div>}
      {error && <div style={styles.error}>FAILED TO LOAD MEMORIES: {(error as Error).message}</div>}

      {!isLoading && !error && (
        <div style={styles.body}>
          {view === 'detail' && (
            selectedMemory
              ? <MemoryDetail
                  memory={selectedMemory}
                  knownNames={new Set(memories.map((m) => m.name))}
                  backlinks={insights.backlinks.get(selectedMemory.name) ?? []}
                  onNavigate={(name) => {
                    const target = memories.find((m) => m.name === name);
                    if (target) onSelectMemory(target.scopeKey, target.name);
                  }}
                  onJumpToSession={onJumpToSession}
                />
              : <div style={styles.muted}>SELECT A MEMORY</div>
          )}
          {view === 'graph' && (
            <MemoryGraph
              memories={memories}
              selectedName={selectedMemory?.name ?? null}
              onSelect={(name) => {
                const target = memories.find((m) => m.name === name);
                if (target) onSelectMemory(target.scopeKey, target.name);
              }}
            />
          )}
          {view === 'stats' && <MemoryStats insights={insights} />}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { flex: 1, minHeight: 0, display: 'flex' as const, flexDirection: 'column' as const, gap: 8, padding: '12px 16px', overflow: 'hidden' as const },
  chrome: { display: 'flex' as const, alignItems: 'center' as const, gap: 12, flexShrink: 0 },
  title: { fontSize: 11, letterSpacing: 3, color: 'var(--edge-trail)', fontFamily: 'ui-monospace, monospace' },
  tabs: { display: 'flex' as const, gap: 6, marginLeft: 'auto' as const },
  tab: { background: 'rgba(5,8,13,0.85)', border: '1px solid rgba(110,224,238,0.6)', color: 'var(--text)', fontSize: 10, letterSpacing: 2, padding: '4px 12px', fontFamily: 'ui-monospace, monospace', cursor: 'pointer' as const },
  tabOn: { background: 'rgba(0,229,255,0.10)', color: 'var(--edge-trail)', borderColor: 'var(--edge-trail)' },
  body: { flex: 1, minHeight: 0, overflow: 'auto' as const, border: '1px solid rgba(0,229,255,0.55)', background: 'rgba(5,8,13,0.6)' },
  muted: { padding: 24, color: 'var(--text-dim)', letterSpacing: 4, fontFamily: 'ui-monospace, monospace' },
  error: { padding: 24, color: 'var(--node-failed)', fontFamily: 'ui-monospace, monospace' },
};
```

> This imports `MemoryDetail`, `MemoryStats`, `MemoryGraph` (Tasks 11-13). To make this task pass on its own, create one-line stubs first, then flesh them out in their tasks:
> - `src/memory/MemoryDetail.tsx`: `export function MemoryDetail(_: any) { return <div data-testid="memory-detail" />; }`
> - `src/memory/MemoryStats.tsx`: `export function MemoryStats(_: any) { return <div data-testid="memory-stats" />; }`
> - `src/memory/MemoryGraph.tsx`: `export function MemoryGraph(_: any) { return <div data-testid="memory-graph" />; }`

- [ ] **Step 2: Wire `src/App.tsx`**

1. Import the page near the `TokensPage` import:
```tsx
import { MemoryPage } from './memory/MemoryPage';
```
2. The `useSession` machinery must not run for memory selections. Derive guarded ids — find this line:
```tsx
  const { data: rawSession, isLoading, error } = useSession(
    selected?.projectId ?? null,
    selected?.sessionId ?? null,
    sessionIsLive || liveEngaged,
  );
```
Replace the first two args with kind-guarded lookups:
```tsx
  const { data: rawSession, isLoading, error } = useSession(
    selected?.kind === 'session' || selected?.kind === 'prompt' ? selected.projectId : null,
    selected?.kind === 'session' ? selected.sessionId
      : selected?.kind === 'prompt' ? selected.sessionId : null,
    sessionIsLive || liveEngaged,
  );
```
Also guard `selectedMeta` (it reads `selected.projectId` / `selected.sessionId`):
```tsx
  const selectedMeta = useMemo(() => {
    if (!selected || selected.kind === 'memory' || !sessionsQuery.data) return null;
    return sessionsQuery.data.find(
      (s) => s.projectId === selected.projectId && s.sessionId === selected.sessionId
    ) ?? null;
  }, [selected, sessionsQuery.data]);
```
3. Add an origin-session jump handler (near the other handlers, before `return`):
```tsx
  function handleJumpToSession(sessionId: string): void {
    const meta = sessionsQuery.data?.find((s) => s.sessionId === sessionId);
    if (!meta) return;
    setSelected({ kind: 'session', projectId: meta.projectId, sessionId: meta.sessionId });
    setMode('sessions');
  }
```
4. Route the main content. Find the content branch `{mode === 'usage' ? <TokensPage … /> : (<>…</>)}` and change the head to:
```tsx
{mode === 'usage' ? <TokensPage family={family} preset={preset} onPresetChange={setPreset} />
 : mode === 'memory' ? (
   <MemoryPage
     selected={selected}
     onSelectMemory={(scopeKey, name) => setSelected({ kind: 'memory', scopeKey, name })}
     onJumpToSession={handleJumpToSession}
   />
 ) : (<>
```
(keep the existing `</>)}` closing the sessions/prompts branch).

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/unit/App-mode-routing.test.tsx`
Expected: PASS (including the memory case from Task 9). Also run `npm run typecheck` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/memory/MemoryPage.tsx src/memory/MemoryDetail.tsx src/memory/MemoryStats.tsx src/memory/MemoryGraph.tsx src/App.tsx
git commit -m "feat(memory): MemoryPage shell + App routing + origin-session jump"
```

---

## Task 11: `MemoryDetail` + `MemoryEditor`

**Files:**
- Create: `src/memory/MemoryEditor.tsx`
- Replace stub: `src/memory/MemoryDetail.tsx`
- Test: `tests/unit/memory/MemoryEditor.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/memory/MemoryEditor.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryEditor } from '../../../src/memory/MemoryEditor';

describe('MemoryEditor', () => {
  it('submits edited description, type, and body', () => {
    const onSave = vi.fn();
    render(
      <MemoryEditor
        mode="edit"
        initial={{ name: 'alpha', description: 'old', type: 'project', body: 'old body' }}
        knownNames={['alpha', 'beta']}
        onSave={onSave}
        onCancel={() => {}}
        pending={false}
      />
    );
    fireEvent.change(screen.getByTestId('editor-description'), { target: { value: 'new desc' } });
    fireEvent.change(screen.getByTestId('editor-type'), { target: { value: 'feedback' } });
    fireEvent.change(screen.getByTestId('editor-body'), { target: { value: 'new body' } });
    fireEvent.click(screen.getByTestId('editor-save'));
    expect(onSave).toHaveBeenCalledWith({ name: 'alpha', description: 'new desc', type: 'feedback', body: 'new body' });
  });

  it('in create mode requires a valid kebab name', () => {
    const onSave = vi.fn();
    render(
      <MemoryEditor mode="create" initial={{ name: '', description: '', type: 'project', body: '' }}
        knownNames={[]} onSave={onSave} onCancel={() => {}} pending={false} />
    );
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: 'Bad Name' } });
    fireEvent.click(screen.getByTestId('editor-save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('editor-name-error')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/memory/MemoryEditor.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `MemoryEditor`**

```tsx
// src/memory/MemoryEditor.tsx
import { useState } from 'react';
import type { MemoryType } from '../api/client';

const TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference'];

export type EditorValue = { name: string; description: string; type: MemoryType; body: string };

type Props = {
  mode: 'create' | 'edit';
  initial: EditorValue;
  knownNames: string[];
  onSave: (v: EditorValue) => void;
  onCancel: () => void;
  pending: boolean;
};

export function MemoryEditor({ mode, initial, knownNames, onSave, onCancel, pending }: Props) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [type, setType] = useState<MemoryType>(initial.type);
  const [body, setBody] = useState(initial.body);
  const [nameError, setNameError] = useState<string | null>(null);

  function submit() {
    if (mode === 'create' && !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      setNameError('Name must be a kebab slug (lowercase, digits, hyphens).');
      return;
    }
    onSave({ name, description, type, body });
  }

  // Lightweight [[ ]] autocomplete: show suggestions when the caret-preceding
  // text ends with an open `[[frag`.
  const openMatch = body.match(/\[\[([a-z0-9-]*)$/);
  const suggestions = openMatch
    ? knownNames.filter((n) => n.startsWith(openMatch[1])).slice(0, 6)
    : [];

  function applySuggestion(s: string) {
    setBody(body.replace(/\[\[[a-z0-9-]*$/, `[[${s}]]`));
  }

  return (
    <div style={styles.wrap} data-testid="memory-editor">
      {mode === 'create' && (
        <div style={styles.field}>
          <label style={styles.label}>name (slug)</label>
          <input data-testid="editor-name" style={styles.input} value={name}
            onChange={(e) => { setName(e.target.value); setNameError(null); }} />
          {nameError && <div data-testid="editor-name-error" style={styles.err}>{nameError}</div>}
        </div>
      )}
      <div style={styles.field}>
        <label style={styles.label}>description</label>
        <input data-testid="editor-description" style={styles.input} value={description}
          onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div style={styles.field}>
        <label style={styles.label}>type</label>
        <select data-testid="editor-type" style={styles.input} value={type}
          onChange={(e) => setType(e.target.value as MemoryType)}>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div style={styles.field}>
        <label style={styles.label}>body · markdown</label>
        <textarea data-testid="editor-body" style={{ ...styles.input, minHeight: 160, resize: 'vertical' }}
          value={body} onChange={(e) => setBody(e.target.value)} />
        {suggestions.length > 0 && (
          <div style={styles.suggest} data-testid="editor-suggestions">
            {suggestions.map((s) => (
              <button key={s} type="button" style={styles.suggestItem} onClick={() => applySuggestion(s)}>{s}</button>
            ))}
          </div>
        )}
      </div>
      <div style={styles.actions}>
        <button data-testid="editor-save" style={styles.save} disabled={pending} onClick={submit}>
          {pending ? 'SAVING…' : 'SAVE'}
        </button>
        <button data-testid="editor-cancel" style={styles.cancel} onClick={onCancel}>CANCEL</button>
      </div>
    </div>
  );
}

const styles = {
  wrap: { padding: 16, display: 'flex' as const, flexDirection: 'column' as const, gap: 10 },
  field: { display: 'flex' as const, flexDirection: 'column' as const, gap: 4, position: 'relative' as const },
  label: { fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', textTransform: 'uppercase' as const },
  input: { background: '#05080d', border: '1px solid rgba(0,229,255,0.3)', borderRadius: 3, color: 'var(--text)', padding: '6px 8px', fontFamily: 'ui-monospace, monospace', fontSize: 12 },
  err: { color: 'var(--node-failed)', fontSize: 11 },
  suggest: { display: 'flex' as const, gap: 4, flexWrap: 'wrap' as const, marginTop: 4 },
  suggestItem: { background: 'rgba(0,229,255,0.08)', border: '1px solid var(--edge-trail)', color: 'var(--edge-trail)', borderRadius: 10, fontSize: 10, padding: '2px 8px', cursor: 'pointer' },
  actions: { display: 'flex' as const, gap: 8 },
  save: { background: 'rgba(0,229,255,0.10)', border: '1px solid var(--edge-trail)', color: 'var(--edge-trail)', padding: '6px 16px', cursor: 'pointer', fontFamily: 'ui-monospace, monospace', letterSpacing: 2 },
  cancel: { background: 'transparent', border: '1px solid var(--edge-idle)', color: 'var(--text)', padding: '6px 16px', cursor: 'pointer', fontFamily: 'ui-monospace, monospace', letterSpacing: 2 },
};
```

- [ ] **Step 4: Replace `src/memory/MemoryDetail.tsx` (the stub) with the full component**

```tsx
import { useState } from 'react';
import type { MemoryRecord } from '../api/client';
import { useUpdateMemory, useDeleteMemory } from '../api/hooks';
import { renderBody } from './renderBody';
import { MemoryEditor, type EditorValue } from './MemoryEditor';

const TYPE_COLOR: Record<string, string> = {
  feedback: '#ff9d00', project: '#00e5ff', reference: '#b06cff', user: '#4dffa6',
};

type Props = {
  memory: MemoryRecord;
  knownNames: Set<string>;
  backlinks: string[];
  onNavigate: (name: string) => void;
  onJumpToSession: (sessionId: string) => void;
};

export function MemoryDetail({ memory, knownNames, backlinks, onNavigate, onJumpToSession }: Props) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateMemory();
  const del = useDeleteMemory();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(v: EditorValue) {
    await update.mutateAsync({ scopeKey: memory.scopeKey, name: memory.name, description: v.description, type: v.type, body: v.body });
    setEditing(false);
  }

  if (editing) {
    return (
      <MemoryEditor
        mode="edit"
        initial={{ name: memory.name, description: memory.description, type: memory.type ?? 'project', body: memory.body }}
        knownNames={[...knownNames]}
        onSave={save}
        onCancel={() => setEditing(false)}
        pending={update.isPending}
      />
    );
  }

  return (
    <div style={styles.wrap} data-testid="memory-detail">
      <div style={styles.actions}>
        <button data-testid="memory-edit" style={styles.act} onClick={() => setEditing(true)}>✎ edit</button>
        <button data-testid="memory-delete" style={{ ...styles.act, ...styles.del }} onClick={() => setConfirmDelete(true)}>🗑 delete</button>
      </div>
      <div style={styles.title}>{memory.name}</div>
      <div style={styles.meta}>
        <span style={{ ...styles.badge, color: TYPE_COLOR[memory.type ?? ''] ?? 'var(--text-dim)', borderColor: TYPE_COLOR[memory.type ?? ''] ?? 'var(--edge-idle)' }}>{memory.type ?? 'unknown'}</span>
        {memory.scope.kind === 'global' ? ' global' : ` ${memory.scope.cwd}`}
        {memory.originSessionId && ` · origin ${memory.originSessionId.slice(0, 8)}`}
      </div>
      {memory.parseError && <div style={styles.warn}>⚠ frontmatter parse issue: {memory.parseError}</div>}
      <div style={styles.body}>{renderBody(memory.body, knownNames, onNavigate)}</div>

      <div style={styles.conn}>
        <div style={styles.sec}>CONNECTIONS</div>
        {memory.links.map((l) => (
          <button key={l} data-testid={`conn-out-${l}`} style={styles.pill} onClick={() => onNavigate(l)}>→ {l}</button>
        ))}
        {backlinks.map((b) => (
          <button key={b} data-testid={`conn-back-${b}`} style={styles.pill} onClick={() => onNavigate(b)}>← {b}</button>
        ))}
        {memory.links.length === 0 && backlinks.length === 0 && <span style={styles.dim}>no links</span>}
        {memory.originSessionId && (
          <button data-testid="conn-session" style={{ ...styles.pill, ...styles.sessionPill }}
            onClick={() => onJumpToSession(memory.originSessionId!)}>⏱ jump to origin session →</button>
        )}
      </div>

      {confirmDelete && (
        <div style={styles.confirm} data-testid="delete-confirm">
          {backlinks.length > 0 && (
            <div style={styles.warn}>⚠ {backlinks.length} backlink(s) will break: {backlinks.join(', ')}</div>
          )}
          <div>Delete <strong>{memory.name}</strong>?</div>
          <div style={styles.actions}>
            <button data-testid="delete-confirm-yes" style={{ ...styles.act, ...styles.del }} disabled={del.isPending}
              onClick={() => del.mutate({ scopeKey: memory.scopeKey, name: memory.name })}>
              {del.isPending ? 'DELETING…' : 'CONFIRM DELETE'}
            </button>
            <button style={styles.act} onClick={() => setConfirmDelete(false)}>cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { padding: 16 },
  actions: { display: 'flex' as const, gap: 6, float: 'right' as const },
  act: { background: 'transparent', border: '1px solid rgba(0,229,255,0.4)', color: 'var(--text)', borderRadius: 3, padding: '3px 9px', cursor: 'pointer', fontSize: 11 },
  del: { borderColor: 'var(--node-failed)', color: 'var(--node-failed)' },
  title: { fontSize: 16, color: 'var(--edge-trail)', letterSpacing: 1, fontFamily: 'ui-monospace, monospace' },
  meta: { color: 'var(--text-dim)', fontSize: 11, margin: '4px 0 12px' },
  badge: { fontSize: 9, padding: '1px 6px', borderRadius: 8, border: '1px solid', marginRight: 6, textTransform: 'uppercase' as const },
  body: { color: 'var(--text)', lineHeight: 1.5, fontSize: 13 },
  conn: { marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(0,229,255,0.2)' },
  sec: { fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 6 },
  pill: { display: 'inline-block', fontSize: 10, padding: '3px 8px', borderRadius: 10, border: '1px solid rgba(0,229,255,0.4)', color: 'var(--edge-trail)', background: 'transparent', margin: '2px 4px 2px 0', cursor: 'pointer' },
  sessionPill: { borderColor: '#4dffa6', color: '#4dffa6' },
  dim: { color: 'var(--text-dim)', fontSize: 11 },
  warn: { color: 'var(--node-failed)', fontSize: 11, margin: '4px 0' },
  confirm: { marginTop: 14, padding: 12, border: '1px solid var(--node-failed)', borderRadius: 3, color: 'var(--text)', fontSize: 12 },
};
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/unit/memory/MemoryEditor.test.tsx` → PASS.
Run: `npm run typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/memory/MemoryEditor.tsx src/memory/MemoryDetail.tsx tests/unit/memory/MemoryEditor.test.tsx
git commit -m "feat(memory): detail view + hybrid editor with [[ ]] autocomplete"
```

---

## Task 12: `MemoryStats`

**Files:**
- Replace stub: `src/memory/MemoryStats.tsx`
- Test: `tests/unit/memory/MemoryStats.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/memory/MemoryStats.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryStats } from '../../../src/memory/MemoryStats';
import { deriveInsights } from '../../../src/memory/insights';
import type { MemoryRecord } from '../../../src/api/client';

function rec(p: Partial<MemoryRecord> & { name: string }): MemoryRecord {
  return {
    scopeKey: 'C--demo', scope: { kind: 'project', projectId: 'C--demo', cwd: 'C:/demo' },
    name: p.name, description: '', type: p.type ?? 'project', originSessionId: p.originSessionId ?? null,
    links: p.links ?? [], body: '', mtimeMs: p.mtimeMs ?? Date.now(), inIndex: p.inIndex ?? true,
  };
}

describe('MemoryStats', () => {
  it('shows totals, type composition, and a broken-link count', () => {
    const ins = deriveInsights([
      rec({ name: 'a', type: 'feedback', links: ['ghost'] }),
      rec({ name: 'b', type: 'project' }),
    ], Date.parse('2026-05-29T00:00:00Z'));
    render(<MemoryStats insights={ins} />);
    expect(screen.getByTestId('stats-total').textContent).toContain('2');
    expect(screen.getByTestId('stats-type-feedback').textContent).toContain('1');
    expect(screen.getByTestId('stats-broken').textContent).toContain('1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/memory/MemoryStats.test.tsx`
Expected: FAIL — stub has no `stats-total` testid.

- [ ] **Step 3: Implement `src/memory/MemoryStats.tsx`**

```tsx
import type { Insights } from './insights';
import type { MemoryType } from '../api/client';

const TYPE_COLOR: Record<MemoryType, string> = {
  feedback: '#ff9d00', project: '#00e5ff', reference: '#b06cff', user: '#4dffa6',
};
const TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference'];

export function MemoryStats({ insights }: { insights: Insights }) {
  const { composition, brokenLinks, orphans, missingFromIndex, parseErrors, stale, provenance } = insights;
  const max = Math.max(1, ...TYPES.map((t) => composition.byType[t]));

  return (
    <div style={styles.grid} data-testid="memory-stats">
      <div style={styles.box}>
        <div style={styles.h}>COMPOSITION</div>
        <div data-testid="stats-total" style={styles.big}>{composition.total} memories</div>
        {TYPES.map((t) => (
          <div key={t} style={styles.row}>
            <div style={{ ...styles.bar, width: `${(composition.byType[t] / max) * 100}%`, background: TYPE_COLOR[t] }} />
            <span data-testid={`stats-type-${t}`} style={styles.rowLabel}>{t} · {composition.byType[t]}</span>
          </div>
        ))}
        <div style={styles.dim}>{Object.entries(composition.byScope).map(([k, v]) => `${k === 'global' ? 'global' : k}: ${v}`).join(' · ')}</div>
      </div>

      <div style={styles.box}>
        <div style={styles.h}>HEALTH</div>
        <div data-testid="stats-orphans" style={styles.warn}>⚠ {orphans.length} orphans</div>
        <div data-testid="stats-broken" style={styles.warn}>⛓ {brokenLinks.length} broken links</div>
        <div data-testid="stats-missing" style={styles.warn}>☷ {missingFromIndex.length} missing from index</div>
        <div data-testid="stats-parse" style={styles.warn}>✗ {parseErrors.length} parse errors</div>
      </div>

      <div style={styles.box}>
        <div style={styles.h}>STALE (&gt;14d)</div>
        {stale.length === 0 && <div style={styles.dim}>none</div>}
        {stale.slice(0, 8).map((m) => (
          <div key={m.name} style={styles.stale}>{m.name}</div>
        ))}
      </div>

      <div style={styles.box}>
        <div style={styles.h}>PROVENANCE</div>
        {provenance.bySession.length === 0 && <div style={styles.dim}>no origin sessions</div>}
        {provenance.bySession.slice(0, 6).map((s) => (
          <div key={s.sessionId} style={styles.row}>{s.sessionId.slice(0, 8)} · {s.count}</div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  grid: { display: 'grid' as const, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, padding: 16 },
  box: { border: '1px solid rgba(0,229,255,0.22)', borderRadius: 3, padding: 12, background: 'rgba(0,229,255,0.04)' },
  h: { fontSize: 9, letterSpacing: 1, color: 'var(--edge-trail)', marginBottom: 8, textTransform: 'uppercase' as const },
  big: { color: 'var(--text)', fontSize: 14, marginBottom: 8 },
  row: { display: 'flex' as const, alignItems: 'center' as const, gap: 8, margin: '4px 0', color: 'var(--text)', fontSize: 11 },
  bar: { height: 9, borderRadius: 2, minWidth: 2 },
  rowLabel: { whiteSpace: 'nowrap' as const },
  dim: { color: 'var(--text-dim)', fontSize: 10, marginTop: 6 },
  warn: { color: '#ffcf6b', fontSize: 12, margin: '3px 0' },
  stale: { color: '#ffcf6b', fontSize: 11, margin: '2px 0' },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/memory/MemoryStats.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memory/MemoryStats.tsx tests/unit/memory/MemoryStats.test.tsx
git commit -m "feat(memory): stats view (composition, health, staleness, provenance)"
```

---

## Task 13: `MemoryGraph` (d3-force constellation)

**Files:**
- Replace stub: `src/memory/MemoryGraph.tsx`
- Test: `tests/unit/memory/MemoryGraph.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/memory/MemoryGraph.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryGraph } from '../../../src/memory/MemoryGraph';
import type { MemoryRecord } from '../../../src/api/client';

function rec(name: string, links: string[] = []): MemoryRecord {
  return {
    scopeKey: 'C--demo', scope: { kind: 'project', projectId: 'C--demo', cwd: 'C:/demo' },
    name, description: '', type: 'project', originSessionId: null, links, body: '', mtimeMs: 0, inIndex: true,
  };
}

describe('MemoryGraph', () => {
  it('renders one node per memory and one edge per valid link, and selects on click', () => {
    const onSelect = vi.fn();
    render(<MemoryGraph memories={[rec('a', ['b', 'ghost']), rec('b')]} selectedName={null} onSelect={onSelect} />);
    expect(screen.getAllByTestId(/^graph-node-/)).toHaveLength(2);
    expect(screen.getAllByTestId(/^graph-edge-/)).toHaveLength(1); // a->b valid; a->ghost dropped
    fireEvent.click(screen.getByTestId('graph-node-a'));
    expect(onSelect).toHaveBeenCalledWith('a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/memory/MemoryGraph.test.tsx`
Expected: FAIL — stub has no graph nodes.

- [ ] **Step 3: Implement `src/memory/MemoryGraph.tsx`**

```tsx
import { useMemo } from 'react';
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
  type SimulationNodeDatum,
} from 'd3-force';
import type { MemoryRecord, MemoryType } from '../api/client';

const TYPE_COLOR: Record<string, string> = {
  feedback: '#ff9d00', project: '#00e5ff', reference: '#b06cff', user: '#4dffa6',
};
const W = 900, H = 560;

type Node = SimulationNodeDatum & { id: string; type: MemoryType | null };

export function MemoryGraph({ memories, selectedName, onSelect }: {
  memories: MemoryRecord[];
  selectedName: string | null;
  onSelect: (name: string) => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const names = new Set(memories.map((m) => m.name));
    const nodes: Node[] = memories.map((m) => ({ id: m.name, type: m.type }));
    const links = memories.flatMap((m) =>
      m.links.filter((t) => names.has(t)).map((t) => ({ source: m.name, target: t }))
    );
    const sim = forceSimulation(nodes)
      .force('link', forceLink(links).id((d: any) => d.id).distance(90))
      .force('charge', forceManyBody().strength(-220))
      .force('center', forceCenter(W / 2, H / 2))
      .force('collide', forceCollide(26))
      .stop();
    for (let i = 0; i < 220; i++) sim.tick();
    const pos = new Map(nodes.map((n) => [n.id, { x: n.x ?? W / 2, y: n.y ?? H / 2 }]));
    return {
      nodes,
      edges: links.map((l) => {
        const s = pos.get(typeof l.source === 'string' ? l.source : (l.source as Node).id)!;
        const t = pos.get(typeof l.target === 'string' ? l.target : (l.target as Node).id)!;
        return { id: `${(l.source as any).id ?? l.source}-${(l.target as any).id ?? l.target}`, s, t };
      }),
    };
  }, [memories]);

  if (memories.length === 0) {
    return <div style={{ padding: 24, color: 'var(--text-dim)', letterSpacing: 4 }}>NO MEMORIES</div>;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%' }} data-testid="memory-graph">
      {edges.map((e) => (
        <line key={e.id} data-testid={`graph-edge-${e.id}`} x1={e.s.x} y1={e.s.y} x2={e.t.x} y2={e.t.y}
          stroke="rgba(0,229,255,0.4)" strokeWidth={1} />
      ))}
      {nodes.map((n) => {
        const color = TYPE_COLOR[n.type ?? ''] ?? '#7fb9c4';
        const isSel = n.id === selectedName;
        return (
          <g key={n.id} data-testid={`graph-node-${n.id}`} transform={`translate(${n.x},${n.y})`}
            onClick={() => onSelect(n.id)} style={{ cursor: 'pointer' }}>
            <circle r={isSel ? 14 : 11} fill="rgba(5,8,13,0.9)" stroke={color}
              strokeWidth={isSel ? 2.5 : 1.5} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
            <text x={16} y={4} fill="var(--text)" fontSize={10} fontFamily="ui-monospace, monospace">{n.id}</text>
          </g>
        );
      })}
    </svg>
  );
}
```

> Note: `d3-force` is already available — `d3` (^7.9.0) bundles it and `@types/d3` provides the types. Importing from `d3-force` resolves through the `d3` package. If the named subpackage import does not resolve, change the import to `import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3';` (types come from `@types/d3`).

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run tests/unit/memory/MemoryGraph.test.tsx` → PASS.
Run: `npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memory/MemoryGraph.tsx tests/unit/memory/MemoryGraph.test.tsx
git commit -m "feat(memory): d3-force constellation graph view"
```

---

## Task 14: Read fixtures + e2e (read / navigate / graph / stats)

**Files:**
- Create: `tests/fixtures/claude-projects/C--demo-mem/memory/MEMORY.md`
- Create: `tests/fixtures/claude-projects/C--demo-mem/memory/alpha-note.md`
- Create: `tests/fixtures/claude-projects/C--demo-mem/memory/beta-note.md`
- Create: `tests/e2e/memory-page.spec.ts`

- [ ] **Step 1: Create the fixture memories**

`tests/fixtures/claude-projects/C--demo-mem/memory/alpha-note.md`:
```markdown
---
name: alpha-note
description: "Alpha demo memory for e2e"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 2026-01-01-aaaa
---

Alpha body. Links to [[beta-note]].
```

`tests/fixtures/claude-projects/C--demo-mem/memory/beta-note.md`:
```markdown
---
name: beta-note
description: "Beta demo memory for e2e"
metadata:
  node_type: memory
  type: project
---

Beta body. No outgoing links.
```

`tests/fixtures/claude-projects/C--demo-mem/memory/MEMORY.md`:
```markdown
- [Alpha Note](alpha-note.md) — alpha demo
```
(Note: `beta-note` is intentionally omitted from the index so the "missing from index" health check has data.)

- [ ] **Step 2: Write the e2e spec**

```ts
// tests/e2e/memory-page.spec.ts
import { expect, test } from '@playwright/test';

test('memory page: browse, connections, graph, stats', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('library-mode').selectOption('memory');

  await expect(page.getByTestId('memory-page')).toBeVisible();
  // Sidebar lists fixture memories grouped under the project.
  await page.getByTestId('memory-item-C--demo-mem-alpha-note').click();

  // Detail shows body + connections.
  await expect(page.getByTestId('memory-detail')).toBeVisible();
  await expect(page.getByTestId('conn-out-beta-note')).toBeVisible();
  await expect(page.getByTestId('conn-session')).toBeVisible();

  // Navigate via connection pill.
  await page.getByTestId('conn-out-beta-note').click();
  await expect(page.getByText('Beta body.')).toBeVisible();

  // Graph view renders nodes + an edge.
  await page.getByTestId('memory-view-graph').click();
  await expect(page.getByTestId('graph-node-alpha-note')).toBeVisible();
  await expect(page.getByTestId('graph-node-beta-note')).toBeVisible();

  // Stats view renders the composition total.
  await page.getByTestId('memory-view-stats').click();
  await expect(page.getByTestId('stats-total')).toContainText('memories');
});

test('memory page: jump to origin session switches to sessions mode', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('library-mode').selectOption('memory');
  await page.getByTestId('memory-item-C--demo-mem-alpha-note').click();
  await page.getByTestId('conn-session').click();
  await expect(page.getByTestId('library-mode')).toHaveValue('sessions');
});
```

> The origin session `2026-01-01-aaaa` exists in the fixtures (`C--demo-happy/2026-01-01-aaaa.jsonl`), so the jump resolves.

- [ ] **Step 3: Run the e2e tests**

Run: `npx playwright test tests/e2e/memory-page.spec.ts`
Expected: PASS (2 tests). The webServer already sets `CLAUDE_HOME` to the fixtures dir.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/claude-projects/C--demo-mem tests/e2e/memory-page.spec.ts
git commit -m "test(memory): read fixtures + e2e browse/graph/stats/jump"
```

---

## Task 15: e2e write round-trip (create → delete) + gitignore

**Files:**
- Modify: `.gitignore`
- Create: `tests/e2e/memory-write.spec.ts`

> This exercises the real write path end-to-end. It creates a memory then deletes it, returning the fixture to its prior state. The `.backups/` directory it produces is gitignored so it is never committed. Authoritative write coverage (index sync, 409, path containment, broken backlinks) lives in the Task 4 server unit tests.

- [ ] **Step 1: Add backup dirs + stray test files to `.gitignore`**

Append:
```
# Memory store backups created by the app / e2e write tests
tests/fixtures/**/memory/.backups/
tests/fixtures/**/memory/e2e-*.md
```

- [ ] **Step 2: Write the e2e spec**

```ts
// tests/e2e/memory-write.spec.ts
import { expect, test } from '@playwright/test';

test('memory page: create a memory then delete it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('library-mode').selectOption('memory');

  // No "create" affordance is on the page by default for an unselected state;
  // create is triggered from the editor opened via the (existing) detail edit
  // flow only for edits. For create, the test drives the API-backed flow by
  // opening an existing memory and saving a NEW one is not possible — so we
  // assert create via the dedicated create button.
  await page.getByTestId('memory-create').click();
  await page.getByTestId('editor-name').fill('e2e-temp');
  await page.getByTestId('editor-description').fill('temp e2e memory');
  await page.getByTestId('editor-body').fill('temp body');
  await page.getByTestId('editor-save').click();

  // New item appears in the sidebar.
  const item = page.getByTestId('memory-item-C--demo-mem-e2e-temp');
  await expect(item).toBeVisible({ timeout: 5000 });

  // Open and delete it.
  await item.click();
  await page.getByTestId('memory-delete').click();
  await page.getByTestId('delete-confirm-yes').click();
  await expect(item).toHaveCount(0, { timeout: 5000 });
});
```

- [ ] **Step 3: Add a "create" affordance to the sidebar (memory mode)**

The spec above needs a `memory-create` button. Add it to `MemoryList.tsx` at the top of the render (above the groups), and a prop to open the create editor. In `MemoryList.tsx` add to `Props`:
```ts
  onCreate: (scopeKey: string) => void;
```
Render at the top of the returned `<div data-testid="memory-list">`:
```tsx
<button data-testid="memory-create" style={styles.create}
  onClick={() => onCreate(groups[0]?.scopeKey ?? 'global')}>+ NEW MEMORY</button>
```
Add to `styles`:
```ts
  create: { margin: '0 12px 8px', width: 'calc(100% - 24px)', background: 'rgba(0,229,255,0.08)', border: '1px solid var(--edge-trail)', color: 'var(--edge-trail)', padding: '5px', cursor: 'pointer', fontSize: 10, letterSpacing: 2, fontFamily: 'ui-monospace, monospace' },
```
In `LibraryPanel.tsx`, the `MemoryList` usage gains `onCreate`. Thread a new optional callback prop `onCreateMemory?: (scopeKey: string) => void` through `LibraryPanel`'s `Props` and pass it down; `App.tsx` provides it.

In `App.tsx`, add create state and pass a handler to `LibraryPanel` and `MemoryPage`:
```tsx
const [creatingScope, setCreatingScope] = useState<string | null>(null);
```
Pass `onCreateMemory={(scopeKey) => { setMode('memory'); setCreatingScope(scopeKey); }}` to `LibraryPanel`, and pass `creatingScope` + `onCreateDone` to `MemoryPage`.

In `MemoryPage.tsx`, accept `creatingScope: string | null` and `onCreateDone: () => void`; when `creatingScope` is set and `view === 'detail'`, render the `MemoryEditor` in create mode instead of the detail/empty state:
```tsx
import { MemoryEditor } from './MemoryEditor';
import { useCreateMemory } from '../api/hooks';
// inside component:
const create = useCreateMemory();
// in the detail branch, before the selectedMemory check:
if (creatingScope) {
  return (
    <MemoryEditor
      mode="create"
      initial={{ name: '', description: '', type: 'project', body: '' }}
      knownNames={memories.map((m) => m.name)}
      pending={create.isPending}
      onCancel={onCreateDone}
      onSave={async (v) => {
        await create.mutateAsync({ scopeKey: creatingScope, name: v.name, description: v.description, type: v.type, body: v.body });
        onCreateDone();
        onSelectMemory(creatingScope, v.name);
      }}
    />
  );
}
```
Wrap the detail branch's content so this `creatingScope` check runs first within `view === 'detail'`.

- [ ] **Step 4: Run e2e + full unit suite + typecheck**

Run: `npm run typecheck` → PASS.
Run: `npx vitest run` → PASS (all unit tests).
Run: `npx playwright test tests/e2e/memory-write.spec.ts` → PASS.

Then confirm the fixture is clean:
Run: `git status tests/fixtures` → only the committed `alpha-note.md`/`beta-note.md`/`MEMORY.md` present; no `e2e-temp.md`, no `.backups/` tracked.

- [ ] **Step 5: Commit**

```bash
git add .gitignore tests/e2e/memory-write.spec.ts src/components/library/MemoryList.tsx src/components/library/LibraryPanel.tsx src/memory/MemoryPage.tsx src/App.tsx
git commit -m "feat(memory): create flow + e2e write round-trip"
```

---

## Task 16: Docs + security review + final verification

**Files:**
- Modify: `docs/tech_docs/USER_GUIDE.md`
- Modify: `docs/tech_docs/DEVELOPER_GUIDE.md`
- Modify: `README.md`

- [ ] **Step 1: Document the page in `USER_GUIDE.md`**

Add a "Memory page" section: how to switch to MEMORY mode, browse global vs project memories, read connections, jump to the origin session, the DETAIL/GRAPH/STATS views, and how to create/edit/delete (noting edits write to `~/.claude` and are backed up under `memory/.backups/`).

- [ ] **Step 2: Document architecture in `DEVELOPER_GUIDE.md`**

Add a "Memory" subsection: `server/memory-store.ts` (parse/serialize/index/safety/read/write), the `/api/memory` endpoints (the app's only write surface), and the `src/memory/` components. Note the global store lives at `~/.claude/memory` (sibling of `projects/`) and `CLAUDE_HOME` points at the `projects` dir.

- [ ] **Step 3: Mention the page in `README.md`**

Add the Memory page to the feature list / docs links alongside the Token Usage page.

- [ ] **Step 4: Run `/security-review` on the diff (managed policy — first write surface)**

Run the `/security-review` command against the branch diff. Confirm the path-containment guard (`resolveMemoryFile`), name validation (`isMemoryName`), and frontmatter validation cover traversal and injection. Address any Critical/High findings; record the outcome in the PR description.

- [ ] **Step 5: Full verification**

Run: `npm run typecheck` → PASS
Run: `npx vitest run` → PASS (all unit suites)
Run: `npx playwright test` → PASS (all e2e, including the new specs)

- [ ] **Step 6: Commit**

```bash
git add docs/tech_docs/USER_GUIDE.md docs/tech_docs/DEVELOPER_GUIDE.md README.md
git commit -m "docs(memory): document the Memory page + write-safety model"
```

---

## Self-review notes (addressed in this plan)

- **Spec coverage:** visualize → Task 13 (graph) + Task 9 (list); follow → Task 11 (connections, navigation) + Task 10/App (origin-session jump); analyze → Task 7 (insights) + Task 12 (stats); edit → Tasks 4-6, 11, 15 (create/edit/delete, index sync, backups). Write safety → Tasks 2, 4, 5 + Task 16 security review. Error handling → parseError surfaced (Tasks 3, 9, 11), broken links (Tasks 7, 8, 12), missing dir (Task 3). Testing → Tasks 1-4, 7, 8, 11-15.
- **Type consistency:** `MemoryRecord`, `MemoryType`, `MemoryResponse`, `Insights`, `EditorValue`, `Selection` (with `kind:'memory'`, `scopeKey`, `name`) are defined once and referenced unchanged across tasks. Endpoint param names (`scopeKey`, `name`) match client and server.
- **Deferred (per spec):** rename, git-style history, markdown library, bulk ops.
```
