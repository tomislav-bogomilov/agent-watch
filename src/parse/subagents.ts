import { buildChain } from './chain';
import { filterNoise } from './filter';
import { buildMilestones } from './milestones';
import type { Milestone, RawEvent } from './types';

export type SubagentFile = { id: string; jsonl: string };

function parseJsonl(jsonl: string): RawEvent[] {
  const out: RawEvent[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as RawEvent);
    } catch { /* ignore */ }
  }
  return out;
}

function buildSubagentRoot(jsonl: string): Milestone {
  const events = parseJsonl(jsonl);
  const clean = filterNoise(events);
  const chain = buildChain(clean);
  return buildMilestones(chain);
}

// Strip the `agent-` filename prefix to match the bare id Claude Code
// embeds in tool_result strings (e.g. `agentId: <id>`).
function bareAgentId(fileId: string): string {
  return fileId.startsWith('agent-') ? fileId.slice('agent-'.length) : fileId;
}

const AGENT_ID_RX = /agentId:\s*([A-Za-z0-9]+)/;

function extractAgentIdFromMilestone(node: Milestone): string | null {
  const raw = node.raw as { toolResult?: { content?: string } } | null;
  const content = raw?.toolResult?.content;
  if (typeof content !== 'string') return null;
  const m = content.match(AGENT_ID_RX);
  return m ? m[1] : null;
}

/**
 * Attach subagent subtrees to the matching `subagent_spawn` milestones.
 *
 * Linkage strategy (in order):
 *   1. Match by `agentId` parsed from the spawn's `tool_result` content
 *      against the subagent filename's `agent-<id>` suffix. This is the
 *      authoritative signal Claude Code emits.
 *   2. Fallback: subagent's first event timestamp >= spawn's timestamp.
 *   3. Last resort: consume subagent files in source order for any spawn
 *      that still has no match.
 */
export function attachSubagents(root: Milestone, subagents: SubagentFile[]): void {
  if (subagents.length === 0) return;

  const subInfos = subagents.map((sa) => {
    const events = parseJsonl(sa.jsonl);
    const firstTs = events.find((e) => e.timestamp)?.timestamp ?? '';
    const subRoot = buildSubagentRoot(sa.jsonl);
    return { id: sa.id, bareId: bareAgentId(sa.id), firstTs, subRoot };
  });

  function walk(node: Milestone): void {
    if (node.kind === 'subagent_spawn') {
      const targetAgentId = extractAgentIdFromMilestone(node);
      let idx = -1;
      if (targetAgentId) {
        idx = subInfos.findIndex((s) => s.bareId === targetAgentId);
      }
      if (idx === -1) {
        idx = subInfos.findIndex(
          (s) => s.firstTs !== '' && node.timestamp !== '' && s.firstTs >= node.timestamp
        );
      }
      if (idx === -1 && subInfos.length > 0) {
        idx = 0;
      }
      if (idx !== -1) {
        const [info] = subInfos.splice(idx, 1);
        node.children = [info.subRoot, ...node.children];
      }
    }
    for (const c of node.children) walk(c);
  }

  walk(root);
}
