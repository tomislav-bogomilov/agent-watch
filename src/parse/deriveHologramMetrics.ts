import type { Milestone, Session } from './types';

export type HologramMetrics = {
  latencyMs: number | null;
  latencyMedianMs: number;
  idleGapMs: number | null;
  contextSize: number | null;
  contextDeltaSincePrev: number | null;
  cacheEfficiency: number | null;
  cacheReads: number | null;
  cacheMisses: number | null;
  tokens: { input: number; cacheRead: number; cacheCreation: number; output: number } | null;
};

function tsMs(s: string | undefined): number | null {
  if (!s) return null;
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : null;
}

function latencyOf(turn: Milestone, parentTs: number | null): number | null {
  const cur = tsMs(turn.timestamp);
  if (cur === null || parentTs === null) return null;
  return cur - parentTs;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

function computeLatencyMedian(root: Milestone): number {
  const lats: number[] = [];
  function walk(n: Milestone, parent: Milestone | null) {
    if (n.kind === 'assistant_turn' && parent) {
      const l = latencyOf(n, tsMs(parent.timestamp));
      if (l !== null && l >= 0) lats.push(l);
    }
    for (const c of n.children) walk(c, n);
  }
  walk(root, null);
  return median(lats);
}

function findParent(root: Milestone, target: Milestone): Milestone | null {
  function walk(n: Milestone): Milestone | null {
    for (const c of n.children) {
      if (c === target) return n;
      const sub = walk(c);
      if (sub) return sub;
    }
    return null;
  }
  return walk(root);
}

export function deriveHologramMetrics(
  current: Milestone,
  prev: Milestone | null,
  session: Session,
): HologramMetrics {
  const parent = findParent(session.root, current);
  const latencyMs = parent ? latencyOf(current, tsMs(parent.timestamp)) : null;

  const curTs = tsMs(current.timestamp);
  const prevTs = prev ? tsMs(prev.timestamp) : null;
  const idleGapMs = curTs !== null && prevTs !== null ? curTs - prevTs : null;

  const contextSize = current.contextSize ?? null;
  const prevContext = prev?.contextSize ?? null;
  const contextDeltaSincePrev =
    contextSize !== null && prevContext !== null ? contextSize - prevContext : null;

  const u = current.usage ?? null;
  const tokens = u ? { input: u.input, cacheRead: u.cacheRead, cacheCreation: u.cacheCreation, output: u.output } : null;

  let cacheEfficiency: number | null = null;
  let cacheReads: number | null = null;
  let cacheMisses: number | null = null;
  if (u) {
    cacheReads = u.cacheRead;
    cacheMisses = u.input + u.cacheCreation;
    const denom = u.input + u.cacheRead + u.cacheCreation;
    cacheEfficiency = denom > 0 ? u.cacheRead / denom : 0;
  }

  return {
    latencyMs,
    latencyMedianMs: computeLatencyMedian(session.root),
    idleGapMs,
    contextSize,
    contextDeltaSincePrev,
    cacheEfficiency,
    cacheReads,
    cacheMisses,
    tokens,
  };
}
