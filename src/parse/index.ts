import { buildChain } from './chain';
import { computeSuccessPath, countMilestones } from './failure';
import { filterNoise } from './filter';
import { buildMilestones } from './milestones';
import { attachSubagents } from './subagents';
import { extractSkillTrack } from './skills';
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
  const clean = filterNoise(events);
  const chain = buildChain(clean);
  const root = buildMilestones(chain);
  attachSubagents(root, payload.subagents);
  const skillTrack = extractSkillTrack(events);
  const successPath = computeSuccessPath(root);
  const subagentMtimes: Record<string, string> = {};
  for (const sa of payload.subagents) {
    subagentMtimes[sa.id] = sa.lastUpdatedAt;
  }
  return {
    id: payload.sessionId,
    cwd: payload.cwd,
    startedAt: events[0]?.timestamp ?? '',
    root,
    successPath,
    totalMilestones: countMilestones(root),
    subagentMtimes,
    skillTrack,
  };
}

export type { Milestone, Session, MilestoneKind, SessionMeta, SessionPayload } from './types';

