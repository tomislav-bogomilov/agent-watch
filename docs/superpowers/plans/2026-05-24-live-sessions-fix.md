# Live Sessions — Canvas Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Tasks use checkbox (`- [ ]`) syntax.

**Goal:** Replace the linear-button placeholder in `LivePane` with the actual `GraphCanvas` (existing TRON-styled SVG renderer with `NodeShape` + `EdgePath` + glow filters), camera-follow-latest in every pane, and a fullscreen N=1 case.

**Why this plan exists:** The shipped LivePane renders a flat row of plain HTML buttons styled as circles. The spec called for "the same nodes as the replay canvas." Need to swap in `GraphCanvas` per pane, adapt it for the smaller real-estate (no minimap/legend), and special-case N=1 so it matches the regular session view exactly.

**Architecture:** `GraphCanvas` gains a `compact: boolean` prop that hides the minimap + FIT/FOLLOW buttons (they're either at App-level in LIVE mode, or moot when there's no playback). `LivePane` wraps a `GraphCanvas` instead of rendering its own SVG. A synthetic "fully played" `PlaybackState` is constructed per pane so the existing active-node + camera-follow logic Just Works. When N=1, `LivePanes` short-circuits to a single full-bleed `GraphCanvas` + the App-level `DetailPanel` (visually indistinguishable from looking at a finished session, except no playback gutter).

**Spec reference:** `docs/superpowers/specs/2026-05-24-live-sessions-design.md` (§6 Per-pane structure says "renders that pane's milestone subtree using the existing `NodeShape` / `EdgePath` components and a per-pane `useCamera`" — implementation deviated by inlining a simplified linear layout).

---

## File map

**Modified:**

| File | Change |
|---|---|
| `src/components/GraphCanvas.tsx` | Add `compact?: boolean` prop. When true: hide Minimap, hide FIT/FOLLOW. |
| `src/components/live/LivePane.tsx` | Replace inline canvas with embedded `<GraphCanvas compact session=… playback=… />`. Keep cut-corner border, header, embedded right detail, optional countdown chip. |
| `src/components/live/LivePanes.tsx` | N=1 short-circuit: render `<GraphCanvas session=… playback=… />` directly (no cut-corner border, no embedded detail). N≥2: existing grid + LivePane per item. Sub-agent pane root = the `subagent_spawn` node itself (children[1+] of the spawn collapsed; pane shows spawn + its inner subtree). |
| `src/App.tsx` | When LIVE engaged & N=1, the App-level `DetailPanel` shows the pane's pinned-or-newest milestone. Wire that through. |

**New:**

| File | Responsibility |
|---|---|
| `src/components/live/livePlayback.ts` | Pure helper `makeLivePlayback(root: Milestone): PlaybackState` — returns a synthetic playback positioned at the last node (`index = order.length - 1`, `edgeProgress = 1`, `playing = false`). |
| `src/components/live/extractSubagentPaneRoot.ts` | Helpers to construct a synthetic Session-shaped object for a sub-agent pane: root = the `subagent_spawn` node (kept as a single visible node) with `children` set to the sub-agent's inner subtree (children[0] of the original spawn). Throws nothing for partial parses — returns null. |
| `tests/unit/live/livePlayback.test.ts` | Unit test for `makeLivePlayback`. |
| `tests/unit/live/extractSubagentPaneRoot.test.ts` | Unit test for the sub-agent root builder. |
| `tests/unit/components/LivePane.test.tsx` (rewrite) | Drop the now-obsolete `live-pane-node-{id}` button assertion. New assertions: GraphCanvas mounts inside the pane, the pane's detail panel shows the newest milestone's label, click-to-pin still holds. |
| `tests/unit/components/LivePanes.test.tsx` (update) | New assertion: at N=1, the cut-corner border is NOT rendered (use a distinct test id on the LivePane wrapper). Existing transitions still pass. |

---

## Task 1: `GraphCanvas` `compact` prop — hide minimap and FIT/FOLLOW

**Files:**
- Modify: `src/components/GraphCanvas.tsx`

- [ ] **Step 1: Add `compact` to `Props`**

Open `src/components/GraphCanvas.tsx`. Find the `Props` type. Add:

```ts
compact?: boolean;
```

In the destructuring on the `export function GraphCanvas(...)` signature, add `compact = false,` to the destructured list.

- [ ] **Step 2: Gate the Minimap render**

Find the `<Minimap …/>` block near the bottom of the SVG return. Wrap with `{!compact && (...)}`:

```tsx
{!compact && (
  <Minimap
    layout={layout}
    transform={transform}
    viewport={viewport}
    currentLayoutPoint={currentId ? layout.nodes.find((n) => n.id === currentId) ?? null : null}
    onJump={(pt) => centerOn(pt, transform.k)}
    onPan={(pt) => centerOn(pt, transform.k, { animate: false })}
    onZoom={(pt, k) => centerOn(pt, k, { animate: false })}
  />
)}
```

- [ ] **Step 3: Gate the FIT button**

Find the `<button data-testid="fit-button" …>FIT</button>` block. Wrap with `{!compact && (...)}`:

```tsx
{!compact && (
  <button
    data-testid="fit-button"
    onClick={() => fit()}
    style={{
      position: 'absolute', top: 12, right: 12, zIndex: 6,
      background: 'rgba(5,8,13,0.85)', border: '1px solid var(--edge-idle)',
      color: 'var(--text)', padding: '2px 8px', cursor: 'pointer',
      fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: 2,
      height: 20, boxSizing: 'border-box',
    }}
    title="fit (F)"
  >FIT</button>
)}
```

- [ ] **Step 4: Gate the FOLLOW button**

Find the existing FOLLOW gate `{!liveEngaged && (...)}` block. Tighten it to `{!liveEngaged && !compact && (...)}`:

```tsx
{!liveEngaged && !compact && (
  <button
    data-testid="follow-toggle"
    ...
  >FOLLOW</button>
)}
```

- [ ] **Step 5: Typecheck + tests**

Run: `npm run typecheck && npm test && npm run test:e2e`
Expected: all green (existing tests don't pass `compact`, so it defaults to false; no behavior change for them).

- [ ] **Step 6: Commit**

```bash
git add src/components/GraphCanvas.tsx
git commit -m "feat(canvas): compact prop hides minimap and FIT/FOLLOW buttons"
```

---

## Task 2: `makeLivePlayback` helper

**Files:**
- Create: `src/components/live/livePlayback.ts`
- Create: `tests/unit/live/livePlayback.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/live/livePlayback.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeLivePlayback } from '../../../src/components/live/livePlayback';
import type { Milestone } from '../../../src/parse/types';

function m(id: string, children: Milestone[] = []): Milestone {
  return { id, kind: 'tool_call', label: id, summary: '', timestamp: '', failed: false, raw: null, children };
}

describe('makeLivePlayback', () => {
  it('returns a playback state positioned at the last DFS node', () => {
    const root = m('a', [m('b', [m('c')])]);
    const pb = makeLivePlayback(root);
    expect(pb.order.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(pb.index).toBe(2);
    expect(pb.edgeProgress).toBe(1);
    expect(pb.playing).toBe(false);
    expect(pb.finished).toBe(true);
  });

  it('handles a single-node tree', () => {
    const root = m('a');
    const pb = makeLivePlayback(root);
    expect(pb.index).toBe(0);
    expect(pb.edgeProgress).toBe(1);
    expect(pb.finished).toBe(true);
  });
});
```

- [ ] **Step 2: Verify red**

Run: `npm test -- livePlayback`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/components/live/livePlayback.ts`:

```ts
import { flattenDFS } from '../../playback/usePlayback';
import type { PlaybackState } from '../../playback/usePlayback';
import type { Milestone } from '../../parse/types';

/**
 * In LIVE mode there is no playback — we always show every milestone we've
 * received so far, with the most recent one as the "active" node. This helper
 * synthesizes a PlaybackState that the existing GraphCanvas rendering can
 * consume: every node is past the current position, edges are fully drawn,
 * and `index` points at the last node so the camera-follow logic centers on
 * the live tip.
 */
export function makeLivePlayback(root: Milestone): PlaybackState {
  const order = flattenDFS(root);
  const lastIndex = Math.max(0, order.length - 1);
  return {
    order,
    index: lastIndex,
    edgeProgress: 1,
    playing: false,
    speed: 1,
    finished: true,
  };
}
```

- [ ] **Step 4: Verify green**

Run: `npm test -- livePlayback`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/live/livePlayback.ts tests/unit/live/livePlayback.test.ts
git commit -m "feat(live): makeLivePlayback synthesizes a fully-played PlaybackState"
```

---

## Task 3: `extractSubagentPaneRoot` helper

**Files:**
- Create: `src/components/live/extractSubagentPaneRoot.ts`
- Create: `tests/unit/live/extractSubagentPaneRoot.test.ts`

Sub-agent panes show the spawn node + the sub-agent's inner subtree. The spawn's `children[0]` is the sub-agent's inner root; we want a single tree rooted at the spawn whose children are just that inner subtree.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/live/extractSubagentPaneRoot.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractSubagentPaneRoot } from '../../../src/components/live/extractSubagentPaneRoot';
import type { Milestone } from '../../../src/parse/types';

function m(id: string, kind: Milestone['kind'], children: Milestone[] = []): Milestone {
  return { id, kind, label: id, summary: '', timestamp: '', failed: false, raw: null, children };
}

describe('extractSubagentPaneRoot', () => {
  it('returns a Milestone rooted at the spawn with the inner subtree as its only child branch', () => {
    const innerRoot = m('s1', 'assistant_turn', [m('s2', 'tool_call')]);
    const mainAfter = m('after', 'assistant_turn');
    const spawn = m('spawn', 'subagent_spawn', [innerRoot, mainAfter]);
    const root = extractSubagentPaneRoot(spawn);
    expect(root).not.toBeNull();
    expect(root!.id).toBe('spawn');
    expect(root!.children).toHaveLength(1);
    expect(root!.children[0].id).toBe('s1');
    expect(root!.children[0].children[0].id).toBe('s2');
  });

  it('returns null if the spawn has no inner subtree yet', () => {
    const spawn = m('spawn', 'subagent_spawn', []);
    expect(extractSubagentPaneRoot(spawn)).toBeNull();
  });
});
```

- [ ] **Step 2: Verify red**

Run: `npm test -- extractSubagentPaneRoot`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/components/live/extractSubagentPaneRoot.ts`:

```ts
import type { Milestone } from '../../parse/types';

/**
 * Build the root milestone for a sub-agent pane: the spawn node itself, with
 * its children replaced by [sub-agent-inner-root]. The spawn's children[1+]
 * (the main agent's continuation) is dropped here — that lives in MAIN.
 *
 * Returns null when the spawn has no inner subtree attached yet (partial
 * mid-write parse) so the caller can skip rendering the pane until the next
 * refetch.
 */
export function extractSubagentPaneRoot(spawn: Milestone): Milestone | null {
  if (spawn.kind !== 'subagent_spawn') return null;
  const inner = spawn.children[0];
  if (!inner) return null;
  return { ...spawn, children: [inner] };
}
```

- [ ] **Step 4: Verify green**

Run: `npm test -- extractSubagentPaneRoot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/live/extractSubagentPaneRoot.ts tests/unit/live/extractSubagentPaneRoot.test.ts
git commit -m "feat(live): extractSubagentPaneRoot helper for sub-agent pane content"
```

---

## Task 4: Rewrite `LivePane` to embed `GraphCanvas`

**Files:**
- Modify: `src/components/live/LivePane.tsx`
- Modify: `tests/unit/components/LivePane.test.tsx`

- [ ] **Step 1: Replace the LivePane implementation**

Replace the entire contents of `src/components/live/LivePane.tsx` with:

```tsx
import { useMemo, useState, type CSSProperties } from 'react';
import { GraphCanvas } from '../GraphCanvas';
import { CountdownChip } from './CountdownChip';
import { makeLivePlayback } from './livePlayback';
import type { Session, Milestone } from '../../parse/types';
import type { Filters } from '../FilterToggles';

type Props = {
  kind: 'main' | 'subagent';
  label: string;
  /** A standalone Milestone tree this pane renders. For MAIN: the full main-agent trail's root. For subagent panes: spawn + inner subtree (see extractSubagentPaneRoot). */
  root: Milestone;
  cwd: string;
  /** Used for the synthetic Session. Any string is fine — distinguishes panes for the camera + layout cache. */
  paneId: string;
  closingSeconds?: number | null;
  frozen?: boolean;
  onToggleFreeze?: () => void;
};

const ALL_FILTERS: Filters = { hidePruned: false, hideSubagents: false, successOnly: false, showAllContext: false };

const wrapper: CSSProperties = {
  position: 'relative',
  background: '#050810',
  overflow: 'hidden',
  display: 'flex',
  clipPath:
    'polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px),'
    + ' calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px)',
};

function notchStyle(corner: 'tl'|'tr'|'bl'|'br', color: string): CSSProperties {
  const polygons = {
    tl: 'polygon(0 0, 100% 0, 0 100%)',
    tr: 'polygon(0 0, 100% 0, 100% 100%)',
    bl: 'polygon(0 0, 0 100%, 100% 100%)',
    br: 'polygon(100% 0, 100% 100%, 0 100%)',
  };
  const pos: CSSProperties = corner === 'tl' ? { top: 0, left: 0 }
    : corner === 'tr' ? { top: 0, right: 0 }
    : corner === 'bl' ? { bottom: 0, left: 0 }
    : { bottom: 0, right: 0 };
  return {
    position: 'absolute', width: 12, height: 12,
    background: color, boxShadow: `0 0 6px ${color}`,
    clipPath: polygons[corner], pointerEvents: 'none', zIndex: 3,
    ...pos,
  };
}

const headerStyle = (color: string): CSSProperties => ({
  position: 'absolute', top: 0, left: 0, right: 0, height: 22,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '0 14px',
  background: 'linear-gradient(rgba(5,8,13,0.95), rgba(5,8,13,0.5))',
  borderBottom: '1px solid rgba(110,224,238,0.08)',
  fontSize: 9, letterSpacing: 2, color,
  fontFamily: 'ui-monospace, monospace',
  zIndex: 5, pointerEvents: 'none',
});

const canvasHost: CSSProperties = {
  flex: 1, minWidth: 0, position: 'relative',
  paddingTop: 22,
};

const detailStyle: CSSProperties = {
  width: '36%', minWidth: 160, flexShrink: 0,
  borderLeft: '1px solid rgba(110,224,238,0.18)',
  background: 'rgba(5,8,13,0.92)',
  padding: '24px 12px 12px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11, color: '#d4e9f0',
  overflow: 'auto',
  position: 'relative', zIndex: 4,
};

function collectSubagentIds(root: Milestone): Set<string> {
  const ids = new Set<string>();
  function walk(node: Milestone, inSub: boolean): void {
    if (inSub) ids.add(node.id);
    if (node.kind === 'subagent_spawn' && node.children.length >= 1) {
      walk(node.children[0], true);
      if (node.children[1]) walk(node.children[1], inSub);
      return;
    }
    for (const c of node.children) walk(c, inSub);
  }
  walk(root, false);
  return ids;
}

export function LivePane({ kind, label, root, cwd, paneId, closingSeconds, frozen, onToggleFreeze }: Props) {
  const accent = kind === 'main' ? '#00e5ff' : '#b894ff';
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  const session: Session = useMemo(() => ({
    id: paneId,
    cwd,
    startedAt: '',
    root,
    successPath: new Set<string>(),
    totalMilestones: 0,
    subagentMtimes: {},
  }), [paneId, cwd, root]);

  const playback = useMemo(() => makeLivePlayback(root), [root]);
  const subagentIds = useMemo(() => collectSubagentIds(root), [root]);

  const newest = playback.order[playback.index] ?? null;
  const selected = (pinnedId ? playback.order.find((m) => m.id === pinnedId) : null) ?? newest;

  return (
    <div
      data-testid="live-pane"
      style={{
        ...wrapper,
        animation: `${kind === 'main' ? 'paneBreathe' : 'subBreathe'} 3.5s ease-in-out infinite`,
      }}
    >
      <span style={notchStyle('tl', accent)} />
      <span style={notchStyle('tr', accent)} />
      <span style={notchStyle('bl', accent)} />
      <span style={notchStyle('br', accent)} />

      <div style={canvasHost}>
        <div style={headerStyle(accent)}>
          <span>{label}</span>
          <span style={{ color: '#6e95a5' }}>{newest?.summary ?? ''}</span>
        </div>

        <GraphCanvas
          session={session}
          playback={playback}
          subagentIds={subagentIds}
          pinnedId={pinnedId}
          onPin={setPinnedId}
          onScrubTo={() => { /* no playback in LIVE mode */ }}
          filters={ALL_FILTERS}
          liveEngaged={true}
          compact={true}
        />

        {closingSeconds != null && onToggleFreeze && (
          <CountdownChip
            seconds={closingSeconds}
            frozen={frozen ?? false}
            onToggleFreeze={onToggleFreeze}
          />
        )}
      </div>

      <aside data-testid="live-pane-detail" style={detailStyle}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: accent, marginBottom: 6 }}>
          {kind === 'main' ? 'MAIN · NODE' : 'SUBAGENT · NODE'}
        </div>
        {selected && (
          <>
            <div style={{ fontSize: 11, color: '#d4e9f0', marginBottom: 4 }}>{selected.label}</div>
            <div style={{ fontSize: 10, color: '#6e95a5' }}>{selected.summary}</div>
            {selected.result && (
              <div style={{ fontSize: 10, color: selected.failed ? 'var(--node-failed)' : '#6e95a5', marginTop: 6, whiteSpace: 'pre-wrap' }}>{selected.result}</div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
```

Key shape change: prop renamed from `milestones: Milestone[]` to `root: Milestone` + new `cwd`, `paneId`. LivePanes (Task 5) passes the new shape.

- [ ] **Step 2: Rewrite the LivePane unit test**

Replace `tests/unit/components/LivePane.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LivePane } from '../../../src/components/live/LivePane';
import type { Milestone } from '../../../src/parse/types';

function m(id: string, label: string, summary = '', children: Milestone[] = []): Milestone {
  return { id, kind: 'tool_call', label, summary, timestamp: '2026-05-24T12:00:00Z', failed: false, raw: null, children };
}

describe('LivePane', () => {
  it('renders the pane header label', () => {
    const root = m('a', 'Read App.tsx', 'first');
    render(<LivePane kind="main" label="MAIN" root={root} cwd="/c" paneId="p1" />);
    expect(screen.getByTestId('live-pane').textContent).toContain('MAIN');
  });

  it('renders a GraphCanvas SVG (not the old linear button row)', () => {
    const root = m('a', 'Read App.tsx', 'first', [m('b', 'Grep', 'newest')]);
    const { container } = render(<LivePane kind="main" label="MAIN" root={root} cwd="/c" paneId="p1" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders the countdown chip when status indicates closing', () => {
    const root = m('a', 'x');
    const onFreeze = vi.fn();
    render(
      <LivePane
        kind="subagent" label="SUBAGENT abc12345"
        root={root} cwd="/c" paneId="p2"
        closingSeconds={24} frozen={false} onToggleFreeze={onFreeze}
      />
    );
    expect(screen.getByTestId('countdown-chip')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- LivePane`
Expected: PASS — 3 tests.

- [ ] **Step 4: Commit**

```bash
git add src/components/live/LivePane.tsx tests/unit/components/LivePane.test.tsx
git commit -m "feat(live): LivePane embeds GraphCanvas; remove linear-button placeholder"
```

---

## Task 5: Update `LivePanes` — feed new LivePane shape + N=1 fullscreen

**Files:**
- Modify: `src/components/live/LivePanes.tsx`
- Modify: `tests/unit/components/LivePanes.test.tsx`

- [ ] **Step 1: Replace `LivePanes` to pass the new shape**

Open `src/components/live/LivePanes.tsx`. Replace the entire file with:

```tsx
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Session, Milestone } from '../../parse/types';
import { LivePane } from './LivePane';
import { extractMainTrail } from './extractMainTrail';
import { extractSubagentPaneRoot } from './extractSubagentPaneRoot';
import { subagentLabel } from './subagentLabel';
import { nextPaneStatus, remainingSeconds, type PaneState } from './paneStatus';
import { TICK_MS, CLOSING_MS } from './liveness';
import { GraphCanvas } from '../GraphCanvas';
import { makeLivePlayback } from './livePlayback';
import type { Filters } from '../FilterToggles';

type Props = {
  session: Session;
  subagentMtimes: Record<string, string>;
};

const ALL_FILTERS: Filters = { hidePruned: false, hideSubagents: false, successOnly: false, showAllContext: false };

const gridStyle = (n: number): CSSProperties => ({
  flex: 1,
  display: 'grid',
  gridTemplateColumns: n === 1 ? '1fr' : '1fr 1fr',
  gap: 1,
  background: 'rgba(110,224,238,0.10)',
  minHeight: 0,
});

const fullscreenStyle: CSSProperties = {
  flex: 1, minHeight: 0, position: 'relative',
};

const lastSpanStyle: CSSProperties = { gridColumn: 'span 2' };

/** Returns each subagent_spawn node in the tree (DFS order). */
function collectSpawnNodes(root: Milestone): Milestone[] {
  const out: Milestone[] = [];
  function walk(n: Milestone): void {
    if (n.kind === 'subagent_spawn') out.push(n);
    for (const c of n.children) walk(c);
  }
  walk(root);
  return out;
}

/** Build a synthetic Milestone tree for the MAIN pane: the original root with sub-agent inner subtrees stripped (each subagent_spawn becomes a leaf — no children). */
function buildMainRoot(root: Milestone): Milestone {
  function rebuild(node: Milestone): Milestone {
    if (node.kind === 'subagent_spawn') {
      // Drop the inner subtree (children[0]). Keep children[1+] (main continuation).
      return { ...node, children: node.children.slice(1).map(rebuild) };
    }
    return { ...node, children: node.children.map(rebuild) };
  }
  return rebuild(root);
}

function collectSubagentIds(root: Milestone): Set<string> {
  const ids = new Set<string>();
  function walk(node: Milestone, inSub: boolean): void {
    if (inSub) ids.add(node.id);
    if (node.kind === 'subagent_spawn' && node.children.length >= 1) {
      walk(node.children[0], true);
      if (node.children[1]) walk(node.children[1], inSub);
      return;
    }
    for (const c of node.children) walk(c, inSub);
  }
  walk(root, false);
  return ids;
}

export function LivePanes({ session, subagentMtimes }: Props) {
  // MAIN trail without sub-agent inner content
  const mainRoot = useMemo(() => buildMainRoot(session.root), [session]);

  // Sub-agent panes: one per spawn node, keyed by spawn id
  const spawnNodes = useMemo(() => collectSpawnNodes(session.root), [session]);
  const subagentEntries = useMemo(() => {
    return spawnNodes
      .map((spawn) => {
        const root = extractSubagentPaneRoot(spawn);
        return root ? { key: `spawn:${spawn.id}`, spawnId: spawn.id, root } : null;
      })
      .filter((x): x is { key: string; spawnId: string; root: Milestone } => x !== null);
  }, [spawnNodes]);

  // Alphabetical pairing v1 (per the spec follow-up note).
  const fileIds = useMemo(() => Object.keys(subagentMtimes).sort(), [subagentMtimes]);
  const keyToFileId = useMemo(() => {
    const map = new Map<string, string>();
    subagentEntries.forEach((e, i) => { if (fileIds[i]) map.set(e.key, fileIds[i]); });
    return map;
  }, [subagentEntries, fileIds]);

  const [statusMap, setStatusMap] = useState<Record<string, PaneState>>({});
  const [nowMs, setNowMs] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    setStatusMap((prev) => {
      const next: Record<string, PaneState> = {};
      for (const e of subagentEntries) {
        const fileId = keyToFileId.get(e.key);
        const mtimeIso = fileId ? subagentMtimes[fileId] : undefined;
        const lastUpdatedMs = mtimeIso ? new Date(mtimeIso).getTime() : nowMs;
        const prevState: PaneState = prev[e.key] ?? {
          status: 'active', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null,
        };
        next[e.key] = nextPaneStatus(prevState, lastUpdatedMs, nowMs);
      }
      return next;
    });
  }, [nowMs, subagentEntries, keyToFileId, subagentMtimes]);

  const displayable = subagentEntries.filter((e) => statusMap[e.key]?.status !== 'closed');
  const total = 1 + displayable.length;

  function freezeToggle(key: string): void {
    setStatusMap((prev) => {
      const s = prev[key];
      if (!s) return prev;
      if (s.status === 'frozen') {
        const newClosingStartedAt = nowMs - (CLOSING_MS - (s.frozenRemainingMs ?? CLOSING_MS));
        return { ...prev, [key]: { ...s, status: 'closing', frozenAt: null, frozenRemainingMs: null, closingStartedAt: newClosingStartedAt } };
      }
      if (s.status === 'closing') {
        const elapsed = nowMs - (s.closingStartedAt ?? nowMs);
        const remaining = Math.max(0, CLOSING_MS - elapsed);
        return { ...prev, [key]: { ...s, status: 'frozen', frozenAt: nowMs, frozenRemainingMs: remaining } };
      }
      return prev;
    });
  }

  // N=1 fullscreen short-circuit — render GraphCanvas directly with no cut-corner border.
  if (total === 1) {
    const mainPlayback = makeLivePlayback(mainRoot);
    const mainSession: Session = { ...session, root: mainRoot, totalMilestones: mainPlayback.order.length };
    const subagentIds = collectSubagentIds(mainRoot);
    return (
      <div data-testid="live-panes-grid" data-n={1} data-fullscreen="true" style={fullscreenStyle}>
        <GraphCanvas
          session={mainSession}
          playback={mainPlayback}
          subagentIds={subagentIds}
          pinnedId={null}
          onPin={() => { /* App-level detail panel takes over at N=1 */ }}
          onScrubTo={() => { /* no playback in LIVE */ }}
          filters={ALL_FILTERS}
          liveEngaged={true}
          compact={false}
        />
      </div>
    );
  }

  // N≥2: cut-corner pane grid.
  return (
    <div data-testid="live-panes-grid" data-n={total} style={gridStyle(total)}>
      <LivePane kind="main" label="MAIN" root={mainRoot} cwd={session.cwd} paneId="main" />
      {displayable.map((e, idx) => {
        const isLastOdd = total % 2 === 1 && idx === displayable.length - 1;
        const fileId = keyToFileId.get(e.key) ?? e.key;
        const status = statusMap[e.key];
        const closingSeconds = status ? remainingSeconds(status, nowMs) : null;
        const frozen = status?.status === 'frozen';
        const showCountdown = status && (status.status === 'closing' || status.status === 'frozen');
        return (
          <div key={e.key} style={isLastOdd ? lastSpanStyle : undefined}>
            <LivePane
              kind="subagent"
              label={subagentLabel(fileId)}
              root={e.root}
              cwd={session.cwd}
              paneId={e.key}
              closingSeconds={showCountdown ? closingSeconds : null}
              frozen={frozen}
              onToggleFreeze={() => freezeToggle(e.key)}
            />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Update the LivePanes unit test**

Open `tests/unit/components/LivePanes.test.tsx`. Locate the existing test that asserts `expect(panes).toHaveLength(1)` for the N=1 case. The new behavior is: at N=1, no `live-pane` is rendered — instead a fullscreen GraphCanvas mounts. Update the assertion:

```ts
it('renders just MAIN fullscreen when there are no sub-agents (N=1)', () => {
  const session = makeSession([m('a')], []);
  render(<LivePanes session={session} subagentMtimes={{}} />);
  // At N=1, no LivePane wrapper — directly a fullscreen grid container.
  expect(screen.queryByTestId('live-pane')).toBeNull();
  const grid = screen.getByTestId('live-panes-grid');
  expect(grid.getAttribute('data-n')).toBe('1');
  expect(grid.getAttribute('data-fullscreen')).toBe('true');
});
```

The other two tests (N=3 grid layout, sub-agent finish flow) should still pass — the only behavioral change is the N=1 short-circuit.

For the third test ("transitions sub-agent pane to closing after 60s…"), the `expect(screen.queryByTestId('countdown-chip')).toBeNull()` initial assertion stays valid (active sub-agent doesn't yet show a chip). The subsequent assertions about `getAllByTestId('live-pane')` should still resolve since N=2 throughout.

Actually note: the third test starts with 1 main + 1 subagent = N=2. After `advanceTimersByTime(31_000 + 31_000)`, sub-agent goes closed → N=1 (MAIN only). The final assertion `expect(screen.getAllByTestId('live-pane')).toHaveLength(1)` now FAILS because at N=1 we don't render LivePane. Update it:

```ts
// Advance another 31s — pane should be gone (now fullscreen MAIN, no LivePane wrapper)
act(() => { vi.advanceTimersByTime(31_000); });
rerender(<LivePanes session={session} subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }} />);
expect(screen.queryByTestId('live-pane')).toBeNull();
expect(screen.getByTestId('live-panes-grid').getAttribute('data-n')).toBe('1');
```

Re-read the whole test file before editing to make sure you understand the existing structure.

- [ ] **Step 3: Run tests**

Run: `npm test -- LivePanes`
Expected: 3/3 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/live/LivePanes.tsx tests/unit/components/LivePanes.test.tsx
git commit -m "feat(live): LivePanes uses real GraphCanvas; N=1 fullscreen short-circuit"
```

---

## Task 6: Sweep — e2e + manual

- [ ] **Step 1: Full test sweep**

Run: `npm run typecheck && npm test && npm run test:e2e`
Expected: all green.

If the e2e `live-session-tag.spec.ts` test 2 (auto-engage opens multi-pane) still asserts `[data-testid="live-panes-grid"]`, it'll pass — that data-testid is unchanged. The test does NOT depend on the inner LivePane structure.

If any e2e fails, investigate and fix. Don't move on with red.

- [ ] **Step 2: Manual dev verification**

Run: `npm run dev`. Touch a session jsonl to make it live (e.g., `touch ~/.claude/projects/<project-id>/<session-id>.jsonl`). In the app:

1. Card pulses LIVE.
2. Open the live session — multi-pane view appears IF it has sub-agents, OR fullscreen real-canvas view IF only MAIN.
3. Confirm the nodes look identical to the regular replay canvas (TRON SVG with glow, halos, edges).
4. Camera centers on the newest node.
5. New milestones arriving → camera follows.
6. Sub-agent pane (when one exists): shows the spawn node + inner subtree in its own pane.

If the manual smoke reveals anything off (e.g., camera not following, layout wrong), iterate before declaring done.

- [ ] **Step 3: Final commit if needed**

If you made fixes during the manual sweep, commit them descriptively.

---

## Self-review

- **All spec sections still covered?** Yes — §6 "renders that pane's milestone subtree using the existing `NodeShape` / `EdgePath` components" is now actually true (via GraphCanvas reuse).
- **No placeholders.** Every code block is complete.
- **Type consistency.** `Filters`, `Session`, `PlaybackState`, `Milestone` all stable across tasks.
- **N=1 behavior matches user's requirement:** "same as if we're looking at a finished session" — fullscreen GraphCanvas with no cut-corner border. App-level `DetailPanel` continues to work via existing wiring.
- **Sub-agent pane root** = spawn + inner subtree (user explicitly confirmed).
- **Camera-follow-latest** falls out naturally: `makeLivePlayback` sets `index = lastIndex`, and `useCamera`'s existing follow logic re-centers on the active node whenever index changes.

## Execution Handoff

**Plan saved to `docs/superpowers/plans/2026-05-24-live-sessions-fix.md`.**

Recommended execution: subagent-driven (same as last time).
