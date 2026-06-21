import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isNarratorProject } from './plugin-shared';

export type TokenUsageRow = {
  projectId: string;
  modelId: string;
  isSubagent: boolean;
  day: string; // YYYY-MM-DD (UTC)
  input: number;
  output: number;
  cacheRead: number;     // cache_read_input_tokens
  cacheWrite5m: number;  // cache_creation.ephemeral_5m_input_tokens (or legacy total)
  cacheWrite1h: number;  // cache_creation.ephemeral_1h_input_tokens
};

export type TokenUsageProject = {
  id: string;
  cwd: string;
};

export type AggregateResult = {
  projects: TokenUsageProject[];
  rows: TokenUsageRow[];
};

function decodeProjectId(id: string): string {
  // Mirrors server/vite-plugin-sessions.ts decodeProjectId.
  if (/^[A-Za-z]--/.test(id)) {
    const driveLetter = id[0];
    const rest = id.slice(3).replace(/-/g, '/');
    return `${driveLetter}:/${rest}`;
  }
  return id.replace(/-/g, '/');
}

type AssistantEvent = {
  type?: string;
  timestamp?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_creation?: {
        ephemeral_5m_input_tokens?: number;
        ephemeral_1h_input_tokens?: number;
      };
    };
  };
};

async function listDirSafe(p: string): Promise<string[]> {
  try {
    return await fs.readdir(p);
  } catch {
    return [];
  }
}

async function statSafe(p: string): Promise<import('node:fs').Stats | null> {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

async function readFileSafe(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

function accumulate(
  acc: Map<string, TokenUsageRow>,
  seenMessageIds: Set<string>,
  projectId: string,
  isSubagent: boolean,
  jsonl: string,
): void {
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let ev: AssistantEvent;
    try { ev = JSON.parse(trimmed) as AssistantEvent; } catch { continue; }
    if (ev.type !== 'assistant') continue;
    const ts = ev.timestamp;
    if (!ts || ts.length < 10) continue;
    const day = ts.slice(0, 10);
    const model = ev.message?.model;
    const u = ev.message?.usage;
    if (!model || !u) continue;
    if (model === '<synthetic>') continue; // API-error placeholder events carry no real usage
    // One assistant turn with N content blocks is logged as N lines that each
    // repeat the same turn-level usage; resumed/compacted sessions re-log the
    // same turn in another file. Count each unique message.id once. Lines with
    // no id (older/synthetic shapes) can't be deduped, so they still sum.
    const messageId = ev.message?.id;
    if (messageId) {
      if (seenMessageIds.has(messageId)) continue;
      seenMessageIds.add(messageId);
    }
    const input = Number(u.input_tokens ?? 0);
    const output = Number(u.output_tokens ?? 0);
    const cacheRead = Number(u.cache_read_input_tokens ?? 0);
    const cc = u.cache_creation;
    let cacheWrite5m: number;
    let cacheWrite1h: number;
    if (cc && (cc.ephemeral_5m_input_tokens !== undefined || cc.ephemeral_1h_input_tokens !== undefined)) {
      cacheWrite5m = Number(cc.ephemeral_5m_input_tokens ?? 0);
      cacheWrite1h = Number(cc.ephemeral_1h_input_tokens ?? 0);
    } else {
      // Older log lines lack the TTL split — count everything as the default 5-minute TTL.
      cacheWrite5m = Number(u.cache_creation_input_tokens ?? 0);
      cacheWrite1h = 0;
    }
    if (!Number.isFinite(input + output + cacheRead + cacheWrite5m + cacheWrite1h)) continue;
    const key = `${projectId}|${model}|${isSubagent ? 1 : 0}|${day}`;
    const prev = acc.get(key);
    if (prev) {
      prev.input += input;
      prev.output += output;
      prev.cacheRead += cacheRead;
      prev.cacheWrite5m += cacheWrite5m;
      prev.cacheWrite1h += cacheWrite1h;
    } else {
      acc.set(key, { projectId, modelId: model, isSubagent, day, input, output, cacheRead, cacheWrite5m, cacheWrite1h });
    }
  }
}

export async function aggregateTokenUsage(root: string): Promise<AggregateResult> {
  const projectDirs = await listDirSafe(root);
  if (projectDirs.length === 0) return { projects: [], rows: [] };

  const projects: TokenUsageProject[] = [];
  const acc = new Map<string, TokenUsageRow>();
  // Shared across every file in the run so a message re-logged in a resumed
  // session (a different file) is still counted only once.
  const seenMessageIds = new Set<string>();

  for (const projectId of projectDirs) {
    if (isNarratorProject(projectId)) continue; // hide narrator sessions
    const projectDir = path.join(root, projectId);
    const stat = await statSafe(projectDir);
    if (!stat?.isDirectory()) continue;
    projects.push({ id: projectId, cwd: decodeProjectId(projectId) });

    const entries = await listDirSafe(projectDir);
    for (const name of entries) {
      const full = path.join(projectDir, name);
      if (name.endsWith('.jsonl')) {
        const content = await readFileSafe(full);
        if (content) accumulate(acc, seenMessageIds, projectId, false, content);
        continue;
      }
      // Subagent JSONLs live at <sessionId>/subagents/*.jsonl
      const subStat = await statSafe(full);
      if (!subStat?.isDirectory()) continue;
      const subagentsDir = path.join(full, 'subagents');
      const subFiles = await listDirSafe(subagentsDir);
      for (const subName of subFiles) {
        if (!subName.endsWith('.jsonl')) continue;
        const content = await readFileSafe(path.join(subagentsDir, subName));
        if (content) accumulate(acc, seenMessageIds, projectId, true, content);
      }
    }
  }

  projects.sort((a, b) => a.id.localeCompare(b.id));
  const rows = Array.from(acc.values());
  return { projects, rows };
}
