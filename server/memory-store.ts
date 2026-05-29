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
    if (!isMemoryName(name)) continue;
    out.push({ title: m[1].trim(), name, hook: m[3]?.trim() || undefined, filePresent: false });
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
