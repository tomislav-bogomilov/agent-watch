import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Plugin, Connect } from 'vite';

type SessionMeta = {
  projectId: string;
  sessionId: string;
  cwd: string;
  startedAt: string;
  sizeBytes: number;
};

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
      out.push({
        projectId,
        sessionId,
        cwd: decodeProjectId(projectId),
        startedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
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
    },
  };
}
