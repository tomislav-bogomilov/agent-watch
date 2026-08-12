import { computeSuccessPath, countMilestones } from './failure';
import { extractLabel } from './extract-label';
import { extractSummary } from './extract-summary';
import type {
  CodexSessionPayload,
  ContextUsage,
  Milestone,
  MilestoneKind,
  Session,
  SkillActivation,
  SkillTrack,
} from './types';

type JsonObject = Record<string, unknown>;
type ParsedRecord = { timestamp: string; type: string; payload: JsonObject; raw: unknown };
type FlatMilestone = Milestone & {
  spawnThreadId?: string;
  assistantOutput?: boolean;
};
type TokenSnapshot = {
  usage: ContextUsage;
  contextSize: number;
  contextWindow?: number;
};
type RolloutParse = {
  flat: FlatMilestone[];
  activations: SkillActivation[];
  availableCount: number;
};

function object(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function parseJsonl(jsonl: string): ParsedRecord[] {
  const records: ParsedRecord[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let raw: unknown;
    try { raw = JSON.parse(line); } catch { continue; }
    const record = object(raw);
    const payload = object(record?.payload);
    const type = string(record?.type);
    if (!record || !payload || !type) continue;
    records.push({ timestamp: string(record.timestamp) ?? '', type, payload, raw });
  }
  return records;
}

function contentText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map(object)
    .filter((block): block is JsonObject => !!block)
    .filter((block) => block.type === 'input_text' || block.type === 'output_text')
    .map((block) => string(block.text) ?? '')
    .join('')
    .trim();
  return text || undefined;
}

function userText(content: unknown): string | undefined {
  const text = contentText(content);
  if (!text) return undefined;
  const withoutEnvelopes = text
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, ' ')
    .replace(/<recommended_plugins>[\s\S]*?<\/recommended_plugins>/gi, ' ')
    .trim();
  return withoutEnvelopes || undefined;
}

function reasoningSummary(summary: unknown): string | undefined {
  if (typeof summary === 'string') return summary.trim() || undefined;
  if (!Array.isArray(summary)) return undefined;
  const text = summary
    .map((part) => typeof part === 'string' ? part : string(object(part)?.text) ?? '')
    .join('\n')
    .trim();
  return text || undefined;
}

function display(value: unknown): string {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function decoded(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function explicitFailure(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === 'string' && /^Exit code:\s*-?[1-9]\d*\s*$/mi.test(value)) return true;
  const candidate = decoded(value);
  const obj = object(candidate);
  if (!obj || seen.has(obj)) return false;
  seen.add(obj);
  const status = string(obj.status)?.toLowerCase();
  if (status === 'failed' || status === 'error' || status === 'failure') return true;
  if (obj.is_error === true) return true;
  if (obj.error !== undefined && obj.error !== null && obj.error !== false && obj.error !== '') return true;
  for (const key of ['exit_code', 'exitCode']) {
    if (typeof obj[key] === 'number' && obj[key] !== 0) return true;
  }
  return Object.values(obj).some((nested) => {
    if (Array.isArray(nested)) return nested.some((entry) => explicitFailure(entry, seen));
    return explicitFailure(nested, seen);
  });
}

function milestone(
  threadId: string,
  ordinal: number,
  timestamp: string,
  kind: MilestoneKind,
  label: string,
  summary: string,
  raw: unknown,
): FlatMilestone {
  return {
    id: `${threadId}:${ordinal}:${kind}`,
    kind,
    label,
    summary,
    timestamp,
    failed: false,
    raw,
    children: [],
    scopeId: threadId,
  };
}

function tokenSnapshot(payload: JsonObject): TokenSnapshot | undefined {
  const info = object(payload.info);
  const last = object(info?.last_token_usage);
  if (!info || !last) return undefined;
  const inputTotal = nonNegativeNumber(last.input_tokens);
  const cacheRead = nonNegativeNumber(last.cached_input_tokens);
  const cacheCreation = nonNegativeNumber(last.cache_write_input_tokens);
  const output = nonNegativeNumber(last.output_tokens);
  if (inputTotal === undefined || cacheRead === undefined || cacheCreation === undefined || output === undefined) {
    return undefined;
  }
  const reasoningOutput = nonNegativeNumber(last.reasoning_output_tokens);
  const contextWindow = nonNegativeNumber(info.model_context_window);
  return {
    usage: {
      input: Math.max(0, inputTotal - cacheRead - cacheCreation),
      cacheRead,
      cacheCreation,
      output,
      ...(reasoningOutput === undefined ? {} : { reasoningOutput }),
    },
    contextSize: inputTotal,
    ...(contextWindow === undefined ? {} : { contextWindow }),
  };
}

function availableSkillCount(text: string): number {
  const availableSection = text.match(/###\s+Available skills\s*\n([\s\S]*?)(?=\n##(?:#)?\s|$)/i)?.[1] ?? text;
  const entries = availableSection.match(/^\s*-\s+\S.*$/gm) ?? [];
  return new Set(entries.map((entry) => entry.trim())).size;
}

function referencesSkillResource(toolName: string, input: string): boolean {
  return /SKILL\.md|skill:\/\//i.test(input) || /skills?[._:-]?read/i.test(toolName);
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else {
    const obj = object(value);
    if (obj) for (const item of Object.values(obj)) collectStrings(item, out);
  }
  return out;
}

function normalizeYamlScalar(value: string | undefined): string | undefined {
  const scalar = value?.trim();
  if (!scalar) return undefined;
  const quoted = scalar.match(/^(["'])([\s\S]*)\1$/);
  return (quoted?.[2] ?? scalar).trim() || undefined;
}

function skillDocuments(value: unknown): Array<{ name: string; body: string }> {
  const documents: Array<{ name: string; body: string }> = [];
  for (const text of collectStrings(value)) {
    const starts = [...text.matchAll(/(?:^|\n)---\r?\n(?=name:\s*.+$)/gm)];
    for (let index = 0; index < starts.length; index += 1) {
      const start = (starts[index].index ?? 0) + (starts[index][0].startsWith('\n') ? 1 : 0);
      const end = index + 1 < starts.length ? (starts[index + 1].index ?? text.length) : text.length;
      const body = text.slice(start, end).trim();
      const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
      if (!frontmatter) continue;
      const name = normalizeYamlScalar(frontmatter.match(/^name:\s*(.+)$/m)?.[1]);
      const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim();
      if (name && description) documents.push({ name, body });
    }
  }
  return documents;
}

function extractRolloutSkills(threadId: string, records: ParsedRecord[]): Pick<RolloutParse, 'activations' | 'availableCount'> {
  let availableCount = 0;
  const calls = new Map<string, { toolName: string; input: string }>();
  const activations: SkillActivation[] = [];

  for (const record of records) {
    if (record.type === 'world_state') {
      const state = object(record.payload.state);
      const hostSkills = object(state?.host_skills);
      const body = string(hostSkills?.body);
      if (body) availableCount = Math.max(availableCount, availableSkillCount(body));
    }
    if (record.type !== 'response_item') continue;
    const itemType = string(record.payload.type);
    if (itemType === 'message' && record.payload.role === 'developer') {
      const text = contentText(record.payload.content);
      const catalog = text?.match(/<skills_instructions>([\s\S]*?)<\/skills_instructions>/i)?.[1];
      if (catalog) availableCount = Math.max(availableCount, availableSkillCount(catalog));
      continue;
    }
    if (itemType === 'function_call' || itemType === 'custom_tool_call') {
      const callId = string(record.payload.call_id);
      if (!callId) continue;
      const toolName = string(record.payload.name) ?? string(record.payload.tool_name) ?? itemType;
      const input = record.payload.arguments ?? record.payload.input ?? {};
      calls.set(callId, { toolName, input: display(decoded(input)) });
      continue;
    }
    if (itemType !== 'function_call_output' && itemType !== 'custom_tool_call_output') continue;
    const callId = string(record.payload.call_id);
    const call = callId ? calls.get(callId) : undefined;
    if (!callId || !call || !referencesSkillResource(call.toolName, call.input)) continue;
    const output = record.payload.output ?? record.payload.result;
    for (const document of skillDocuments(output)) {
      activations.push({
        name: document.name,
        activatedAt: record.timestamp,
        byTurnId: `${threadId}:${callId}`,
        tokenCost: Math.ceil(document.body.length / 4),
        source: 'resource',
        scopeId: threadId,
      });
    }
  }

  const earliest = new Map<string, SkillActivation>();
  for (const activation of activations) {
    const previous = earliest.get(activation.name);
    if (!previous || activation.activatedAt < previous.activatedAt) earliest.set(activation.name, activation);
  }
  return { activations: [...earliest.values()], availableCount };
}

function hasVisibleReasoning(jsonl: string): boolean {
  return parseJsonl(jsonl).some((record) =>
    record.type === 'event_msg'
    && record.payload.type === 'agent_reasoning'
    && !!string(record.payload.text));
}

function parseRollout(threadId: string, jsonl: string, useReasoningFallback: boolean): RolloutParse {
  const records = parseJsonl(jsonl);
  const flat: FlatMilestone[] = [];
  const tools = new Map<string, FlatMilestone>();
  let pendingModelNodes: FlatMilestone[] = [];
  let userCount = 0;

  for (const record of records) {
    const { payload } = record;
    if (record.type === 'event_msg') {
      if (payload.type === 'agent_reasoning') {
        const text = string(payload.text);
        if (text) {
          const node = milestone(threadId, flat.length, record.timestamp, 'assistant_turn', 'Decided', extractSummary({ kind: 'assistant_turn', text }), record.raw);
          node.detail = text;
          flat.push(node);
          pendingModelNodes.push(node);
        }
      } else if (payload.type === 'sub_agent_activity' && payload.kind === 'started') {
        const childId = string(payload.agent_thread_id);
        if (childId) {
          const spawn = milestone(threadId, flat.length, record.timestamp, 'subagent_spawn', '→ Agent', 'Started subagent', record.raw);
          spawn.spawnThreadId = childId;
          flat.push(spawn);
          pendingModelNodes.push(spawn);
        }
      } else if (payload.type === 'token_count') {
        const snapshot = tokenSnapshot(payload);
        if (snapshot) {
          for (const node of pendingModelNodes) {
            node.usage = snapshot.usage;
            node.contextSize = snapshot.contextSize;
            node.contextWindow = snapshot.contextWindow;
          }
        }
        pendingModelNodes = [];
      }
      continue;
    }
    if (record.type !== 'response_item') continue;

    const itemType = string(payload.type);
    if (itemType === 'message') {
      const role = string(payload.role);
      const text = role === 'user' ? userText(payload.content) : contentText(payload.content);
      if (!text || (role !== 'user' && role !== 'assistant')) continue;
      if (role === 'user') {
        pendingModelNodes = [];
        const kind = userCount++ === 0 ? 'root_prompt' : 'user_followup';
        const node = milestone(
          threadId,
          flat.length,
          record.timestamp,
          kind,
          extractLabel({ kind }).label,
          extractSummary({ kind, text }),
          record.raw,
        );
        node.detail = text;
        flat.push(node);
      } else {
        const node = milestone(threadId, flat.length, record.timestamp, 'assistant_turn', 'Decided', extractSummary({ kind: 'assistant_turn', text }), record.raw);
        node.detail = text;
        node.assistantOutput = true;
        flat.push(node);
        pendingModelNodes.push(node);
      }
      continue;
    }

    if (itemType === 'reasoning') {
      if (useReasoningFallback) {
        const text = reasoningSummary(payload.summary);
        if (text) {
          const node = milestone(threadId, flat.length, record.timestamp, 'assistant_turn', 'Decided', extractSummary({ kind: 'assistant_turn', text }), record.raw);
          node.detail = text;
          flat.push(node);
          pendingModelNodes.push(node);
        }
      }
      continue;
    }

    if (itemType === 'function_call' || itemType === 'custom_tool_call') {
      const callId = string(payload.call_id);
      if (!callId) continue;
      const toolName = string(payload.name) ?? string(payload.tool_name) ?? itemType;
      const input = payload.arguments ?? payload.input ?? {};
      const decodedInput = decoded(input);
      const summaryInput = object(decodedInput) ?? { input: decodedInput };
      const node = milestone(
        threadId,
        flat.length,
        record.timestamp,
        'tool_call',
        extractLabel({ kind: 'tool_call', toolName, input: summaryInput }).label,
        extractSummary({ kind: 'tool_call', toolName, input: summaryInput }),
        record.raw,
      );
      node.toolName = toolName;
      node.detail = display(decodedInput);
      node.failed = explicitFailure(payload);
      tools.set(callId, node);
      flat.push(node);
      pendingModelNodes.push(node);
      continue;
    }

    if (itemType === 'function_call_output' || itemType === 'custom_tool_call_output') {
      const callId = string(payload.call_id);
      const tool = callId ? tools.get(callId) : undefined;
      if (!tool) continue;
      const output = payload.output ?? payload.result ?? payload;
      tool.result = display(output);
      tool.failed = tool.failed || explicitFailure(payload) || explicitFailure(output);
    }
  }

  const last = flat.at(-1);
  if (last?.assistantOutput) {
    last.kind = 'completion';
    last.label = 'Done';
  }

  for (let index = 0; index < flat.length - 1; index += 1) {
    const node = flat[index];
    if (node.kind !== 'root_prompt' && node.kind !== 'user_followup') continue;
    const next = flat[index + 1];
    if (!next.usage) continue;
    node.usage = next.usage;
    node.contextSize = next.contextSize;
    node.contextWindow = next.contextWindow;
  }

  return { flat, ...extractRolloutSkills(threadId, records) };
}

function insertChronologically(flat: FlatMilestone[], node: FlatMilestone): void {
  const index = flat.findIndex((existing) => existing.timestamp && existing.timestamp > node.timestamp);
  if (index === -1) flat.push(node);
  else flat.splice(index, 0, node);
}

export function parseCodexSession(payload: CodexSessionPayload): Session {
  const rollouts = new Map<string, { jsonl: string; parentThreadId?: string; startedAt: string; label?: string }>();
  rollouts.set(payload.sessionId, { jsonl: payload.jsonl, startedAt: '' });
  for (const child of payload.subagents) {
    rollouts.set(child.threadId, {
      jsonl: child.jsonl,
      parentThreadId: child.parentThreadId,
      startedAt: child.startedAt,
      label: child.agentNickname ?? child.agentPath,
    });
  }
  const skillActivations: SkillActivation[] = [];
  const availableByScope: Record<string, number> = {};

  const building = new Set<string>();
  function buildThread(threadId: string): Milestone | undefined {
    if (building.has(threadId)) return undefined;
    const rollout = rollouts.get(threadId);
    if (!rollout) return undefined;
    building.add(threadId);
    const parsed = parseRollout(threadId, rollout.jsonl, !hasVisibleReasoning(rollout.jsonl));
    const { flat } = parsed;
    skillActivations.push(...parsed.activations);
    availableByScope[threadId] = parsed.availableCount;
    const children = [...rollouts.entries()]
      .filter(([, candidate]) => candidate.parentThreadId === threadId)
      .sort((a, b) => a[1].startedAt.localeCompare(b[1].startedAt));

    for (const [childId, child] of children) {
      let spawn = flat.find((node) => node.spawnThreadId === childId);
      if (!spawn) {
        spawn = milestone(threadId, flat.length, child.startedAt, 'subagent_spawn', '→ Agent', 'Started subagent', { synthetic: true, childId });
        spawn.spawnThreadId = childId;
        insertChronologically(flat, spawn);
      }
      spawn.label = `→ ${child.label ?? childId}`;
      spawn.summary = `Started ${child.label ?? childId}`;
    }

    const nodes = flat.map((node) => ({ ...node, children: [] as Milestone[] }));
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      const next = nodes[index + 1];
      if (node.kind === 'subagent_spawn' && node.spawnThreadId) {
        const childRoot = buildThread(node.spawnThreadId);
        if (childRoot) {
          node.children.push(childRoot);
        } else {
          node.children.push({
            id: `${node.spawnThreadId}:unavailable`,
            kind: 'assistant_turn',
            label: 'Unavailable',
            summary: 'Subagent rollout unavailable',
            timestamp: node.timestamp,
            failed: true,
            raw: null,
            children: [],
          });
        }
        if (next) node.children.push(next);
      } else if (next) {
        node.children.push(next);
      }
    }
    building.delete(threadId);
    return nodes[0];
  }

  const root = buildThread(payload.sessionId);
  if (!root) throw new Error(`Codex session ${payload.sessionId} has no renderable milestones`);
  const subagentMtimes: Record<string, string> = {};
  for (const child of payload.subagents) subagentMtimes[child.threadId] = child.lastUpdatedAt;
  const skillTrack: SkillTrack = {
    activations: skillActivations,
    availableCount: availableByScope[payload.sessionId] ?? 0,
    availableByScope,
  };
  return {
    provider: 'codex',
    id: payload.sessionId,
    cwd: payload.cwd,
    startedAt: root.timestamp,
    root,
    successPath: computeSuccessPath(root),
    totalMilestones: countMilestones(root),
    subagentMtimes,
    skillTrack,
  };
}
