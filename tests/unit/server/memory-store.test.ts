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

  it('round-trips a description containing double-quotes', () => {
    const text = serializeMemory({ name: 'q', description: 'She said "hi"', type: 'user', originSessionId: null, body: '' });
    expect(parseMemoryFile(text).frontmatter.description).toBe('She said "hi"');
  });

  it('does not terminate frontmatter on a body line that starts with ---', () => {
    const raw = `---\nname: t\ndescription: "d"\nmetadata:\n  type: project\n---\n\nintro\n--- a horizontal rule ---\nmore\n`;
    const p = parseMemoryFile(raw);
    expect(p.parseError).toBeUndefined();
    expect(p.frontmatter.name).toBe('t');
    expect(p.body).toContain('--- a horizontal rule ---');
  });
});

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

  it('collapses newlines in the hook so a crafted description cannot inject index lines', () => {
    const e = deriveIndexEntry('safe-note', 'line one\n- [Injected](secret.md) — pwned\nmore');
    const index = upsertIndexLine('', e.name, e.title, e.hook);
    // the whole entry is a single physical line — no embedded newlines
    expect(index.trim().split('\n')).toHaveLength(1);
    // and it parses back as exactly ONE entry (the fabricated one is inert hook text)
    const parsed = parseIndex(index);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('safe-note');
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

  it('parseIndex skips entries with unsafe names', () => {
    const raw = `- [Good](good-name.md) — ok\n- [Bad](../escape.md) — nope\n`;
    const names = parseIndex(raw).map((e) => e.name);
    expect(names).toEqual(['good-name']);
  });

  it('resolveMemoryFile rejects names that escape the scope dir', () => {
    const root = path.join('C:', 'home', '.claude', 'projects');
    expect(() => resolveMemoryFile(root, 'global', '../escape')).toThrow();
    expect(resolveMemoryFile(root, 'global', 'ok-name')).toBe(
      path.join(memoryDirFor(root, 'global'), 'ok-name.md')
    );
  });
});

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

  it('createMemory rejects with /unknown scope/ for a nonexistent project scope', async () => {
    const projects = await makeStore();
    await expect(
      createMemory(projects, 'C--does-not-exist', {
        name: 'test-note', description: 'Test', type: 'project', body: '',
      })
    ).rejects.toThrow(/unknown scope/);
  });

  it('createMemory global scope works even without a project dir', async () => {
    const projects = await makeStore();
    // global dir = sibling ../memory of projects root; makeStore already creates it
    const rec = await createMemory(projects, 'global', {
      name: 'global-note', description: 'A global note', type: 'user', body: 'Hello',
    });
    expect(rec.name).toBe('global-note');
    expect(rec.scopeKey).toBe('global');
    const globalDir = memoryDirFor(projects, 'global');
    const files = await fs.readdir(globalDir);
    expect(files).toContain('global-note.md');
  });
});

// Memories created by Claude Code's auto-memory can have a snake_case filename
// AND a free-text frontmatter `name` (e.g. "Constants belong on the page object…").
// The app must identify them by their on-disk filename, not the display name —
// otherwise edits hit the kebab-only `isMemoryName` guard and 400.
describe('identify by filename (non-kebab / free-text names)', () => {
  async function makeFreeStore(): Promise<string> {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'memf-'));
    const projects = path.join(tmp, 'projects');
    const dir = path.join(projects, 'C--demo', 'memory');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'feedback_constants_placement.md'),
      `---\nname: Constants belong on the page object that owns them\ndescription: Constants live on the page object\ntype: feedback\noriginSessionId: keep-123\n---\nBody about constants.\n`);
    await fs.writeFile(path.join(dir, 'MEMORY.md'),
      `- [Constants belong on the page object that owns them](feedback_constants_placement.md) — owns them\n`);
    return projects;
  }

  it('readMemoryStore exposes the on-disk filename separately from the display name', async () => {
    const out = await readMemoryStore(await makeFreeStore());
    const rec = out.memories.find((m) => m.fileName === 'feedback_constants_placement');
    expect(rec).toBeTruthy();
    expect(rec!.name).toBe('Constants belong on the page object that owns them');
    expect(rec!.fileName).toBe('feedback_constants_placement');
    expect(rec!.inIndex).toBe(true);
  });

  it('updateMemory routes by filename and preserves the free-text frontmatter name', async () => {
    const projects = await makeFreeStore();
    const rec = await updateMemory(projects, 'C--demo', 'feedback_constants_placement',
      { description: 'updated desc', type: 'feedback', body: 'edited body' });
    expect(rec.fileName).toBe('feedback_constants_placement');
    expect(rec.name).toBe('Constants belong on the page object that owns them'); // preserved, not clobbered
    expect(rec.type).toBe('feedback');
    expect(rec.originSessionId).toBe('keep-123');
    const dir = memoryDirFor(projects, 'C--demo');
    const written = await fs.readFile(path.join(dir, 'feedback_constants_placement.md'), 'utf8');
    expect(written).toContain('edited body');
    expect(parseMemoryFile(written).frontmatter.name).toBe('Constants belong on the page object that owns them');
  });

  it('deleteMemory routes by filename for a non-kebab file', async () => {
    const projects = await makeFreeStore();
    await deleteMemory(projects, 'C--demo', 'feedback_constants_placement');
    const dir = memoryDirFor(projects, 'C--demo');
    await expect(fs.stat(path.join(dir, 'feedback_constants_placement.md'))).rejects.toThrow();
  });
});
