import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Plugin, Connect } from 'vite';

type SessionMeta = {
  projectId: string;
  sessionId: string;
  cwd: string;
  startedAt: string;
  lastUpdatedAt: string;
  sizeBytes: number;
  title?: string;
};

const TITLE_HEAD_BYTES = 64 * 1024;
const TITLE_MAX_CHARS = 60;

function isMeaningfulUserText(raw: string): string | null {
  // Strip command tags and other XML-ish noise the CLI emits.
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
  // Skip bare slash commands like "/clear", "/model", "/compact" — they
  // describe the operation, not the conversation. If the user typed a
  // slash command with arguments we keep the args as the topic.
  if (cleaned.startsWith('/')) {
    const afterFirstSpace = cleaned.slice(cleaned.indexOf(' ') + 1).trim();
    if (!afterFirstSpace || afterFirstSpace === cleaned) return null;
    cleaned = afterFirstSpace;
  }
  // Skip caveats / system breadcrumbs (e.g., "Caveat: The messages below…").
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
    const lines = head.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let ev: unknown;
      try { ev = JSON.parse(line); } catch { continue; }
      const e = ev as { type?: string; message?: { role?: string; content?: unknown }; isMeta?: boolean };
      if (e.isMeta) continue;
      if (e.type !== 'user' || e.message?.role !== 'user') continue;
      const content = e.message.content;
      let text: string | undefined;
      if (typeof content === 'string') {
        text = content;
      } else if (Array.isArray(content)) {
        const block = content.find((b) => typeof b === 'object' && b && (b as { type?: string }).type === 'text') as { text?: string } | undefined;
        text = block?.text;
      }
      if (!text) continue;
      const cleaned = isMeaningfulUserText(text);
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

function claudeHome(): string {
  return process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.claude', 'projects');
}

function decodeProjectId(id: string): string {
  // Claude Code encodes paths like `C:\Users\foo\proj` -> `C--Users-foo-proj`.
  // Best-effort: replace double-dash with colon prefix (Windows), single dash with slash.
  if (/^[A-Za-z]--/.test(id)) {
    const driveLetter = id[0];
    const rest = id.slice(3).replace(/-/g, '/');
    return `${driveLetter}:/${rest}`;
  }
  return id.replace(/-/g, '/');
}

function sendJson(res: Parameters<Connect.NextHandleFunction>[1], status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function listSessions(root: string): Promise<SessionMeta[]> {
  let projects: string[];
  try {
    projects = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: SessionMeta[] = [];
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
      try {
        stat = await fs.stat(full);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      const sessionId = name.replace(/\.jsonl$/, '');
      const title = await extractTitle(full);
      out.push({
        projectId,
        sessionId,
        cwd: decodeProjectId(projectId),
        startedAt: stat.mtime.toISOString(),
        lastUpdatedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        title,
      });
    }
  }
  out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return out;
}

async function readSessionPayload(root: string, projectId: string, sessionId: string) {
  const projectDir = path.join(root, projectId);
  const sessionPath = path.join(projectDir, `${sessionId}.jsonl`);
  const jsonl = await fs.readFile(sessionPath, 'utf8');
  const subagents: { id: string; jsonl: string }[] = [];
  const subagentDir = path.join(projectDir, sessionId, 'subagents');
  try {
    const files = await fs.readdir(subagentDir);
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const content = await fs.readFile(path.join(subagentDir, f), 'utf8');
      subagents.push({ id: f.replace(/\.jsonl$/, ''), jsonl: content });
    }
  } catch {
    // no subagent dir -> empty list
  }
  return {
    projectId,
    sessionId,
    cwd: decodeProjectId(projectId),
    jsonl,
    subagents,
  };
}

function isSafeId(s: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(s);
}

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

export function sessionsPlugin(): Plugin {
  const root = claudeHome();
  return {
    name: 'thoughtgraph:sessions',
    configureServer(server) {
      server.middlewares.use('/api/sessions', async (req, res, next) => {
        try {
          const url = req.url ?? '/';
          if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'method not allowed' });
            return;
          }
          if (url === '/' || url === '') {
            const sessions = await listSessions(root);
            sendJson(res, 200, { sessions });
            return;
          }
          const match = url.match(/^\/([^/]+)\/([^/?#]+)(?:[?#].*)?$/);
          if (!match) {
            sendJson(res, 400, { error: 'expected /api/sessions/:projectId/:sessionId' });
            return;
          }
          const [, projectId, sessionId] = match;
          if (!isSafeId(projectId) || !isSafeId(sessionId)) {
            sendJson(res, 400, { error: 'invalid id' });
            return;
          }
          const payload = await readSessionPayload(root, projectId, sessionId);
          sendJson(res, 200, payload);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            sendJson(res, 404, { error: 'not found' });
            return;
          }
          next(err as Error);
        }
      });

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
    },
  };
}
