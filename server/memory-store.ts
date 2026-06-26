// server/memory-store.ts
import path from 'node:path';

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
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of body.matchAll(LINK_RE)) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    try { return JSON.parse(t) as string; } catch { return t.slice(1, -1); }
  }
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) return t.slice(1, -1);
  return t;
}

export function parseMemoryFile(raw: string): ParsedMemory {
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { frontmatter: {}, body: normalized, links: [], parseError: 'missing frontmatter' };
  }
  // find a standalone closing fence line: \n--- followed by \n or EOF
  let end = -1;
  let from = 3;
  while (true) {
    const idx = normalized.indexOf('\n---', from);
    if (idx === -1) break;
    const after = idx + 4;
    if (after >= normalized.length || normalized[after] === '\n') { end = idx; break; }
    from = idx + 1;
  }
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

export type MemoryIndexEntry = { name: string; title: string; hook?: string; filePresent: boolean };

const INDEX_LINE_RE = /^-\s*\[([^\]]+)\]\(([^)]+)\.md\)(?:\s*[—-]\s*(.*))?$/;

export function parseIndex(raw: string): MemoryIndexEntry[] {
  const out: MemoryIndexEntry[] = [];
  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const m = line.trim().match(INDEX_LINE_RE);
    if (!m) continue;
    const name = m[2].trim();
    // The link target is a filename stem (may be snake_case / mixed-case); only
    // reject traversal-unsafe targets, not merely non-kebab ones.
    if (!isSafeMemoryFileName(name)) continue;
    out.push({ title: m[1].trim(), name, hook: m[3]?.trim() || undefined, filePresent: false });
  }
  return out;
}

// Collapse all whitespace (incl. newlines) to single spaces. An index line is
// single-line by definition; allowing raw newlines from a memory's description
// would let crafted input inject fabricated entries into MEMORY.md.
function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function indexLineFor(name: string, title: string, hook?: string): string {
  const t = oneLine(title);
  const h = hook ? oneLine(hook) : '';
  return h ? `- [${t}](${name}.md) — ${h}` : `- [${t}](${name}.md)`;
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

// Whether a string is safe to use as an on-disk memory filename stem. Unlike
// isMemoryName (kebab-only, used when CREATING), this permits the snake_case /
// mixed-case stems Claude Code's auto-memory writes — it only has to guarantee
// the stem cannot escape the scope dir.
export function isSafeMemoryFileName(s: string): boolean {
  return typeof s === 'string' && s.length > 0
    && !s.includes('/') && !s.includes('\\') && !s.includes('\0')
    && !s.split(/[/\\]/).includes('..') && s !== '.' && s !== '..';
}

// Resolve an EXISTING memory file by its real on-disk filename stem (for
// update/delete). The display `name` (frontmatter) may be free text and is NOT
// usable here; the filename is the stable identity.
export function resolveMemoryFileByName(projectsRoot: string, scopeKey: string, fileName: string): string {
  if (!isSafeMemoryFileName(fileName)) throw new Error(`invalid memory file: ${fileName}`);
  return path.join(memoryDirFor(projectsRoot, scopeKey), `${fileName}.md`);
}

import { promises as fs } from 'node:fs';

export type MemoryScope =
  | { kind: 'global' }
  | { kind: 'project'; projectId: string; cwd: string };

export type MemoryRecord = {
  scopeKey: string;
  scope: MemoryScope;
  /** On-disk filename stem (without .md) — the stable identity used for writes. */
  fileName: string;
  /** Display title from frontmatter `name`; may be free text. Not a routing key. */
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
    const fileName = f.replace(/\.md$/, '');
    const name = parsed.frontmatter.name ?? fileName;
    out.push({
      scopeKey, scope, fileName, name,
      description: parsed.frontmatter.description ?? '',
      type: parsed.frontmatter.type ?? null,
      originSessionId: parsed.frontmatter.originSessionId ?? null,
      links: parsed.links,
      body: parsed.body,
      mtimeMs: stat.mtimeMs,
      // The index links to files by stem, so membership is keyed by fileName.
      inIndex: indexNames.has(fileName),
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

async function backupFile(filePath: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    const dir = path.join(path.dirname(filePath), '.backups');
    await fs.mkdir(dir, { recursive: true });
    const base = path.basename(filePath, '.md');
    await fs.copyFile(filePath, path.join(dir, `${base}.${Math.round(stat.mtimeMs)}.md`));
  } catch { /* nothing to back up */ }
}

async function readRecord(projectsRoot: string, scopeKey: string, fileName: string): Promise<MemoryRecord> {
  const file = resolveMemoryFileByName(projectsRoot, scopeKey, fileName);
  const stat = await fs.stat(file);
  const parsed = parseMemoryFile(await fs.readFile(file, 'utf8'));
  const scope: MemoryScope = scopeKey === 'global'
    ? { kind: 'global' }
    : { kind: 'project', projectId: scopeKey, cwd: decodeProjectId(scopeKey) };
  const indexRaw = await fs.readFile(path.join(memoryDirFor(projectsRoot, scopeKey), 'MEMORY.md'), 'utf8').catch(() => '');
  const inIndex = parseIndex(indexRaw).some((e) => e.name === fileName);
  return {
    scopeKey, scope, fileName, name: parsed.frontmatter.name ?? fileName,
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
  if (scopeKey !== 'global') {
    const projectDir = path.join(projectsRoot, scopeKey);
    let stat: import('node:fs').Stats | null = null;
    try { stat = await fs.stat(projectDir); } catch { /* not found */ }
    if (!stat?.isDirectory()) throw new Error('unknown scope: ' + scopeKey);
  }
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
  projectsRoot: string, scopeKey: string, fileName: string,
  patch: { description: string; type: MemoryType; body: string },
): Promise<MemoryRecord> {
  const file = resolveMemoryFileByName(projectsRoot, scopeKey, fileName);
  const prior = parseMemoryFile(await fs.readFile(file, 'utf8'));
  // Preserve the existing display name — the editor doesn't change it, and it
  // may be free text that isn't derivable from the filename.
  const name = prior.frontmatter.name ?? fileName;
  await backupFile(file);
  await fs.writeFile(file, serializeMemory({
    name, description: patch.description, type: patch.type,
    originSessionId: prior.frontmatter.originSessionId ?? null, body: patch.body,
  }), 'utf8');
  // Index links by filename stem; title reflects the (possibly free-text) name.
  const e = deriveIndexEntry(name, patch.description);
  await writeIndex(projectsRoot, scopeKey, (raw) => upsertIndexLine(raw, fileName, e.title, e.hook));
  return readRecord(projectsRoot, scopeKey, fileName);
}

export async function deleteMemory(
  projectsRoot: string, scopeKey: string, fileName: string,
): Promise<{ brokenBacklinks: string[] }> {
  const file = resolveMemoryFileByName(projectsRoot, scopeKey, fileName);
  const store = await readMemoryStore(projectsRoot);
  // Backlinks reference the display name (via [[name]]), so resolve it from the
  // record we're deleting rather than the filename.
  const target = store.memories.find((m) => m.scopeKey === scopeKey && m.fileName === fileName);
  const displayName = target?.name ?? fileName;
  const brokenBacklinks = store.memories
    .filter((m) => m.fileName !== fileName && m.links.includes(displayName))
    .map((m) => m.name);
  await backupFile(file);
  await fs.rm(file);
  await writeIndex(projectsRoot, scopeKey, (raw) => removeIndexLine(raw, fileName));
  return { brokenBacklinks };
}
