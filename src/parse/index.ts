import { buildChain } from './chain';
import { countMilestones, computeSuccessPath } from './failure';
import { filterNoise } from './filter';
import { buildMilestones } from './milestones';
import type { RawEvent, Session, SessionPayload } from './types';

function parseJsonl(jsonl: string): RawEvent[] {
  const out: RawEvent[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      out.push(JSON.parse(trimmed) as RawEvent);
    } catch {
      // ignore malformed lines; treat as schema drift
    }
  }
  return out;
}

export function parseSession(payload: SessionPayload): Session {
  const events = parseJsonl(payload.jsonl);
  const chain = buildChain(events);
  const clean = filterNoise(chain);
  const root = buildMilestones(clean);
  // Subagent attachment happens in Task 11.
  const successPath = computeSuccessPath(root);
  return {
    id: payload.sessionId,
    cwd: payload.cwd,
    startedAt: events[0]?.timestamp ?? '',
    root,
    successPath,
    totalMilestones: countMilestones(root),
  };
}

export type { Milestone, Session, MilestoneKind, SessionMeta, SessionPayload } from './types';
