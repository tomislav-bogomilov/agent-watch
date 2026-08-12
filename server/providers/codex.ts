import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  CodexSubagentPayload,
  CodexSessionPayload,
  ProviderWarning,
  SessionMeta,
} from '../../src/parse/types';
import type { SessionProviderAdapter } from './types';

type JsonObject = Record<string, unknown>;

type RolloutRecord = {
  filePath: string;
  threadId: string;
  parentThreadId?: string;
  cwd: string;
  agentPath?: string;
  agentNickname?: string;
  isSubagent: boolean;
  startedAt: string;
  lastUpdatedAt: string;
  sizeBytes: number;
  title?: string;
  renderable: boolean;
};

type RolloutOutcome =
  | { kind: 'valid'; record: RolloutRecord }
  | { kind: 'invalid-or-unreadable' };

type RolloutStat = { mtime: Date; mtimeMs: number; size: number };

type CodexAdapterOptions = {
  readDirectory?: (directory: string) => Promise<string[]>;
  readFile?: (filePath: string) => Promise<string>;
  statFile?: (filePath: string) => Promise<RolloutStat>;
};

function object(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function textFromContent(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const text = value
    .map((block) => object(block))
    .filter((block): block is JsonObject => !!block)
    .filter((block) => block.type === 'input_text' || block.type === 'output_text')
    .map((block) => string(block.text) ?? '')
    .join('')
    .trim();
  return text || undefined;
}

function userTextFromContent(value: unknown): string | undefined {
  const text = textFromContent(value);
  if (!text) return undefined;
  const withoutEnvelopes = text
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, ' ')
    .replace(/<recommended_plugins>[\s\S]*?<\/recommended_plugins>/gi, ' ')
    .trim();
  return withoutEnvelopes || undefined;
}

function normalizeCwd(cwd: string): string {
  return path.resolve(path.normalize(cwd));
}

export function codexProjectId(cwd: string): string {
  return Buffer.from(normalizeCwd(cwd), 'utf8').toString('base64url');
}

function parseRollout(filePath: string, jsonl: string, stat: { mtime: Date; size: number }): RolloutRecord | undefined {
  let metadata: JsonObject | undefined;
  let metadataTimestamp: string | undefined;
  let title: string | undefined;
  let fallbackTitle: string | undefined;
  let renderable = false;
  let latestRecordTimestampMs: number | undefined;

  for (const rawLine of jsonl.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(rawLine); } catch { continue; }
    const record = object(parsed);
    if (!record) continue;
    const recordTimestamp = string(record.timestamp);
    if (recordTimestamp) {
      const timestampMs = Date.parse(recordTimestamp);
      if (Number.isFinite(timestampMs)
        && (latestRecordTimestampMs === undefined || timestampMs > latestRecordTimestampMs)) {
        latestRecordTimestampMs = timestampMs;
      }
    }
    const payload = object(record.payload);
    if (!payload) continue;

    if (record.type === 'session_meta'
      && !metadata
      && (string(payload.id) ?? string(payload.session_id))
      && string(payload.cwd)) {
      metadata = payload;
      metadataTimestamp = string(record.timestamp);
      continue;
    }

    if (record.type === 'event_msg' && payload.type === 'agent_reasoning' && string(payload.text)) {
      renderable = true;
      continue;
    }

    if (record.type !== 'response_item') continue;
    const itemType = string(payload.type);
    if (itemType === 'message' && (payload.role === 'user' || payload.role === 'assistant')) {
      const text = payload.role === 'user'
        ? userTextFromContent(payload.content)
        : textFromContent(payload.content);
      if (text) {
        renderable = true;
        const shortened = text.length > 110 ? `${text.slice(0, 110)}…` : text;
        if (payload.role === 'user') title ??= shortened;
        else fallbackTitle ??= shortened;
      }
    } else if (itemType === 'function_call' || itemType === 'custom_tool_call') {
      renderable = true;
    } else if (itemType === 'reasoning' && Array.isArray(payload.summary)) {
      const summary = payload.summary
        .map((part) => string(object(part)?.text) ?? '')
        .join('\n')
        .trim();
      if (summary) {
        renderable = true;
        fallbackTitle ??= summary.length > 110 ? `${summary.slice(0, 110)}…` : summary;
      }
    }
  }

  if (!metadata) return undefined;
  const threadId = string(metadata.id) ?? string(metadata.session_id);
  const rawCwd = string(metadata.cwd);
  if (!threadId || !rawCwd) return undefined;
  const source = object(metadata.source);
  const subagentSource = object(source?.subagent);
  const threadSpawn = object(subagentSource?.thread_spawn);
  const parentThreadId = string(metadata.parent_thread_id)
    ?? string(subagentSource?.parent_thread_id)
    ?? string(threadSpawn?.parent_thread_id);
  return {
    filePath,
    threadId,
    parentThreadId,
    cwd: normalizeCwd(rawCwd),
    agentPath: string(metadata.agent_path) ?? string(subagentSource?.agent_path) ?? string(threadSpawn?.agent_path),
    agentNickname: string(metadata.agent_nickname) ?? string(subagentSource?.agent_nickname) ?? string(threadSpawn?.agent_nickname),
    isSubagent: parentThreadId !== undefined || metadata.thread_source === 'subagent' || subagentSource !== undefined,
    startedAt: metadataTimestamp ?? stat.mtime.toISOString(),
    lastUpdatedAt: latestRecordTimestampMs === undefined
      ? stat.mtime.toISOString()
      : new Date(latestRecordTimestampMs).toISOString(),
    sizeBytes: stat.size,
    title: title ?? fallbackTitle,
    renderable,
  };
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { code: 'ENOENT' });
}

export function createCodexSessionAdapter(
  root: string,
  options: CodexAdapterOptions = {},
): SessionProviderAdapter {
  const readDirectory = options.readDirectory ?? ((directory: string) => fs.readdir(directory));
  const readFile = options.readFile ?? ((filePath: string) => fs.readFile(filePath, 'utf8'));
  const statFile = options.statFile ?? ((filePath: string) => fs.stat(filePath));
  let indexed = false;
  let recordsByThread = new Map<string, RolloutRecord>();
  let mainsByKey = new Map<string, RolloutRecord>();
  let rolloutCache = new Map<string, { mtimeMs: number; size: number; outcome: RolloutOutcome }>();

  async function discoverFiles(
    directory: string,
    out: string[],
    warnings: ProviderWarning[],
    isRoot = false,
  ): Promise<void> {
    let names: string[];
    try {
      names = await readDirectory(directory);
    } catch (error) {
      if (isRoot) throw error;
      warnings.push({ provider: 'codex', message: `${directory}: ${(error as Error).message}` });
      return;
    }
    for (const name of names) {
      const full = path.join(directory, name);
      let stat;
      try { stat = await fs.lstat(full); } catch { continue; }
      if (stat.isDirectory()) {
        await discoverFiles(full, out, warnings);
      } else if (stat.isFile() && /^rollout-.*\.jsonl$/.test(name)) {
        out.push(full);
      }
    }
  }

  async function scan(): Promise<ProviderWarning[]> {
    const warnings: ProviderWarning[] = [];
    const files: string[] = [];
    try {
      await discoverFiles(root, files, warnings, true);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        indexed = true;
        recordsByThread = new Map();
        mainsByKey = new Map();
        return warnings;
      }
      indexed = true;
      recordsByThread = new Map();
      mainsByKey = new Map();
      warnings.push({ provider: 'codex', message: (error as Error).message });
      return warnings;
    }

    const discovered = new Map<string, RolloutRecord>();
    const skipped: string[] = [];
    const nextCache = new Map<string, { mtimeMs: number; size: number; outcome: RolloutOutcome }>();
    for (const filePath of files.sort()) {
      let stat;
      try {
        stat = await statFile(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') skipped.push(filePath);
        continue;
      }

      let outcome: RolloutOutcome;
      const cached = rolloutCache.get(filePath);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        outcome = cached.outcome;
      } else {
        try {
          const jsonl = await readFile(filePath);
          const record = parseRollout(filePath, jsonl, stat);
          outcome = record
            ? { kind: 'valid', record }
            : { kind: 'invalid-or-unreadable' };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          outcome = { kind: 'invalid-or-unreadable' };
        }
      }
      nextCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, outcome });
      if (outcome.kind === 'valid') {
        discovered.set(outcome.record.threadId, outcome.record);
      } else {
        skipped.push(filePath);
      }
    }
    rolloutCache = nextCache;

    if (skipped.length > 0) {
      const sample = path.basename(skipped[0]);
      const noun = skipped.length === 1 ? 'rollout' : 'rollouts';
      const remainder = skipped.length > 1 ? ` and ${skipped.length - 1} more` : '';
      warnings.push({
        provider: 'codex',
        message: `Skipped ${skipped.length} invalid or unreadable ${noun} (${sample}${remainder}).`,
      });
    }

    const mains = new Map<string, RolloutRecord>();
    for (const record of discovered.values()) {
      if (record.isSubagent || !record.renderable) continue;
      mains.set(`${codexProjectId(record.cwd)}/${record.threadId}`, record);
    }
    indexed = true;
    recordsByThread = discovered;
    mainsByKey = mains;
    return warnings;
  }

  async function ensureIndexed(): Promise<void> {
    if (!indexed) await scan();
  }

  return {
    id: 'codex',
    async listSessions() {
      const warnings = await scan();
      const sessions: SessionMeta[] = [...mainsByKey.values()].map((record) => ({
        provider: 'codex',
        projectId: codexProjectId(record.cwd),
        sessionId: record.threadId,
        cwd: record.cwd,
        startedAt: record.startedAt,
        lastUpdatedAt: record.lastUpdatedAt,
        sizeBytes: record.sizeBytes,
        title: record.title,
      }));
      sessions.sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt));
      return { sessions, warnings };
    },
    async readSession(projectId, sessionId): Promise<CodexSessionPayload> {
      await ensureIndexed();
      const main = mainsByKey.get(`${projectId}/${sessionId}`);
      if (!main) throw notFound('Codex session not found');

      const descendants = new Set([main.threadId]);
      const descendantRecords: RolloutRecord[] = [];
      let added = true;
      while (added) {
        added = false;
        for (const record of recordsByThread.values()) {
          if (!record.parentThreadId || descendants.has(record.threadId) || !descendants.has(record.parentThreadId)) continue;
          descendants.add(record.threadId);
          descendantRecords.push(record);
          added = true;
        }
      }
      const mainJsonl = await readFile(main.filePath);
      const subagents = (await Promise.all(descendantRecords.map(async (record): Promise<CodexSubagentPayload | undefined> => {
        try {
          const subagent: CodexSubagentPayload = {
            threadId: record.threadId,
            parentThreadId: record.parentThreadId!,
            startedAt: record.startedAt,
            lastUpdatedAt: record.lastUpdatedAt,
            jsonl: await readFile(record.filePath),
          };
          if (record.agentPath) subagent.agentPath = record.agentPath;
          if (record.agentNickname) subagent.agentNickname = record.agentNickname;
          return subagent;
        } catch {
          return undefined;
        }
      }))).filter((record): record is CodexSessionPayload['subagents'][number] => record !== undefined);
      subagents.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      return {
        provider: 'codex',
        projectId,
        sessionId,
        cwd: main.cwd,
        jsonl: mainJsonl,
        subagents,
      };
    },
  };
}
