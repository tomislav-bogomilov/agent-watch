import { computeSuccessPath, countMilestones } from './failure';
import type { CodexSessionPayload, Milestone, MilestoneKind, Session } from './types';

type JsonObject = Record<string, unknown>;
type ParsedRecord = { timestamp: string; type: string; payload: JsonObject; raw: unknown };
type FlatMilestone = Milestone & {
  spawnThreadId?: string;
  assistantOutput?: boolean;
};

function object(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
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
  };
}

function hasVisibleReasoning(jsonl: string): boolean {
  return parseJsonl(jsonl).some((record) =>
    record.type === 'event_msg'
    && record.payload.type === 'agent_reasoning'
    && !!string(record.payload.text));
}

function parseRollout(threadId: string, jsonl: string, useReasoningFallback: boolean): FlatMilestone[] {
  const records = parseJsonl(jsonl);
  const flat: FlatMilestone[] = [];
  const tools = new Map<string, FlatMilestone>();
  let userCount = 0;

  for (const record of records) {
    const { payload } = record;
    if (record.type === 'event_msg') {
      if (payload.type === 'agent_reasoning') {
        const text = string(payload.text);
        if (text) flat.push(milestone(threadId, flat.length, record.timestamp, 'assistant_turn', 'Decided', text, record.raw));
      } else if (payload.type === 'sub_agent_activity' && payload.kind === 'started') {
        const childId = string(payload.agent_thread_id);
        if (childId) {
          const spawn = milestone(threadId, flat.length, record.timestamp, 'subagent_spawn', '→ Agent', 'Started subagent', record.raw);
          spawn.spawnThreadId = childId;
          flat.push(spawn);
        }
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
        const kind = userCount++ === 0 ? 'root_prompt' : 'user_followup';
        flat.push(milestone(threadId, flat.length, record.timestamp, kind, kind === 'root_prompt' ? 'Prompt' : 'Follow-up', text, record.raw));
      } else {
        const node = milestone(threadId, flat.length, record.timestamp, 'assistant_turn', 'Decided', text, record.raw);
        node.assistantOutput = true;
        flat.push(node);
      }
      continue;
    }

    if (itemType === 'reasoning') {
      if (useReasoningFallback) {
        const text = reasoningSummary(payload.summary);
        if (text) flat.push(milestone(threadId, flat.length, record.timestamp, 'assistant_turn', 'Decided', text, record.raw));
      }
      continue;
    }

    if (itemType === 'function_call' || itemType === 'custom_tool_call') {
      const callId = string(payload.call_id);
      if (!callId) continue;
      const toolName = string(payload.name) ?? string(payload.tool_name) ?? itemType;
      const input = payload.arguments ?? payload.input ?? {};
      const node = milestone(threadId, flat.length, record.timestamp, 'tool_call', toolName, display(decoded(input)), record.raw);
      node.toolName = toolName;
      node.detail = display(decoded(input));
      node.failed = explicitFailure(payload);
      tools.set(callId, node);
      flat.push(node);
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
  return flat;
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
  const useReasoningFallback = ![...rollouts.values()].some((rollout) => hasVisibleReasoning(rollout.jsonl));

  const building = new Set<string>();
  function buildThread(threadId: string): Milestone | undefined {
    if (building.has(threadId)) return undefined;
    const rollout = rollouts.get(threadId);
    if (!rollout) return undefined;
    building.add(threadId);
    const flat = parseRollout(threadId, rollout.jsonl, useReasoningFallback);
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
  return {
    provider: 'codex',
    id: payload.sessionId,
    cwd: payload.cwd,
    startedAt: root.timestamp,
    root,
    successPath: computeSuccessPath(root),
    totalMilestones: countMilestones(root),
    subagentMtimes,
  };
}
