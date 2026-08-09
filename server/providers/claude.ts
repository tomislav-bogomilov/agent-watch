import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { ClaudeSessionPayload, SessionMeta } from '../../src/parse/types';
import { assertInsideRoot, isNarratorProject, isTempProject } from '../plugin-shared';
import type { SessionProviderAdapter } from './types';

const TITLE_HEAD_BYTES = 64 * 1024;
const TITLE_MAX_CHARS = 110;

export function meaningfulUserText(raw: string): string | null {
  let cleaned = raw
    .replace(/<command-name>.*?<\/command-name>/gs, ' ')
    .replace(/<command-message>.*?<\/command-message>/gs, ' ')
    .replace(/<command-args>(.*?)<\/command-args>/gs, ' $1 ')
    .replace(/<local-command-stdout>.*?<\/local-command-stdout>/gs, ' ')
    .replace(/<local-command-stderr>.*?<\/local-command-stderr>/gs, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  if (cleaned.startsWith('/')) {
    const afterFirstSpace = cleaned.slice(cleaned.indexOf(' ') + 1).trim();
    if (!afterFirstSpace || afterFirstSpace === cleaned) return null;
    cleaned = afterFirstSpace;
  }
  if (/^caveat:/i.test(cleaned)) return null;
  return cleaned;
}

async function extractTitle(filePath: string): Promise<string | undefined> {
  let handle: import('node:fs').promises.FileHandle | undefined;
  try {
    handle = await fs.open(filePath, 'r');
    const buf = Buffer.alloc(TITLE_HEAD_BYTES);
    const { bytesRead } = await handle.read(buf, 0, TITLE_HEAD_BYTES, 0);
    const head = buf.slice(0, bytesRead).toString('utf8');
    for (const line of head.split('\n')) {
      if (!line.trim()) continue;
      let ev: unknown;
      try { ev = JSON.parse(line); } catch { continue; }
      const e = ev as { type?: string; message?: { role?: string; content?: unknown }; isMeta?: boolean };
      if (e.isMeta || e.type !== 'user' || e.message?.role !== 'user') continue;
      const content = e.message.content;
      let text: string | undefined;
      if (typeof content === 'string') text = content;
      else if (Array.isArray(content)) {
        const block = content.find((b) => typeof b === 'object' && b && (b as { type?: string }).type === 'text') as { text?: string } | undefined;
        text = block?.text;
      }
      if (!text) continue;
      const cleaned = meaningfulUserText(text);
      if (!cleaned) continue;
      return cleaned.length > TITLE_MAX_CHARS ? `${cleaned.slice(0, TITLE_MAX_CHARS)}…` : cleaned;
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export function decodeClaudeProjectId(id: string): string {
  if (/^[A-Za-z]--/.test(id)) {
    return `${id[0]}:/${id.slice(3).replace(/-/g, '/')}`;
  }
  return id.replace(/-/g, '/');
}

export async function hasClaudeAssistantTurn(filePath: string): Promise<boolean> {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (!line) continue;
      let ev: unknown;
      try { ev = JSON.parse(line); } catch { continue; }
      const e = ev as { type?: string; message?: { role?: string } };
      if (e.type === 'assistant' && e.message?.role === 'assistant') return true;
    }
    return false;
  } finally {
    rl.close();
    stream.destroy();
  }
}

async function listClaudeSessions(root: string): Promise<SessionMeta[]> {
  let projects: string[];
  try { projects = await fs.readdir(root); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const out: SessionMeta[] = [];
  for (const projectId of projects) {
    if (isNarratorProject(projectId) || isTempProject(projectId)) continue;
    const projectDir = path.join(root, projectId);
    let entries: string[];
    try { entries = await fs.readdir(projectDir); } catch { continue; }
    for (const name of entries) {
      if (!name.endsWith('.jsonl')) continue;
      const full = path.join(projectDir, name);
      let stat;
      try { stat = await fs.stat(full); } catch { continue; }
      if (!stat.isFile() || !(await hasClaudeAssistantTurn(full))) continue;
      const sessionId = name.replace(/\.jsonl$/, '');
      out.push({
        provider: 'claude',
        projectId,
        sessionId,
        cwd: decodeClaudeProjectId(projectId),
        startedAt: stat.mtime.toISOString(),
        lastUpdatedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        title: await extractTitle(full),
      });
    }
  }
  out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return out;
}

async function readClaudeSession(root: string, projectId: string, sessionId: string): Promise<ClaudeSessionPayload> {
  const projectDir = path.join(root, projectId);
  const sessionPath = path.join(projectDir, `${sessionId}.jsonl`);
  const subagentDir = path.join(projectDir, sessionId, 'subagents');
  assertInsideRoot(root, sessionPath);
  assertInsideRoot(root, subagentDir);
  const jsonl = await fs.readFile(sessionPath, 'utf8');
  const subagents: ClaudeSessionPayload['subagents'] = [];
  try {
    for (const f of await fs.readdir(subagentDir)) {
      if (!f.endsWith('.jsonl')) continue;
      const full = path.join(subagentDir, f);
      const stat = await fs.stat(full);
      subagents.push({
        id: f.replace(/\.jsonl$/, ''),
        jsonl: await fs.readFile(full, 'utf8'),
        lastUpdatedAt: stat.mtime.toISOString(),
      });
    }
  } catch {
    // A Claude session need not have subagents.
  }
  return {
    provider: 'claude', projectId, sessionId,
    cwd: decodeClaudeProjectId(projectId), jsonl, subagents,
  };
}

export function createClaudeSessionAdapter(root: string): SessionProviderAdapter {
  return {
    id: 'claude',
    async listSessions() {
      return { sessions: await listClaudeSessions(root), warnings: [] };
    },
    readSession(projectId, sessionId) {
      return readClaudeSession(root, projectId, sessionId);
    },
  };
}
