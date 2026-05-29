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
