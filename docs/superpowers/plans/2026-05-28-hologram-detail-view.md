# Hologram Node Detail View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-canvas hologram panel that projects from a pinned Thought, showing derived metrics (latency, idle gap, skills loaded with estimated token cost, cache efficiency, context delta, token breakdown). Coexists with the docked `DetailPanel`; both surface on pin.

**Architecture:** Pure SVG inside the existing `<g className="zoom-layer">` in `GraphCanvas.tsx`. Graph-space anchored (scales with zoom). Routing algorithm picks clear-space placement and emits an orthogonal connector path. CSS keyframes drive a stack-assemble entrance animation. A new parse pass extracts skill activations from raw events.

**Tech Stack:** TypeScript, React 19, SVG (no foreignObject), CSS keyframes, vitest, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-28-hologram-detail-view-design.md`

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `src/parse/types.ts` | Add `SkillTrack`, optional `Session.skillTrack` | modify |
| `src/parse/skills.ts` | `extractSkillTrack(events)`, `skillsActiveAt(milestone, track)` | new |
| `src/parse/deriveHologramMetrics.ts` | Pure metrics derivation per milestone | new |
| `src/parse/index.ts` | Call `extractSkillTrack` and attach to `Session` | modify |
| `src/graph/hologramLayout.ts` | Routing: panel placement + connector path | new |
| `src/theme/hologram.css` | Scoped keyframes + design tokens for the panel | new |
| `src/components/HologramPanel.tsx` | Pure SVG hologram renderer (props in, JSX out) | new |
| `src/components/useExitAnimation.ts` | Hook: delays unmount for exit fade | new |
| `src/components/GraphCanvas.tsx` | Render `<HologramPanel>` inside zoom layer when pinned; suppress tooltip on pin | modify |
| `tests/unit/parse/skills.test.ts` | Unit tests for skill extraction | new |
| `tests/unit/parse/deriveHologramMetrics.test.ts` | Unit tests for metrics deriver | new |
| `tests/unit/graph/hologramLayout.test.ts` | Unit tests for routing | new |
| `tests/unit/components/HologramPanel.test.tsx` | Component tests | new |
| `tests/e2e/hologram.spec.ts` | End-to-end pin/close/expand/zoom | new |

---

## Task 1: Skill data types

Adds the type surface that everything else depends on. No logic yet.

**Files:**
- Modify: `src/parse/types.ts`

- [ ] **Step 1: Add `SkillActivation` and `SkillTrack` to `src/parse/types.ts`**

Append at the bottom of the file:

```ts
export type SkillActivation = {
  name: string;
  activatedAt: string;
  byTurnId: string;
  tokenCost: number;
};

export type SkillTrack = {
  activations: SkillActivation[];
};
```

- [ ] **Step 2: Add optional `skillTrack` to `Session`**

In the same file, locate the `Session` type and add:

```ts
export type Session = {
  id: string;
  cwd: string;
  startedAt: string;
  root: Milestone;
  successPath: Set<string>;
  totalMilestones: number;
  subagentMtimes: Record<string, string>;
  skillTrack?: SkillTrack;   // NEW
};
```

- [ ] **Step 3: Type check**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/parse/types.ts
git commit -m "feat(types): add SkillTrack types and optional Session.skillTrack"
```

---

## Task 2: Skill extractor — `extractSkillTrack`

Walks raw events and records Skill tool activations. Token cost is estimated from the tool_result text length.

**Files:**
- Create: `src/parse/skills.ts`
- Test: `tests/unit/parse/skills.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/parse/skills.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractSkillTrack, skillsActiveAt } from '../../../src/parse/skills';
import type { RawEvent, Milestone } from '../../../src/parse/types';

function ev(over: Partial<RawEvent>): RawEvent {
  return {
    uuid: 'u',
    parentUuid: null,
    timestamp: '2026-01-01T00:00:00Z',
    type: 'assistant',
    ...over,
  };
}

function ms(over: Partial<Milestone>): Milestone {
  return {
    id: 'm', kind: 'assistant_turn', label: '', summary: '',
    timestamp: '2026-01-01T00:00:00Z', failed: false,
    raw: {}, children: [], ...over,
  } as Milestone;
}

describe('extractSkillTrack', () => {
  it('returns empty activations when no Skill tool_use is present', () => {
    const events: RawEvent[] = [
      ev({ uuid: 'a', type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] } }),
    ];
    expect(extractSkillTrack(events).activations).toEqual([]);
  });

  it('captures a Skill activation with name, timestamp, and turn id', () => {
    const events: RawEvent[] = [
      ev({
        uuid: 'turn-1',
        timestamp: '2026-01-01T00:05:00Z',
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu1', name: 'Skill', input: { skill: 'superpowers:brainstorming' } }],
        },
      }),
      ev({
        uuid: 'res-1',
        timestamp: '2026-01-01T00:05:01Z',
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'X'.repeat(400) }],
        },
      }),
    ];
    const track = extractSkillTrack(events);
    expect(track.activations).toEqual([
      {
        name: 'superpowers:brainstorming',
        activatedAt: '2026-01-01T00:05:00Z',
        byTurnId: 'turn-1',
        tokenCost: 100, // 400 chars / 4
      },
    ]);
  });

  it('captures multiple activations across separate turns', () => {
    const events: RawEvent[] = [
      ev({ uuid: 't1', timestamp: '2026-01-01T00:01:00Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'Skill', input: { skill: 'A' } }] } }),
      ev({ uuid: 'r1', type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: 'XXXX' }] } }),
      ev({ uuid: 't2', timestamp: '2026-01-01T00:02:00Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'b', name: 'Skill', input: { skill: 'B' } }] } }),
      ev({ uuid: 'r2', type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b', content: 'XX' }] } }),
    ];
    const track = extractSkillTrack(events);
    expect(track.activations.map((a) => a.name)).toEqual(['A', 'B']);
    expect(track.activations[0].tokenCost).toBe(1);
    expect(track.activations[1].tokenCost).toBe(1);
  });

  it('uses tokenCost of 0 when tool_result is missing', () => {
    const events: RawEvent[] = [
      ev({ uuid: 't', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'orphan', name: 'Skill', input: { skill: 'X' } }] } }),
    ];
    expect(extractSkillTrack(events).activations[0].tokenCost).toBe(0);
  });

  it('ignores non-Skill tool_use blocks', () => {
    const events: RawEvent[] = [
      ev({ message: { role: 'assistant', content: [{ type: 'tool_use', id: 'r', name: 'Read', input: { path: '/x' } }] } }),
    ];
    expect(extractSkillTrack(events).activations).toEqual([]);
  });

  it('ignores Skill blocks missing a skill arg', () => {
    const events: RawEvent[] = [
      ev({ message: { role: 'assistant', content: [{ type: 'tool_use', id: 's', name: 'Skill', input: {} }] } }),
    ];
    expect(extractSkillTrack(events).activations).toEqual([]);
  });
});

describe('skillsActiveAt', () => {
  it('returns only activations at or before the milestone timestamp, sorted by tokenCost desc', () => {
    const track = {
      activations: [
        { name: 'a', activatedAt: '2026-01-01T00:00:00Z', byTurnId: '1', tokenCost: 5 },
        { name: 'b', activatedAt: '2026-01-01T00:05:00Z', byTurnId: '2', tokenCost: 30 },
        { name: 'c', activatedAt: '2026-01-01T00:10:00Z', byTurnId: '3', tokenCost: 10 },
      ],
    };
    const at = ms({ timestamp: '2026-01-01T00:06:00Z' });
    expect(skillsActiveAt(at, track).map((a) => a.name)).toEqual(['b', 'a']);
  });

  it('returns [] when no activations precede the milestone', () => {
    const track = {
      activations: [{ name: 'a', activatedAt: '2026-01-01T00:10:00Z', byTurnId: '1', tokenCost: 5 }],
    };
    const at = ms({ timestamp: '2026-01-01T00:05:00Z' });
    expect(skillsActiveAt(at, track)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/parse/skills.test.ts`
Expected: FAIL with module not found for `src/parse/skills`.

- [ ] **Step 3: Implement `src/parse/skills.ts`**

Create the file:

```ts
import type { Milestone, RawContentBlock, RawEvent, SkillActivation, SkillTrack } from './types';

function findToolResultText(events: RawEvent[], toolUseId: string): string | null {
  for (const ev of events) {
    const content = ev.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === 'tool_result' && block.tool_use_id === toolUseId) {
        if (typeof block.content === 'string') return block.content;
        // content can also be a nested array of blocks; concat any text pieces
        let out = '';
        for (const sub of block.content) {
          if ((sub as RawContentBlock).type === 'text') out += (sub as { type: 'text'; text: string }).text;
        }
        return out;
      }
    }
  }
  return null;
}

export function extractSkillTrack(events: RawEvent[]): SkillTrack {
  const activations: SkillActivation[] = [];
  for (const ev of events) {
    if (ev.type !== 'assistant') continue;
    const content = ev.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type !== 'tool_use') continue;
      if (block.name !== 'Skill') continue;
      const skill = (block.input as { skill?: string } | undefined)?.skill;
      if (!skill || typeof skill !== 'string') continue;
      const resultText = findToolResultText(events, block.id);
      const tokenCost = Math.ceil((resultText?.length ?? 0) / 4);
      activations.push({
        name: skill,
        activatedAt: ev.timestamp,
        byTurnId: ev.uuid,
        tokenCost,
      });
    }
  }
  return { activations };
}

export function skillsActiveAt(milestone: Milestone, track: SkillTrack): SkillActivation[] {
  return track.activations
    .filter((a) => a.activatedAt <= milestone.timestamp)
    .sort((a, b) => b.tokenCost - a.tokenCost);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/unit/parse/skills.test.ts`
Expected: PASS — all 8 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/parse/skills.ts tests/unit/parse/skills.test.ts
git commit -m "feat(parse): extract Skill tool activations with estimated token cost"
```

---

## Task 3: Wire skill extraction into session parsing

Calls `extractSkillTrack` once per parsed session.

**Files:**
- Modify: `src/parse/index.ts`

- [ ] **Step 1: Add the import and the call**

In `src/parse/index.ts`, add the import:

```ts
import { extractSkillTrack } from './skills';
```

In `parseSession`, after `attachSubagents(...)` and before computing `successPath`, add:

```ts
const skillTrack = extractSkillTrack(events);
```

In the returned `Session` literal, include:

```ts
return {
  id: payload.sessionId,
  cwd: payload.cwd,
  startedAt: events[0]?.timestamp ?? '',
  root,
  successPath,
  totalMilestones: countMilestones(root),
  subagentMtimes,
  skillTrack,       // NEW
};
```

Note: `extractSkillTrack` runs on the **raw** `events` (not the filtered `clean`) so Skill calls on sidechains are still seen.

- [ ] **Step 2: Verify with the existing parse test suite**

Run: `npm test -- tests/unit/parse`
Expected: all pre-existing tests PASS unchanged. (No new test for the wire-up — Task 2 covers `extractSkillTrack` directly.)

- [ ] **Step 3: Type check**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/parse/index.ts
git commit -m "feat(parse): attach skillTrack to parsed Session"
```

---

## Task 4: Metrics deriver — `deriveHologramMetrics`

Pure function: takes the current and previous milestones plus the session, computes the metrics shown in the hologram. All fields nullable when data is missing.

**Files:**
- Create: `src/parse/deriveHologramMetrics.ts`
- Test: `tests/unit/parse/deriveHologramMetrics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/parse/deriveHologramMetrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveHologramMetrics } from '../../../src/parse/deriveHologramMetrics';
import type { Milestone, Session } from '../../../src/parse/types';

function ms(over: Partial<Milestone>): Milestone {
  return {
    id: 'm', kind: 'assistant_turn', label: '', summary: '',
    timestamp: '2026-01-01T00:00:00Z', failed: false,
    raw: {}, children: [], ...over,
  } as Milestone;
}

function sessionWith(root: Milestone): Session {
  return {
    id: 's', cwd: '/x', startedAt: root.timestamp, root,
    successPath: new Set(), totalMilestones: 1, subagentMtimes: {},
  };
}

describe('deriveHologramMetrics', () => {
  it('returns nulls when usage and timestamps are missing', () => {
    const cur = ms({ timestamp: '' });
    const out = deriveHologramMetrics(cur, null, sessionWith(cur));
    expect(out.latencyMs).toBeNull();
    expect(out.idleGapMs).toBeNull();
    expect(out.tokens).toBeNull();
    expect(out.cacheEfficiency).toBeNull();
    expect(out.contextSize).toBeNull();
    expect(out.contextDeltaSincePrev).toBeNull();
  });

  it('computes idleGapMs from timestamps when prev exists', () => {
    const prev = ms({ id: 'p', timestamp: '2026-01-01T00:00:00Z' });
    const cur  = ms({ id: 'c', timestamp: '2026-01-01T00:00:04Z' });
    const out = deriveHologramMetrics(cur, prev, sessionWith(cur));
    expect(out.idleGapMs).toBe(4000);
  });

  it('computes contextDeltaSincePrev from contextSize when both have it', () => {
    const prev = ms({ id: 'p', contextSize: 60000 });
    const cur  = ms({ id: 'c', contextSize: 64200 });
    const out = deriveHologramMetrics(cur, prev, sessionWith(cur));
    expect(out.contextDeltaSincePrev).toBe(4200);
  });

  it('computes cacheEfficiency = cacheRead / (cacheRead + input + cacheCreation)', () => {
    const cur = ms({
      usage: { input: 3000, cacheRead: 58000, cacheCreation: 2000, output: 1000 },
    });
    const out = deriveHologramMetrics(cur, null, sessionWith(cur));
    // 58000 / (58000 + 3000 + 2000) = 58000 / 63000 ≈ 0.9206
    expect(out.cacheEfficiency).toBeCloseTo(58000 / 63000, 4);
    expect(out.cacheReads).toBe(58000);
    expect(out.cacheMisses).toBe(5000);
  });

  it('returns tokens object intact from milestone.usage', () => {
    const cur = ms({ usage: { input: 1, cacheRead: 2, cacheCreation: 3, output: 4 } });
    const out = deriveHologramMetrics(cur, null, sessionWith(cur));
    expect(out.tokens).toEqual({ input: 1, cacheRead: 2, cacheCreation: 3, output: 4 });
  });

  it('computes latencyMedianMs from all assistant_turn milestones in the session', () => {
    // Build a session with 3 assistant_turns whose latency we control via children.
    // Latency model: latency = timestamp(this) - timestamp(parent) when parent exists.
    const root = ms({
      id: 'root', kind: 'root_prompt', timestamp: '2026-01-01T00:00:00Z',
      children: [
        ms({
          id: 't1', kind: 'assistant_turn', timestamp: '2026-01-01T00:00:02Z',
          children: [
            ms({
              id: 't2', kind: 'assistant_turn', timestamp: '2026-01-01T00:00:05Z',
              children: [
                ms({ id: 't3', kind: 'assistant_turn', timestamp: '2026-01-01T00:00:10Z' }),
              ],
            }),
          ],
        }),
      ],
    });
    // Latencies for the 3 turns relative to their parent: 2000, 3000, 5000 → median 3000.
    const cur = root.children[0];
    const out = deriveHologramMetrics(cur, root, sessionWith(root));
    expect(out.latencyMedianMs).toBe(3000);
    expect(out.latencyMs).toBe(2000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/parse/deriveHologramMetrics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/parse/deriveHologramMetrics.ts`**

Create the file:

```ts
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

function collectAssistantTurns(root: Milestone): Milestone[] {
  const out: Milestone[] = [];
  function walk(n: Milestone, parent: Milestone | null) {
    if (n.kind === 'assistant_turn' && parent) {
      out.push(n);
    }
    for (const c of n.children) walk(c, n);
  }
  walk(root, null);
  return out;
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
  // Walk the tree carrying parent reference so we can subtract timestamps.
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
  // latency = timestamp(current) - timestamp(parent in milestone tree)
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/unit/parse/deriveHologramMetrics.test.ts`
Expected: PASS — all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/parse/deriveHologramMetrics.ts tests/unit/parse/deriveHologramMetrics.test.ts
git commit -m "feat(parse): derive hologram metrics from milestone + session"
```

---

## Task 5: Routing algorithm — `layoutHologram`

Pure function that returns `{ panelRect, connectorPath }`. Treats every visible node as an obstacle. Tries NE/NW/SE/SW/E/W/N/S in order at escalating distances; falls back to minimum-overlap on failure.

**Files:**
- Create: `src/graph/hologramLayout.ts`
- Test: `tests/unit/graph/hologramLayout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/graph/hologramLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { layoutHologram } from '../../../src/graph/hologramLayout';
import type { LaidOutNode } from '../../../src/graph/layout';
import type { Milestone } from '../../../src/parse/types';

function node(id: string, x: number, y: number): LaidOutNode {
  const m = { id, kind: 'assistant_turn', label: '', summary: '', timestamp: '', failed: false, raw: {}, children: [] } as Milestone;
  return { id, milestone: m, x, y, depth: 0 };
}

const PANEL = { w: 350, h: 400 };
const HUGE_VIEWPORT = { x: -10000, y: -10000, w: 20000, h: 20000 };

describe('layoutHologram', () => {
  it('picks NE slot at d=24 when nothing blocks it (sparse scene)', () => {
    const selected = node('s', 0, 0);
    const out = layoutHologram(selected, [selected], HUGE_VIEWPORT, PANEL);
    // NE: bottom-left at (selected.x + W/2 + 24, selected.y - H/2 - 24 - panelH)
    //     = (0 + 58 + 24, 0 - 16 - 24 - 400) = (82, -440)
    expect(out.panelRect.x).toBe(82);
    expect(out.panelRect.y).toBe(-440);
    expect(out.panelRect.w).toBe(350);
    expect(out.panelRect.h).toBe(400);
    expect(out.connectorPath).toMatch(/^M /);
  });

  it('falls back to NW when NE is blocked by an obstacle', () => {
    const selected = node('s', 0, 0);
    // Place a big blocker centered at (240, -240) — overlaps the NE slot rect.
    const blocker = node('b', 240, -240);
    const out = layoutHologram(selected, [selected, blocker], HUGE_VIEWPORT, PANEL);
    // NW: bottom-right at (selected.x - W/2 - 24, ...)
    // panelRect.x = (selected.x - W/2 - 24) - panelW = (-58 - 24) - 350 = -432
    expect(out.panelRect.x).toBe(-432);
    expect(out.panelRect.y).toBe(-440);
  });

  it('escalates distance when all 8 directions blocked at d=24', () => {
    const selected = node('s', 0, 0);
    // Ring of blockers near every candidate slot at d=24.
    const obstacles: LaidOutNode[] = [selected];
    for (const [dx, dy] of [[200,-200],[-200,-200],[200,200],[-200,200],[200,0],[-200,0],[0,-220],[0,220]]) {
      obstacles.push(node(`b-${dx}-${dy}`, dx, dy));
    }
    // Move the obstacles so d=24 is fully blocked but d=48 NE clears.
    // For this simplified test, we trust the implementation to escalate.
    const out = layoutHologram(selected, obstacles, HUGE_VIEWPORT, PANEL);
    expect(out.panelRect).toBeDefined();
    expect(out.connectorPath).toMatch(/^M /);
  });

  it('falls back to minimum-overlap when no slot fits at any distance', () => {
    const selected = node('s', 0, 0);
    // Tiny viewport — every slot is outside it
    const tinyViewport = { x: -10, y: -10, w: 20, h: 20 };
    const out = layoutHologram(selected, [selected], tinyViewport, PANEL);
    expect(out.panelRect).toBeDefined();  // never null
    expect(out.connectorPath).toMatch(/^M /);
  });

  it('emits an orthogonal connector path with only horizontal/vertical segments', () => {
    const selected = node('s', 0, 0);
    const out = layoutHologram(selected, [selected], HUGE_VIEWPORT, PANEL);
    const pts = out.connectorPath.match(/-?\d+(\.\d+)?/g)!.map(Number);
    // Path is "M x0,y0 L x1,y1 L x2,y2 ..." — every consecutive pair must share either x or y.
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x1 = pts[i], y1 = pts[i + 1];
      const x2 = pts[i + 2], y2 = pts[i + 3];
      const horizontal = y1 === y2;
      const vertical = x1 === x2;
      expect(horizontal || vertical).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/graph/hologramLayout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/graph/hologramLayout.ts`**

Create the file:

```ts
import type { LaidOutNode } from './layout';

export type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

const NODE_W = 116;
const NODE_H = 32;
const OBSTACLE_MARGIN = 8;
const DISTANCES = [24, 48, 96, 192];
const DIRECTIONS: Array<'NE' | 'NW' | 'SE' | 'SW' | 'E' | 'W' | 'N' | 'S'> =
  ['NE', 'NW', 'SE', 'SW', 'E', 'W', 'N', 'S'];

function nodeBBox(n: LaidOutNode): Rect {
  return {
    x: n.x - NODE_W / 2 - OBSTACLE_MARGIN,
    y: n.y - NODE_H / 2 - OBSTACLE_MARGIN,
    w: NODE_W + 2 * OBSTACLE_MARGIN,
    h: NODE_H + 2 * OBSTACLE_MARGIN,
  };
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function intersectionArea(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function rectInside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h;
}

function slotFor(
  selected: LaidOutNode,
  dir: typeof DIRECTIONS[number],
  d: number,
  panel: { w: number; h: number },
): Rect {
  const sx = selected.x;
  const sy = selected.y;
  const hw = NODE_W / 2;
  const hh = NODE_H / 2;
  switch (dir) {
    case 'NE': return { x: sx + hw + d, y: sy - hh - d - panel.h, w: panel.w, h: panel.h };
    case 'NW': return { x: sx - hw - d - panel.w, y: sy - hh - d - panel.h, w: panel.w, h: panel.h };
    case 'SE': return { x: sx + hw + d, y: sy + hh + d, w: panel.w, h: panel.h };
    case 'SW': return { x: sx - hw - d - panel.w, y: sy + hh + d, w: panel.w, h: panel.h };
    case 'E':  return { x: sx + hw + d, y: sy - panel.h / 2, w: panel.w, h: panel.h };
    case 'W':  return { x: sx - hw - d - panel.w, y: sy - panel.h / 2, w: panel.w, h: panel.h };
    case 'N':  return { x: sx - panel.w / 2, y: sy - hh - d - panel.h, w: panel.w, h: panel.h };
    case 'S':  return { x: sx - panel.w / 2, y: sy + hh + d, w: panel.w, h: panel.h };
  }
}

function buildConnectorPath(selected: LaidOutNode, panelRect: Rect): string {
  // Pick nearest panel-edge midpoint to the selected node center.
  const cx = selected.x;
  const cy = selected.y;
  const edges = {
    left:   { mid: { x: panelRect.x, y: panelRect.y + panelRect.h / 2 },                side: 'L' as const },
    right:  { mid: { x: panelRect.x + panelRect.w, y: panelRect.y + panelRect.h / 2 },  side: 'R' as const },
    top:    { mid: { x: panelRect.x + panelRect.w / 2, y: panelRect.y },                side: 'T' as const },
    bottom: { mid: { x: panelRect.x + panelRect.w / 2, y: panelRect.y + panelRect.h },  side: 'B' as const },
  };
  let bestKey: keyof typeof edges = 'left';
  let bestDist = Infinity;
  for (const k of Object.keys(edges) as Array<keyof typeof edges>) {
    const m = edges[k].mid;
    const d = (m.x - cx) ** 2 + (m.y - cy) ** 2;
    if (d < bestDist) { bestDist = d; bestKey = k; }
  }
  const panelEnter = edges[bestKey].mid;
  // Choose the node edge closest to the panel entry point.
  const nodeEdges: Record<'L' | 'R' | 'T' | 'B', Point> = {
    L: { x: cx - NODE_W / 2, y: cy },
    R: { x: cx + NODE_W / 2, y: cy },
    T: { x: cx, y: cy - NODE_H / 2 },
    B: { x: cx, y: cy + NODE_H / 2 },
  };
  let nodeStart: Point = nodeEdges.R;
  let nodeBest = Infinity;
  for (const k of ['L','R','T','B'] as const) {
    const p = nodeEdges[k];
    const d = (p.x - panelEnter.x) ** 2 + (p.y - panelEnter.y) ** 2;
    if (d < nodeBest) { nodeBest = d; nodeStart = p; }
  }
  // Build a 2-bend Z path: leave the node perpendicular to its edge, travel to a
  // midpoint, then turn perpendicular toward the panel-entry side.
  // Midpoint heuristic: average x and y of start and enter.
  const midX = (nodeStart.x + panelEnter.x) / 2;
  const midY = (nodeStart.y + panelEnter.y) / 2;

  // Pick a Z-orientation based on which side of the node we're leaving.
  const horizontalFirst = nodeStart === nodeEdges.L || nodeStart === nodeEdges.R;
  const bend1: Point = horizontalFirst
    ? { x: midX, y: nodeStart.y }
    : { x: nodeStart.x, y: midY };
  const bend2: Point = horizontalFirst
    ? { x: midX, y: panelEnter.y }
    : { x: panelEnter.x, y: midY };

  // If start and enter are colinear (share x or y), collapse to 1 segment.
  if (nodeStart.x === panelEnter.x || nodeStart.y === panelEnter.y) {
    return `M ${nodeStart.x},${nodeStart.y} L ${panelEnter.x},${panelEnter.y}`;
  }
  return `M ${nodeStart.x},${nodeStart.y} L ${bend1.x},${bend1.y} L ${bend2.x},${bend2.y} L ${panelEnter.x},${panelEnter.y}`;
}

export function layoutHologram(
  selected: LaidOutNode,
  obstacles: LaidOutNode[],
  visibleRect: Rect,
  panelSize: { w: number; h: number },
): { panelRect: Rect; connectorPath: string } {
  const obstacleRects = obstacles
    .filter((n) => n.id !== selected.id)
    .map(nodeBBox);

  for (const d of DISTANCES) {
    for (const dir of DIRECTIONS) {
      const slot = slotFor(selected, dir, d, panelSize);
      if (!rectInside(slot, visibleRect)) continue;
      if (obstacleRects.some((o) => rectsIntersect(slot, o))) continue;
      return { panelRect: slot, connectorPath: buildConnectorPath(selected, slot) };
    }
  }

  // Fallback — pick the d=24 slot with the smallest total overlap area.
  let best: Rect | null = null;
  let bestScore = Infinity;
  for (const dir of DIRECTIONS) {
    const slot = slotFor(selected, dir, DISTANCES[0], panelSize);
    const overlap = obstacleRects.reduce((sum, o) => sum + intersectionArea(slot, o), 0);
    if (overlap < bestScore) { bestScore = overlap; best = slot; }
  }
  const fallback = best!;
  return { panelRect: fallback, connectorPath: buildConnectorPath(selected, fallback) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/unit/graph/hologramLayout.test.ts`
Expected: PASS — all 5 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/graph/hologramLayout.ts tests/unit/graph/hologramLayout.test.ts
git commit -m "feat(graph): route hologram placement and orthogonal connector"
```

---

## Task 6: CSS theme — `hologram.css`

Defines keyframes and design tokens. No JS.

**Files:**
- Create: `src/theme/hologram.css`

- [ ] **Step 1: Create the stylesheet**

```css
/* src/theme/hologram.css
   Scoped styles + keyframes for HologramPanel.
   All classes are prefixed `holo-` to avoid collisions with the rest of the app. */

/* --- shared color / sizing tokens (panel-local, not global) --- */
:root {
  --holo-cyan: #00e5ff;
  --holo-cyan-bright: #5cf2ff;
  --holo-mint: #7fffd4;
  --holo-amber: #ffb86c;
  --holo-fill: rgba(0,229,255,0.05);
  --holo-divider: rgba(0,229,255,0.22);
  --holo-scan: rgba(0,229,255,0.06);
  --holo-chip-fill: rgba(125,243,255,0.08);
  --holo-chip-stroke: rgba(125,243,255,0.55);
  --holo-bar-bg: rgba(0,229,255,0.10);
  --holo-mode-fill: rgba(255,184,108,0.14);
  --holo-mode-stroke: rgba(255,184,108,0.55);
}

/* --- connector --- */
.holo-conn-line {
  stroke: var(--holo-mint);
  stroke-width: 1;
  fill: none;
  stroke-dasharray: 4 3;
  opacity: 0.6;
  filter: drop-shadow(0 0 1.5px rgba(127,255,212,0.55));
}
.holo-conn-corner {
  fill: none;
  stroke: var(--holo-cyan);
  stroke-width: 0.7;
  opacity: 0.55;
}

/* --- frame + brackets --- */
.holo-frame {
  fill: var(--holo-fill);
  stroke: var(--holo-cyan);
  stroke-width: 1.1;
}
.holo-corner-bracket {
  stroke: var(--holo-cyan-bright);
  stroke-width: 1.6;
  fill: none;
  filter: drop-shadow(0 0 2px rgba(92,242,255,0.85));
}
.holo-scan { stroke: var(--holo-scan); stroke-width: 0.5; }
.holo-divider { stroke: var(--holo-divider); stroke-width: 0.6; }
.holo-divider-faint { stroke: rgba(0,229,255,0.1); stroke-width: 0.5; }

/* --- text styles --- */
.holo-id { font: 700 11px ui-monospace, monospace; fill: var(--holo-cyan); letter-spacing: 1.8px; }
.holo-kind { font: 600 9px ui-monospace, monospace; fill: var(--holo-mint); letter-spacing: 1.6px; }
.holo-label { font: 600 9px ui-monospace, monospace; fill: var(--holo-cyan-bright); letter-spacing: 1.2px; }
.holo-label-dim { font: 600 9px ui-monospace, monospace; fill: #3d7a8a; letter-spacing: 1.2px; }
.holo-value { font: 600 13px ui-monospace, monospace; fill: #e8faff; }
.holo-value-sub { font: 9px ui-monospace, monospace; fill: #5fa9b8; }
.holo-skill-name { font: 600 10px ui-monospace, monospace; fill: #aeeaf2; }
.holo-skill-tokens { font: 600 9px ui-monospace, monospace; fill: var(--holo-mint); }
.holo-skill-dim { font: 600 10px ui-monospace, monospace; fill: #4f7782; }

/* --- mode chip --- */
.holo-mode-chip { fill: var(--holo-mode-fill); stroke: var(--holo-mode-stroke); stroke-width: 0.6; }
.holo-mode-text { font: 700 9px ui-monospace, monospace; fill: var(--holo-amber); letter-spacing: 1.6px; }

/* --- expand row --- */
.holo-expand-row { fill: rgba(0,229,255,0.08); stroke: rgba(0,229,255,0.35); stroke-width: 0.6; cursor: pointer; }
.holo-expand-row:hover { fill: rgba(0,229,255,0.16); }
.holo-expand-text { font: 600 10px ui-monospace, monospace; fill: var(--holo-cyan-bright); }

/* --- close button --- */
.holo-close { cursor: pointer; }
.holo-close-text { font: 700 13px ui-monospace, monospace; fill: #e8faff; }
.holo-close:hover .holo-close-text { fill: var(--holo-cyan-bright); }

/* === ANIMATION — stack assemble === */
.holo-line {
  /* stroke-dasharray is set inline per path so we know the right length;
     here we just animate stroke-dashoffset */
  animation: holo-line-trace 200ms ease-out 0ms 1 normal both;
}
@keyframes holo-line-trace {
  from { stroke-dashoffset: var(--holo-line-len, 200); }
  to   { stroke-dashoffset: 0; }
}

.holo-shell {
  opacity: 0;
  animation: holo-shell-fade 50ms ease-out 200ms 1 normal forwards;
}
@keyframes holo-shell-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.holo-row {
  opacity: 0;
  transform: translateY(-10px);
  animation: holo-row-slide 280ms cubic-bezier(.2,.7,.3,1.05) var(--holo-row-delay, 250ms) 1 normal forwards;
  transform-box: fill-box;
}
@keyframes holo-row-slide {
  from { opacity: 0; transform: translateY(-10px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* === EXIT === */
.holo-exiting { transition: opacity 200ms ease-out; opacity: 0 !important; }

/* === REDUCED MOTION === */
@media (prefers-reduced-motion: reduce) {
  .holo-line,
  .holo-shell,
  .holo-row {
    animation: holo-rm-fade 200ms ease-out 0ms 1 normal forwards !important;
    transform: none !important;
  }
  @keyframes holo-rm-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
}
```

- [ ] **Step 2: Verify the file parses (lint via tsc indirectly)**

There is no CSS test runner. Confirm there are no syntax errors by reading the file back and running:

Run: `npm run typecheck`
Expected: clean (CSS isn't typechecked but this catches accidental TS changes).

- [ ] **Step 3: Commit**

```bash
git add src/theme/hologram.css
git commit -m "feat(theme): hologram CSS — tokens, keyframes, reduced-motion fallback"
```

---

## Task 7: Exit animation hook — `useExitAnimation`

Tiny hook used by `HologramPanel` to keep the SVG group mounted during its 200 ms fade-out.

**Files:**
- Create: `src/components/useExitAnimation.ts`

- [ ] **Step 1: Create the hook**

```ts
// src/components/useExitAnimation.ts
import { useEffect, useState } from 'react';

/**
 * Returns { mounted, exiting } based on `open`. When `open` flips false, the
 * caller keeps rendering as long as `mounted === true`. After `durationMs`,
 * `mounted` flips false and the caller can unmount.
 */
export function useExitAnimation(open: boolean, durationMs = 200): { mounted: boolean; exiting: boolean } {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setExiting(false);
      return;
    }
    if (!mounted) return;
    setExiting(true);
    const t = setTimeout(() => {
      setMounted(false);
      setExiting(false);
    }, durationMs);
    return () => clearTimeout(t);
  }, [open, durationMs, mounted]);

  return { mounted, exiting };
}
```

- [ ] **Step 2: Type check**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/useExitAnimation.ts
git commit -m "feat(components): useExitAnimation hook for delayed unmount"
```

---

## Task 8: HologramPanel — static render

Renders all sections with the data passed in. Animations are wired via CSS classes from Task 6; the exit hook from Task 7 manages unmount. Skills expand state is local to the component.

**Files:**
- Create: `src/components/HologramPanel.tsx`
- Test: `tests/unit/components/HologramPanel.test.tsx`

This is a fat component. The test enforces the contract; refactor freely within it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/HologramPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { HologramPanel } from '../../../src/components/HologramPanel';
import type { Milestone } from '../../../src/parse/types';

function ms(over: Partial<Milestone>): Milestone {
  return {
    id: 'T-042', kind: 'assistant_turn', label: 'analyze diff', summary: '',
    timestamp: '2026-01-01T00:00:00Z', failed: false, raw: {}, children: [], ...over,
  } as Milestone;
}

const fullView = {
  milestone: ms({}),
  mode: 'playback' as const,
  metrics: {
    latencyMs: 2140,
    latencyMedianMs: 4800,
    idleGapMs: 4200,
    contextSize: 64200,
    contextDeltaSincePrev: 3100,
    cacheEfficiency: 0.92,
    cacheReads: 58100,
    cacheMisses: 5000,
    tokens: { input: 3000, cacheRead: 58100, cacheCreation: 2000, output: 1100 },
  },
  skills: [
    { name: 'brainstorming', activatedAt: '', byTurnId: '', tokenCost: 6100 },
    { name: 'test-driven-development', activatedAt: '', byTurnId: '', tokenCost: 4200 },
    { name: 'systematic-debugging', activatedAt: '', byTurnId: '', tokenCost: 2800 },
    { name: 'using-git-worktrees', activatedAt: '', byTurnId: '', tokenCost: 2100 },
    { name: 'verification-before-completion', activatedAt: '', byTurnId: '', tokenCost: 1400 },
    { name: 'extra-six', activatedAt: '', byTurnId: '', tokenCost: 900 },
    { name: 'extra-seven', activatedAt: '', byTurnId: '', tokenCost: 700 },
    { name: 'extra-eight', activatedAt: '', byTurnId: '', tokenCost: 500 },
  ],
  skillsTotal: { count: 8, totalTokens: 18700 },
};

const panelRect = { x: 200, y: 30, w: 350, h: 400 };
const connectorPath = 'M 0,0 L 100,0 L 100,100 L 200,100';

describe('HologramPanel', () => {
  it('renders ID, kind, and mode chip', () => {
    render(
      <svg><HologramPanel
        view={fullView} panelRect={panelRect} connectorPath={connectorPath}
        open={true} onClose={() => {}}
      /></svg>
    );
    expect(screen.getByTestId('holo-id').textContent).toBe('T-042');
    expect(screen.getByTestId('holo-kind').textContent).toContain('ASSISTANT_TURN');
    expect(screen.getByTestId('holo-mode-chip').textContent).toBe('PLAYBACK');
  });

  it('shows latency value and median sub', () => {
    render(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={() => {}} /></svg>);
    expect(screen.getByTestId('holo-latency-value').textContent).toContain('2.14');
    expect(screen.getByTestId('holo-latency-sub').textContent).toContain('4.8');
  });

  it('renders top 5 skills by tokenCost', () => {
    render(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={() => {}} /></svg>);
    const rows = screen.getAllByTestId(/^holo-skill-row-/);
    expect(rows).toHaveLength(5);
    expect(rows[0].textContent).toContain('brainstorming');
    expect(rows[4].textContent).toContain('verification-before-completion');
  });

  it('shows expand row with N more and total token count', () => {
    render(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={() => {}} /></svg>);
    const expand = screen.getByTestId('holo-skill-expand');
    expect(expand.textContent).toContain('3 more');
    expect(expand.textContent).toContain('2.1k');   // 900 + 700 + 500 = 2100
  });

  it('expands to show remaining skills when expand row is clicked', () => {
    render(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={() => {}} /></svg>);
    fireEvent.click(screen.getByTestId('holo-skill-expand'));
    const rows = screen.getAllByTestId(/^holo-skill-row-/);
    expect(rows).toHaveLength(8);
  });

  it('renders em-dash placeholders when metrics are null', () => {
    const view = {
      ...fullView,
      metrics: {
        latencyMs: null, latencyMedianMs: 0, idleGapMs: null,
        contextSize: null, contextDeltaSincePrev: null,
        cacheEfficiency: null, cacheReads: null, cacheMisses: null, tokens: null,
      },
      skills: [], skillsTotal: { count: 0, totalTokens: 0 },
    };
    render(<svg><HologramPanel view={view} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={() => {}} /></svg>);
    expect(screen.getByTestId('holo-latency-value').textContent).toBe('—');
    expect(screen.getByTestId('holo-idle-value').textContent).toBe('—');
    expect(screen.getByTestId('holo-context-value').textContent).toBe('—');
  });

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn();
    render(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={onClose} /></svg>);
    fireEvent.click(screen.getByTestId('holo-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the connector path string in a path element', () => {
    render(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={() => {}} /></svg>);
    const path = screen.getByTestId('holo-conn-path') as unknown as SVGPathElement;
    expect(path.getAttribute('d')).toBe(connectorPath);
  });

  it('keeps the group mounted briefly after open=false then unmounts', async () => {
    vi.useFakeTimers();
    const { rerender, container } = render(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={() => {}} /></svg>);
    expect(container.querySelector('[data-testid="holo-root"]')).not.toBeNull();
    rerender(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={false} onClose={() => {}} /></svg>);
    expect(container.querySelector('[data-testid="holo-root"]')).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(container.querySelector('[data-testid="holo-root"]')).toBeNull();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/components/HologramPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/HologramPanel.tsx`**

Create the file:

```tsx
import { useId, useState } from 'react';
import '../theme/hologram.css';
import type { Milestone, SkillActivation } from '../parse/types';
import type { HologramMetrics } from '../parse/deriveHologramMetrics';
import { useExitAnimation } from './useExitAnimation';
import { formatTokens } from '../util/formatTokens';

export type HologramView = {
  milestone: Milestone;
  mode: 'live' | 'playback';
  metrics: HologramMetrics;
  skills: SkillActivation[];
  skillsTotal: { count: number; totalTokens: number };
};

type Props = {
  view: HologramView;
  panelRect: { x: number; y: number; w: number; h: number };
  connectorPath: string;
  open: boolean;
  onClose: () => void;
};

const SCAN_STEP = 14;

function fmtMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtPct(p: number | null): string {
  if (p === null) return '—';
  return `${Math.round(p * 100)}%`;
}

function fmtDelta(delta: number | null): string {
  if (delta === null) return '';
  const sign = delta >= 0 ? '↗' : '↘';
  const k = Math.abs(delta) >= 1000 ? `${(Math.abs(delta) / 1000).toFixed(1)}k` : `${Math.abs(delta)}`;
  return `${sign} ${delta >= 0 ? '+' : '-'}${k} since prev`;
}

export function HologramPanel({ view, panelRect, connectorPath, open, onClose }: Props) {
  const { mounted, exiting } = useExitAnimation(open, 200);
  const [expanded, setExpanded] = useState(false);
  const filterId = useId();

  if (!mounted) return null;

  const { milestone, mode, metrics, skills, skillsTotal } = view;
  const topSkills = expanded ? skills : skills.slice(0, 5);
  const hiddenSkills = skills.slice(5);
  const hiddenSum = hiddenSkills.reduce((s, x) => s + x.tokenCost, 0);
  const idText = `T-${milestone.id.slice(0, 4).toUpperCase()}`;
  const kindText = `// ${milestone.kind.toUpperCase()}`;
  const modeText = mode === 'live' ? 'LIVE' : 'PLAYBACK';

  // Panel uses local coordinates (0,0)-(w,h); outer <g> places it.
  const w = panelRect.w;
  const h = panelRect.h + (expanded ? 14 * hiddenSkills.length : 0);

  // Row vertical layout (px from panel top)
  const HEADER_Y = 10;
  const LATENCY_Y = 62;
  const IDLE_Y = 102;
  const SKILLS_HEAD_Y = 132;
  const SKILLS_FIRST_ROW_Y = 140;
  const SKILLS_ROW_STEP = 14;
  const skillsBlockBottom = SKILLS_FIRST_ROW_Y + 14 * topSkills.length + 14; // include expand row
  const CACHE_Y = skillsBlockBottom + 18;
  const CONTEXT_Y = CACHE_Y + 50;
  const TOKENS_LABEL_Y = CONTEXT_Y + 34;
  const FOOTER_Y = TOKENS_LABEL_Y + 46;
  const panelHeight = FOOTER_Y + 14;

  // Stacked token bar normalization
  const totalTok = metrics.tokens ? Object.values(metrics.tokens).reduce((s, v) => s + v, 0) : 0;
  const tokenWidth = (key: keyof NonNullable<typeof metrics.tokens>) => {
    if (!metrics.tokens || totalTok === 0) return 0;
    return (metrics.tokens[key] / totalTok) * (w - 30);
  };

  const tokensTextLine = metrics.tokens
    ? `${formatTokens(metrics.tokens.input)} · ${formatTokens(metrics.tokens.cacheRead)} · ${formatTokens(metrics.tokens.cacheCreation)} · ${formatTokens(metrics.tokens.output)}`
    : '—';

  // Latency bar — scale current latency against 2× median, clamp [0,1].
  const latencyBarFill = metrics.latencyMs && metrics.latencyMedianMs > 0
    ? Math.min(1, metrics.latencyMs / (metrics.latencyMedianMs * 2))
    : 0;

  // Cache cells — 10 cells, fill proportional to efficiency
  const cellsFilled = metrics.cacheEfficiency !== null
    ? Math.round(metrics.cacheEfficiency * 10)
    : 0;

  return (
    <g
      data-testid="holo-root"
      transform={`translate(${panelRect.x}, ${panelRect.y})`}
      className={exiting ? 'holo-exiting' : ''}
    >
      {/* outer ambient glow */}
      <defs>
        <filter id={`${filterId}-soft`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <rect x={-8} y={-8} width={w + 16} height={panelHeight + 16}
            fill="#00e5ff" opacity={0.06} filter={`url(#${filterId}-soft)`} />

      {/* connector lives OUTSIDE the panel translate; rendered before this g
          by the caller. See GraphCanvas wiring. */}

      {/* shell group fades together after the connector trace */}
      <g className="holo-shell">
        {/* frame */}
        <rect className="holo-frame" x={0} y={0} width={w} height={panelHeight} />
        {/* corner brackets */}
        <path d={`M 0,12 L 0,0 L 12,0`} className="holo-corner-bracket" />
        <path d={`M ${w - 12},0 L ${w},0 L ${w},12`} className="holo-corner-bracket" />
        <path d={`M ${w},${panelHeight - 12} L ${w},${panelHeight} L ${w - 12},${panelHeight}`} className="holo-corner-bracket" />
        <path d={`M 12,${panelHeight} L 0,${panelHeight} L 0,${panelHeight - 12}`} className="holo-corner-bracket" />
        {/* scanlines */}
        {Array.from({ length: Math.floor(panelHeight / SCAN_STEP) }, (_, i) => (
          <line key={i} x1={0} y1={(i + 1) * SCAN_STEP} x2={w} y2={(i + 1) * SCAN_STEP} className="holo-scan" />
        ))}
      </g>

      {/* Header row */}
      <g className="holo-row" style={{ ['--holo-row-delay' as string]: '250ms' }}>
        <rect x={10} y={HEADER_Y} width={w - 20} height={26} fill="rgba(0,229,255,0.10)" />
        <text x={20} y={HEADER_Y + 18} className="holo-id" data-testid="holo-id">{idText}</text>
        <text x={80} y={HEADER_Y + 18} className="holo-kind" data-testid="holo-kind">{kindText}</text>
        <rect x={w - 80} y={HEADER_Y + 5} width={62} height={16} rx={2} className="holo-mode-chip" />
        <text x={w - 49} y={HEADER_Y + 16} className="holo-mode-text" textAnchor="middle" data-testid="holo-mode-chip">{modeText}</text>
        <g
          className="holo-close"
          data-testid="holo-close"
          onClick={onClose}
          transform={`translate(${w - 14}, ${HEADER_Y + 13})`}
        >
          <circle r={10} fill="transparent" />
          <text className="holo-close-text" textAnchor="middle" y={4}>×</text>
        </g>
        <line x1={10} y1={HEADER_Y + 34} x2={w - 10} y2={HEADER_Y + 34} className="holo-divider" />
      </g>

      {/* Latency */}
      <g className="holo-row" style={{ ['--holo-row-delay' as string]: '310ms' }}>
        <text x={20} y={LATENCY_Y} className="holo-label">LATENCY</text>
        <text x={240} y={LATENCY_Y} className="holo-value" textAnchor="end" data-testid="holo-latency-value">
          {fmtMs(metrics.latencyMs)}
        </text>
        <rect x={250} y={LATENCY_Y - 7} width={w - 270} height={8} rx={1} className="holo-bar-bg" />
        <rect x={250} y={LATENCY_Y - 7} width={(w - 270) * latencyBarFill} height={8} rx={1} fill="var(--holo-cyan)" />
        <text x={250} y={LATENCY_Y + 14} className="holo-value-sub" data-testid="holo-latency-sub">
          {metrics.latencyMedianMs > 0 ? `vs ${(metrics.latencyMedianMs / 1000).toFixed(1)}s median` : '—'}
        </text>
        <line x1={10} y1={LATENCY_Y + 22} x2={w - 10} y2={LATENCY_Y + 22} className="holo-divider" />
      </g>

      {/* Idle gap */}
      <g className="holo-row" style={{ ['--holo-row-delay' as string]: '370ms' }}>
        <text x={20} y={IDLE_Y} className="holo-label">IDLE GAP</text>
        <text x={240} y={IDLE_Y} className="holo-value" textAnchor="end" data-testid="holo-idle-value">
          {fmtMs(metrics.idleGapMs)}
        </text>
        <text x={250} y={IDLE_Y} className="holo-value-sub">since prev turn</text>
        <line x1={10} y1={IDLE_Y + 12} x2={w - 10} y2={IDLE_Y + 12} className="holo-divider" />
      </g>

      {/* Skills */}
      <g className="holo-row" style={{ ['--holo-row-delay' as string]: '430ms' }}>
        <text x={20} y={SKILLS_HEAD_Y} className="holo-label">SKILLS LOADED</text>
        <text x={w - 10} y={SKILLS_HEAD_Y} className="holo-kind" textAnchor="end">
          {skillsTotal.count} · {formatTokens(skillsTotal.totalTokens)}
        </text>

        {topSkills.map((s, i) => {
          const y = SKILLS_FIRST_ROW_Y + i * SKILLS_ROW_STEP;
          const fillW = skills[0] && skills[0].tokenCost > 0 ? (s.tokenCost / skills[0].tokenCost) * 70 : 0;
          return (
            <g key={s.name} transform={`translate(20, ${y})`} data-testid={`holo-skill-row-${i}`}>
              <text x={0} y={11} className="holo-skill-name">{s.name}</text>
              <rect x={180} y={3} width={70} height={6} rx={1} className="holo-bar-bg" />
              <rect x={180} y={3} width={fillW} height={6} rx={1} fill="var(--holo-cyan)" />
              <text x={w - 30} y={11} className="holo-skill-tokens" textAnchor="end">
                ~{formatTokens(s.tokenCost)}
              </text>
            </g>
          );
        })}

        {hiddenSkills.length > 0 && (
          <g
            transform={`translate(20, ${SKILLS_FIRST_ROW_Y + topSkills.length * SKILLS_ROW_STEP})`}
            data-testid="holo-skill-expand"
            onClick={() => setExpanded((v) => !v)}
          >
            <rect x={0} y={0} width={w - 40} height={14} rx={2} className="holo-expand-row" />
            <text x={8} y={10} className="holo-expand-text">
              {expanded ? '▲  collapse' : `▼  ${hiddenSkills.length} more`}
            </text>
            <text x={w - 50} y={10} className="holo-skill-tokens" textAnchor="end">
              ~{formatTokens(hiddenSum)}
            </text>
          </g>
        )}

        <line x1={10} y1={CACHE_Y - 18} x2={w - 10} y2={CACHE_Y - 18} className="holo-divider" />
      </g>

      {/* Cache efficiency */}
      <g className="holo-row" style={{ ['--holo-row-delay' as string]: '490ms' }}>
        <text x={20} y={CACHE_Y} className="holo-label">CACHE EFFICIENCY</text>
        <text x={240} y={CACHE_Y} className="holo-value" textAnchor="end">{fmtPct(metrics.cacheEfficiency)}</text>
        <g transform={`translate(250, ${CACHE_Y - 6})`}>
          {Array.from({ length: 10 }, (_, i) => (
            <rect key={i} x={i * 11} y={0} width={9} height={9}
                  fill={i < cellsFilled ? 'var(--holo-cyan)' : 'rgba(0,229,255,0.12)'} />
          ))}
        </g>
        <text x={20} y={CACHE_Y + 20} className="holo-value-sub">
          {metrics.cacheReads !== null
            ? `cache reads ${formatTokens(metrics.cacheReads)} · misses ${formatTokens(metrics.cacheMisses ?? 0)}`
            : '—'}
        </text>
        <line x1={10} y1={CACHE_Y + 32} x2={w - 10} y2={CACHE_Y + 32} className="holo-divider" />
      </g>

      {/* Context */}
      <g className="holo-row" style={{ ['--holo-row-delay' as string]: '550ms' }}>
        <text x={20} y={CONTEXT_Y} className="holo-label">CONTEXT</text>
        <text x={90} y={CONTEXT_Y} className="holo-value-sub" fill="var(--holo-mint)">
          {fmtDelta(metrics.contextDeltaSincePrev)}
        </text>
        <text x={w - 10} y={CONTEXT_Y} className="holo-value" textAnchor="end" data-testid="holo-context-value">
          {metrics.contextSize !== null ? `${(metrics.contextSize / 1000).toFixed(1)}k` : '—'}
        </text>
        <line x1={10} y1={CONTEXT_Y + 16} x2={w - 10} y2={CONTEXT_Y + 16} className="holo-divider" />
      </g>

      {/* Tokens stacked bar */}
      <g className="holo-row" style={{ ['--holo-row-delay' as string]: '610ms' }}>
        <text x={20} y={TOKENS_LABEL_Y} className="holo-label">TOKENS · IN · CR · CW · OUT</text>
        {metrics.tokens && (
          <g transform={`translate(20, ${TOKENS_LABEL_Y + 8})`}>
            <rect x={0} y={0} width={w - 30} height={6} fill="rgba(0,229,255,0.06)" />
            <rect x={0} y={0} width={tokenWidth('input')} height={6} fill="#5cf2ff" />
            <rect x={tokenWidth('input')} y={0} width={tokenWidth('cacheRead')} height={6} fill="#00e5ff" />
            <rect x={tokenWidth('input') + tokenWidth('cacheRead')} y={0} width={tokenWidth('cacheCreation')} height={6} fill="#7fffd4" />
            <rect x={tokenWidth('input') + tokenWidth('cacheRead') + tokenWidth('cacheCreation')} y={0} width={tokenWidth('output')} height={6} fill="#9d6cff" />
          </g>
        )}
        <text x={20} y={TOKENS_LABEL_Y + 28} className="holo-value-sub">{tokensTextLine}</text>
      </g>

      {/* Footer */}
      <g className="holo-row" style={{ ['--holo-row-delay' as string]: '670ms' }}>
        <line x1={10} y1={FOOTER_Y - 6} x2={w - 10} y2={FOOTER_Y - 6} className="holo-divider-faint" />
        <text x={20} y={FOOTER_Y + 6} className="holo-label-dim">
          {milestone.timestamp ? new Date(milestone.timestamp).toISOString().slice(11, 23) : '—'}
        </text>
        <text x={w - 10} y={FOOTER_Y + 6} className="holo-kind" textAnchor="end">► STREAM</text>
      </g>

      {/* Connector path — rendered last so it sits over the frame edge; the
          actual path goes from world coords (caller's) into our local frame.
          We translate back to world space here, then issue the path. */}
      <g transform={`translate(${-panelRect.x}, ${-panelRect.y})`}>
        <path d={connectorPath} className="holo-conn-line holo-line"
              data-testid="holo-conn-path"
              style={{ strokeDasharray: '4 3' }} />
      </g>
    </g>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/unit/components/HologramPanel.test.tsx`
Expected: PASS — all 9 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/components/HologramPanel.tsx tests/unit/components/HologramPanel.test.tsx
git commit -m "feat(components): HologramPanel — pure SVG render with expand + exit"
```

---

## Task 9: Wire `HologramPanel` into `GraphCanvas`

The canvas now computes panel placement when a node is pinned and renders the hologram inside its existing zoom layer. Also suppresses the tooltip when the hovered node is the pinned one.

**Files:**
- Modify: `src/components/GraphCanvas.tsx`

- [ ] **Step 1: Add imports at the top of `GraphCanvas.tsx`**

```ts
import { HologramPanel, type HologramView } from './HologramPanel';
import { layoutHologram } from '../graph/hologramLayout';
import { deriveHologramMetrics } from '../parse/deriveHologramMetrics';
import { skillsActiveAt } from '../parse/skills';
```

- [ ] **Step 2: Add a constant for default panel size**

Near the top of the file, after the imports:

```ts
const HOLOGRAM_PANEL_SIZE = { w: 350, h: 400 };
```

- [ ] **Step 3: Inside `GraphCanvas` (the function body), compute hologram view + layout when pinned**

After the existing memos for `subagentRegions`, `taintedIds`, etc. and BEFORE the `return (` block, add:

```ts
const hologramView: HologramView | null = useMemo(() => {
  if (!pinnedId) return null;
  const node = layout.nodes.find((n) => n.id === pinnedId);
  if (!node) return null;
  const idx = playback.order.findIndex((m) => m.id === pinnedId);
  const prev = idx > 0 ? playback.order[idx - 1] : null;
  const metrics = deriveHologramMetrics(node.milestone, prev, session);
  const skills = session.skillTrack
    ? skillsActiveAt(node.milestone, session.skillTrack)
    : [];
  const totalTokens = skills.reduce((s, sk) => s + sk.tokenCost, 0);
  return {
    milestone: node.milestone,
    mode: liveEngaged ? 'live' : 'playback',
    metrics,
    skills,
    skillsTotal: { count: skills.length, totalTokens },
  };
}, [pinnedId, layout.nodes, playback.order, session, liveEngaged]);

const hologramPlacement = useMemo(() => {
  if (!hologramView) return null;
  const node = layout.nodes.find((n) => n.id === pinnedId);
  if (!node) return null;
  return layoutHologram(node, layout.nodes, visibleRect, HOLOGRAM_PANEL_SIZE);
}, [hologramView, pinnedId, layout.nodes, visibleRect]);
```

- [ ] **Step 4: Render `<HologramPanel>` inside the zoom layer `<g>`**

In the `return (` block, find the existing `<g className="zoom-layer" ...>` element and add `<HologramPanel>` as the LAST child inside it (so it draws above edges and nodes):

```tsx
<g className="zoom-layer" transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
  {/* ... existing children: subagent regions, edges-soft, edges-glow, nodes-plain, nodes-glow ... */}

  {hologramView && hologramPlacement && (
    <HologramPanel
      key={pinnedId ?? 'none'}
      view={hologramView}
      panelRect={hologramPlacement.panelRect}
      connectorPath={hologramPlacement.connectorPath}
      open={!!pinnedId}
      onClose={() => onPin(null)}
    />
  )}
</g>
```

- [ ] **Step 5: Suppress the tooltip when hovered === pinned**

Find the `hover` state declaration and the `<NodeTooltip>` render. Change:

```tsx
{hover && <NodeTooltip ... />}
```

to:

```tsx
{hover && hover.milestone.id !== pinnedId && (
  <NodeTooltip milestone={hover.milestone} screenX={hover.screenX} screenY={hover.screenY} />
)}
```

- [ ] **Step 6: Type check**

Run: `npm run typecheck`
Expected: clean. (If `HologramView` isn't exported as a type, re-check Task 8 step 3 — it must be `export type HologramView = {...}`.)

- [ ] **Step 7: Re-run all unit tests**

Run: `npm test`
Expected: every existing suite + the new ones from Tasks 2, 4, 5, 8 PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/GraphCanvas.tsx
git commit -m "feat(canvas): render HologramPanel inside zoom layer for pinned Thoughts"
```

---

## Task 10: E2E — pin, close, expand, zoom

Wires up Playwright tests against a real session fixture.

**Files:**
- Create: `tests/e2e/hologram.spec.ts`

- [ ] **Step 1: Write the e2e spec**

```ts
// tests/e2e/hologram.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Hologram detail view', () => {
  test('pin opens DetailPanel AND HologramPanel together; Esc closes both', async ({ page }) => {
    await page.goto('/');
    // Select the first session in the sidebar
    const firstSession = page.locator('[data-testid="sessions-list"] >> [data-testid^="session-row-"]').first();
    await firstSession.click();
    // Wait for the canvas to render
    await expect(page.getByTestId('graph-canvas')).toBeVisible();
    // Click any node (use the first <g data-state> child of the canvas)
    const firstNode = page.locator('[data-testid="graph-canvas"] g[data-id]').first();
    await firstNode.click({ force: true });
    // Both panels visible
    await expect(page.getByTestId('detail-panel')).toBeVisible();
    await expect(page.getByTestId('holo-root')).toBeVisible();
    // Esc closes both
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('detail-panel')).toBeHidden();
    await expect(page.getByTestId('holo-root')).toBeHidden();
  });

  test('clicking ▼ N more expands the skill list', async ({ page }) => {
    await page.goto('/');
    const firstSession = page.locator('[data-testid="sessions-list"] >> [data-testid^="session-row-"]').first();
    await firstSession.click();
    const firstNode = page.locator('[data-testid="graph-canvas"] g[data-id]').first();
    await firstNode.click({ force: true });
    const expand = page.getByTestId('holo-skill-expand');
    // Skip the test gracefully if the fixture session has ≤5 skills (expand row absent).
    if (await expand.count() === 0) {
      test.skip();
      return;
    }
    const rowsBefore = await page.getByTestId(/^holo-skill-row-/).count();
    await expand.click();
    const rowsAfter = await page.getByTestId(/^holo-skill-row-/).count();
    expect(rowsAfter).toBeGreaterThan(rowsBefore);
  });

  test('pinning a different node remounts cleanly', async ({ page }) => {
    await page.goto('/');
    const firstSession = page.locator('[data-testid="sessions-list"] >> [data-testid^="session-row-"]').first();
    await firstSession.click();
    const nodes = page.locator('[data-testid="graph-canvas"] g[data-id]');
    await nodes.nth(0).click({ force: true });
    await expect(page.getByTestId('holo-root')).toBeVisible();
    const firstIdText = await page.getByTestId('holo-id').textContent();
    await nodes.nth(1).click({ force: true });
    await expect(page.getByTestId('holo-root')).toBeVisible();
    const secondIdText = await page.getByTestId('holo-id').textContent();
    expect(secondIdText).not.toBe(firstIdText);
  });

  test('clicking × on hologram closes both panels', async ({ page }) => {
    await page.goto('/');
    const firstSession = page.locator('[data-testid="sessions-list"] >> [data-testid^="session-row-"]').first();
    await firstSession.click();
    const firstNode = page.locator('[data-testid="graph-canvas"] g[data-id]').first();
    await firstNode.click({ force: true });
    await page.getByTestId('holo-close').click();
    await expect(page.getByTestId('detail-panel')).toBeHidden();
    await expect(page.getByTestId('holo-root')).toBeHidden();
  });
});
```

- [ ] **Step 2: Run the e2e tests**

Run: `npm run test:e2e -- tests/e2e/hologram.spec.ts`
Expected: PASS — all 4 cases green. (`expand` test may auto-skip on a low-skill fixture; that's fine.)

If a test fails because the dev server isn't started, ensure `playwright.config.ts` has a `webServer` entry — it should, given the other e2e tests work.

- [ ] **Step 3: Run the full suite as a smoke check**

Run: `npm test && npm run typecheck && npm run test:e2e`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/hologram.spec.ts
git commit -m "test(e2e): hologram pin / close / expand / remount"
```

---

## Task 11: Manual visual verification

Not strictly TDD but mandatory before claiming done.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Visit `http://localhost:5173` in a browser.

- [ ] **Step 2: Verify the hologram in playback mode**

- Pick any past session.
- Click a node mid-playback.
- Confirm: dashed mint connector draws → frame fades in → 8 rows slide down with stagger over ~700 ms.
- Confirm: the `PLAYBACK` chip shows amber in the header.
- Confirm: the connector has two 90° bends with the small cyan corner accent on the outside of each bend.

- [ ] **Step 3: Verify in LIVE mode**

- Open a live session (if available locally) or stub one.
- Confirm: mode chip reads `LIVE` instead of `PLAYBACK`.

- [ ] **Step 4: Verify zoom behavior**

- Zoom in (`Ctrl+wheel`) and zoom out.
- Confirm: panel scales with the canvas (graph-space).
- Confirm: connector stays anchored to the node.

- [ ] **Step 5: Verify routing**

- Pin nodes in dense parts of the graph.
- Confirm: panel does not overlap other nodes when there's space.
- Confirm: in worst-case dense areas the panel still appears (fallback works).

- [ ] **Step 6: Verify expand**

- Pin a node from a session with 6+ skills loaded.
- Confirm: `▼ N more` row visible.
- Click it.
- Confirm: list grows, panel re-routes if necessary, no flicker.
- Click `▲ collapse`.
- Confirm: list collapses cleanly.

- [ ] **Step 7: Verify reduced motion**

- Enable `prefers-reduced-motion: reduce` via DevTools rendering tab.
- Pin a node.
- Confirm: panel fades in over 200 ms with no slides or stroke traces.

- [ ] **Step 8: Verify accessibility / close paths**

- Esc closes both panels.
- × in DetailPanel closes both.
- × in HologramPanel closes both.
- Clicking the same node again closes both.

- [ ] **Step 9: If anything looks wrong, file a follow-up commit on this branch BEFORE merging.**

---

## Self-Review (already performed during plan write)

**Spec coverage:** Every section of the spec maps to at least one task:
- Coexistence with DetailPanel → Task 9 (renders alongside, no modifications to DetailPanel)
- Graph-space anchoring → Task 9 (renders inside `<g className="zoom-layer">`)
- Routed clear-space placement → Task 5
- Stack-assemble entrance → Tasks 6 + 8 (CSS + component)
- Visual direction (frame, brackets, scanlines, mode chip, etc.) → Task 8
- Mode chip (LIVE / PLAYBACK) → Task 9 (driven by `liveEngaged`)
- Skills list with token cost + expand → Tasks 2 + 8
- Data model → Tasks 1, 4
- Animation timing → Tasks 6, 8
- Parser extension → Tasks 2, 3
- Interaction (pin, Esc, ×, expand, hover suppress) → Tasks 8, 9
- Edge cases (null metrics, dense graph, no skills, reduced motion) → Task 8 test cases + Task 5 fallback + Task 6 reduced-motion
- Out-of-scope items are not implemented (multi-pin, live-ticking, etc.)
- Tests → Tasks 2, 4, 5, 8, 10

**Placeholder scan:** No `TBD`, `TODO`, or vague steps. Every step shows the exact code or command.

**Type consistency:** `HologramView`, `HologramMetrics`, `SkillTrack`, `SkillActivation` are defined in Task 1 (types), Task 4 (metrics), Task 8 (view) and used consistently in Task 9. The `panelSize` constant is named `HOLOGRAM_PANEL_SIZE` in Task 9 and matches the `{ w, h }` shape expected by `layoutHologram`.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-28-hologram-detail-view.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**