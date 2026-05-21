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
  const chain = buildChain(events);
  const clean = filterNoise(chain);
  return buildMilestones(clean);
}

/**
 * Attach subagent subtrees to the matching `subagent_spawn` milestones.
 * Linkage: a subagent file is matched to a spawn by `relatedToolUseId`
 * in any of its events, or, if absent, by timestamp proximity (the first
 * subagent event timestamp must be >= the spawn's timestamp).
 */
export function attachSubagents(root: Milestone, subagents: SubagentFile[]): void {
  if (subagents.length === 0) return;

  // Map each subagent file -> (toolUseId | null, firstTimestamp, root milestone)
  const subInfos = subagents.map((sa) => {
    const events = parseJsonl(sa.jsonl);
    let toolUseId: string | null = null;
    for (const ev of events) {
      const rel = (ev as Record<string, unknown>).relatedToolUseId;
      if (typeof rel === 'string') { toolUseId = rel; break; }
    }
    const firstTs = events.find((e) => e.timestamp)?.timestamp ?? '';
    const subRoot = buildSubagentRoot(sa.jsonl);
    return { id: sa.id, toolUseId, firstTs, subRoot };
  });

  // Walk milestone tree, find subagent_spawn nodes, attach in DFS order.
  function walk(node: Milestone): void {
    if (node.kind === 'subagent_spawn') {
      const toolUseId = extractToolUseId(node.id);
      // Prefer id match
      let idx = subInfos.findIndex((s) => s.toolUseId && s.toolUseId === toolUseId);
      if (idx === -1) {
        // Fallback: nearest timestamp >= spawn timestamp
        idx = subInfos.findIndex(
          (s) => s.firstTs !== '' && node.timestamp !== '' && s.firstTs >= node.timestamp
        );
      }
      if (idx === -1 && subInfos.length > 0) {
        // last resort: take the first remaining
        idx = 0;
      }
      if (idx !== -1) {
        const [info] = subInfos.splice(idx, 1);
        // children was [next_main]; prepend subagent root.
        node.children = [info.subRoot, ...node.children];
      }
    }
    for (const c of node.children) walk(c);
  }

  walk(root);
}

function extractToolUseId(milestoneId: string): string | null {
  const idx = milestoneId.indexOf('#');
  return idx === -1 ? null : milestoneId.slice(idx + 1);
}
