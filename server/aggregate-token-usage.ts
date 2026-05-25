import { promises as fs } from 'node:fs';
import path from 'node:path';

export type TokenUsageRow = {
  projectId: string;
  modelId: string;
  isSubagent: boolean;
  day: string; // YYYY-MM-DD (UTC)
  input: number;
  output: number;
  cached: number; // cache_read + cache_creation
};

export type TokenUsageProject = {
  id: string;
  cwd: string;
};

export type TokenUsageResponse = {
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
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
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
    const input = Number(u.input_tokens ?? 0);
    const output = Number(u.output_tokens ?? 0);
    const cached = Number(u.cache_read_input_tokens ?? 0) + Number(u.cache_creation_input_tokens ?? 0);
    if (!Number.isFinite(input + output + cached)) continue;
    const key = `${projectId}|${model}|${isSubagent ? 1 : 0}|${day}`;
    const prev = acc.get(key);
    if (prev) {
      prev.input += input;
      prev.output += output;
      prev.cached += cached;
    } else {
      acc.set(key, { projectId, modelId: model, isSubagent, day, input, output, cached });
    }
  }
}

export async function aggregateTokenUsage(root: string): Promise<TokenUsageResponse> {
  const projectDirs = await listDirSafe(root);
  if (projectDirs.length === 0) return { projects: [], rows: [] };

  const projects: TokenUsageProject[] = [];
  const acc = new Map<string, TokenUsageRow>();

  for (const projectId of projectDirs) {
    const projectDir = path.join(root, projectId);
    const stat = await statSafe(projectDir);
    if (!stat?.isDirectory()) continue;
    projects.push({ id: projectId, cwd: decodeProjectId(projectId) });

    const entries = await listDirSafe(projectDir);
    for (const name of entries) {
      const full = path.join(projectDir, name);
      if (name.endsWith('.jsonl')) {
        const content = await readFileSafe(full);
        if (content) accumulate(acc, projectId, false, content);
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
        if (content) accumulate(acc, projectId, true, content);
      }
    }
  }

  projects.sort((a, b) => a.id.localeCompare(b.id));
  const rows = Array.from(acc.values());
  return { projects, rows };
}
