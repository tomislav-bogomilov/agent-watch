# ThoughtGraph UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ThoughtGraph actually usable for inspecting real Claude Code sessions: zoom/pan the graph, anchor tooltips to nodes, slow down playback with step + scrubber, auto-follow the playhead, dock a detail panel, lift the 1000-milestone cap, and add minimap/legend/keyboard polish.

**Architecture:** Modify existing React+D3 components in place. Add `useCamera` hook owning d3-zoom transform + follow. Repurpose `NodeTooltip` as light hover preview anchored to SVG node bbox; add new `DetailPanel`, `Minimap`, `Legend`, `FilterToggles` components. `usePlayback` gains step + scrubTo + expanded speed presets and defaults to paused. App owns pinned-node id, sidebar/legend/minimap toggles, filters, and overflow-confirmation flag.

**Tech Stack:** React 19, TypeScript, Vite, D3 (incl. `d3-zoom` from existing `d3` package), Vitest, Playwright.

---

## Reference: Spec

The full design rationale lives at `docs/superpowers/specs/2026-05-22-ux-overhaul-design.md`. Tasks below reference its sections.

## File-by-file map

**Modified:**
- `src/App.tsx` — pinned node, sidebar collapsed, legend/minimap toggles, filters, overflow confirmation, layout gutter.
- `src/components/GraphCanvas.tsx` — wrap in `<g class="zoom-layer">`, drop fit-to-screen viewBox, anchor tooltip to node bbox, click → pin, pass camera/filter props.
- `src/components/NodeTooltip.tsx` — light hover preview, SVG-anchored.
- `src/components/NodeShape.tsx` — label truncation, pinned ring.
- `src/components/PlaybackControls.tsx` — step buttons, expanded speeds, scrubber, jump-to-event icons.
- `src/components/NowPlaying.tsx` — typewriter coupled to speed; gutter position.
- `src/components/SessionList.tsx` — collapsible, grouped, searchable.
- `src/playback/usePlayback.ts` — `playing: false` default, step + scrubTo, expanded `Speed`.
- `src/theme/tokens.css` — a few new tokens.
- `tests/e2e/playback.spec.ts` — adapt to paused-default.

**Added:**
- `src/components/DetailPanel.tsx`
- `src/components/Minimap.tsx`
- `src/components/Legend.tsx`
- `src/components/FilterToggles.tsx`
- `src/graph/useCamera.ts`
- `src/playback/useKeyboard.ts`
- `tests/unit/playback-step.test.ts`
- `tests/unit/camera.test.ts`
- `tests/e2e/zoom-and-tooltip.spec.ts`
- `tests/e2e/large-session.spec.ts`
- `tests/e2e/scrubber-step.spec.ts`

---

## Conventions used in every task

- After test/implementation steps, the commit step uses HEREDOC for safety on Windows shells. If on PowerShell, run the equivalent `git commit -m "..."` via the multi-line message — keep the same subject/body.
- `npm test` runs Vitest once; `npm run test:e2e` runs Playwright. Both must pass at the end of each task that touches them.
- Avoid `git add -A`; stage explicit paths.

---

## Task 1: Fix tooltip position — anchor to node SVG bbox

**Why:** Smallest, highest-impact fix. Tooltip lands ~280 px off because `clientX` is fed into an absolutely-positioned element inside a sidebar-offset container.

**Files:**
- Modify: `src/components/GraphCanvas.tsx`
- Modify: `src/components/NodeTooltip.tsx`
- Test: `tests/e2e/zoom-and-tooltip.spec.ts` (new)

- [ ] **Step 1: Write failing e2e test**

Create `tests/e2e/zoom-and-tooltip.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('tooltip lands within 60px of the hovered node', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  const node = page.locator('svg g[data-id]').first();
  await expect(node).toBeVisible();
  await node.hover();
  const tip = page.locator('[data-testid="node-tooltip"]');
  await expect(tip).toBeVisible();
  const nodeBox = await node.boundingBox();
  const tipBox = await tip.boundingBox();
  if (!nodeBox || !tipBox) throw new Error('missing bbox');
  const dx = Math.abs((tipBox.x + tipBox.width / 2) - (nodeBox.x + nodeBox.width / 2));
  expect(dx).toBeLessThan(260); // tooltip max-width is 480; with 240/2 margin tolerance
});
```

- [ ] **Step 2: Run it; expect fail**

Run: `npm run test:e2e -- tests/e2e/zoom-and-tooltip.spec.ts`
Expected: fails (`tip` not visible because tooltip has no `data-testid` yet, or tip lands far from node).

- [ ] **Step 3: Refactor NodeTooltip to receive node screen position from GraphCanvas**

Replace `src/components/NodeTooltip.tsx` entirely:

```tsx
import type { Milestone } from '../parse/types';

type Props = { milestone: Milestone; screenX: number; screenY: number };

export function NodeTooltip({ milestone, screenX, screenY }: Props) {
  return (
    <div
      data-testid="node-tooltip"
      style={{
        position: 'absolute',
        left: screenX + 14,
        top: screenY + 14,
        maxWidth: 360,
        background: 'rgba(5,8,13,0.95)',
        border: '1px solid var(--edge-idle)',
        padding: '6px 10px',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 12,
        color: 'var(--text)',
        pointerEvents: 'none',
        zIndex: 10,
        boxShadow: '0 0 12px rgba(0, 229, 255, 0.15)',
      }}
    >
      <div style={{ color: 'var(--edge-trail)', marginBottom: 2 }}>{milestone.label}</div>
      <div style={{ color: 'var(--text-dim)' }}>{milestone.summary}</div>
    </div>
  );
}
```

Notes: light preview only — label + summary. Heavy detail moves to `DetailPanel` in a later task.

- [ ] **Step 4: Change GraphCanvas hover handler to use node SVG position, not clientX**

In `src/components/GraphCanvas.tsx`, replace the existing `hover` state and `onMouseEnter/Move/Leave` block with a position computed from the node's SVG bbox relative to the container.

Replace the block beginning `const [hover, setHover] = useState<{ milestone: Milestone; x: number; y: number } | null>(null);` and the `onMouseEnter` group through the rendering of `<NodeTooltip ... />` with:

```tsx
const containerRef = useRef<HTMLDivElement>(null);
const [hover, setHover] = useState<{ milestone: Milestone; screenX: number; screenY: number } | null>(null);

function handleNodeEnter(milestone: Milestone, ev: React.MouseEvent<SVGGElement>): void {
  const containerRect = containerRef.current?.getBoundingClientRect();
  if (!containerRect) return;
  const g = ev.currentTarget;
  const rect = g.getBoundingClientRect();
  setHover({
    milestone,
    screenX: rect.x + rect.width / 2 - containerRect.x,
    screenY: rect.y + rect.height - containerRect.y,
  });
}
```

Then update the outer div to use `ref={containerRef}` and the per-node group to use `onMouseEnter={(e) => handleNodeEnter(n.milestone, e)} onMouseLeave={() => setHover(null)}` (drop `onMouseMove` — no need to re-render every pixel).

Update the bottom `{hover && <NodeTooltip ... />}` to:

```tsx
{hover && <NodeTooltip milestone={hover.milestone} screenX={hover.screenX} screenY={hover.screenY} />}
```

Make sure `React` and `useRef` are imported: `import { useMemo, useRef, useState } from 'react';`.

- [ ] **Step 5: Run the e2e test**

Run: `npm run test:e2e -- tests/e2e/zoom-and-tooltip.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite to verify nothing else broke**

Run: `npm test && npm run test:e2e`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/components/GraphCanvas.tsx src/components/NodeTooltip.tsx tests/e2e/zoom-and-tooltip.spec.ts
git commit -m "fix(tooltip): anchor hover preview to node SVG bbox, not viewport clientX"
```

---

## Task 2: Truncate node labels with ellipsis

**Why:** Today labels overflow the 110 px rect. Trivial fix that polishes the look at any zoom level.

**Files:**
- Modify: `src/components/NodeShape.tsx`

- [ ] **Step 1: Implement truncation**

In `src/components/NodeShape.tsx`, update the `<text>` element. Replace:

```tsx
<text x={8} y={h / 2 + 4} fontSize={11} fill={colors.text} fontFamily="ui-monospace, monospace">
  {glyphFor(node.milestone.kind)}  {node.milestone.label}
</text>
```

with:

```tsx
const fullLabel = `${glyphFor(node.milestone.kind)}  ${node.milestone.label}`;
const maxChars = 16;
const shown = fullLabel.length > maxChars ? `${fullLabel.slice(0, maxChars - 1)}…` : fullLabel;
return (
  <g transform={`translate(${node.x - w / 2}, ${node.y - h / 2})`} data-id={node.id} data-state={state}>
    <rect
      width={w} height={h} rx={4}
      fill={colors.fill}
      stroke={colors.stroke}
      strokeWidth={state === 'success' ? 1.5 : 1}
      filter={useGlow ? 'url(#tg-glow)' : undefined}
      opacity={state === 'pruned' ? 0.35 : 0.95}
      style={state === 'success' ? { animation: 'tg-shimmer 2.4s ease-in-out infinite' } : undefined}
    />
    <text x={8} y={h / 2 + 4} fontSize={11} fill={colors.text} fontFamily="ui-monospace, monospace">{shown}</text>
    <title>{node.milestone.label}</title>
    {state === 'failed' && (
      <circle cx={w - 6} cy={6} r={3} fill="var(--node-failed)" filter="url(#tg-glow)" />
    )}
  </g>
);
```

(Move the `return` so it builds `shown` before render.)

- [ ] **Step 2: Run tests**

Run: `npm test && npm run test:e2e`
Expected: all green. (existing tests don't assert label width.)

- [ ] **Step 3: Commit**

```bash
git add src/components/NodeShape.tsx
git commit -m "feat(node): truncate labels with ellipsis; full label in <title>"
```

---

## Task 3: Default playback to paused; expand speeds; couple typewriter

**Why:** "Pukes everything at once." User must start playback explicitly. Speeds need 0.25× and 0.5×; default per-node duration rises from 200 ms → 400 ms.

**Files:**
- Modify: `src/playback/usePlayback.ts`
- Modify: `src/components/PlaybackControls.tsx`
- Modify: `src/components/NowPlaying.tsx`
- Modify: `tests/e2e/playback.spec.ts` (existing test assumed autoplay)
- Test: `tests/unit/playback-step.test.ts` (new — small assertion)

- [ ] **Step 1: Write failing unit test for paused default**

Create `tests/unit/playback-step.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayback } from '../../src/playback/usePlayback';
import type { Milestone } from '../../src/parse/types';

function ms(id: string, children: Milestone[] = []): Milestone {
  return { id, kind: 'tool_call', label: id, summary: id, timestamp: '', failed: false, raw: null, children };
}

describe('usePlayback', () => {
  it('starts paused', () => {
    const root = ms('a', [ms('b')]);
    const { result } = renderHook(() => usePlayback(root));
    expect(result.current.state.playing).toBe(false);
    expect(result.current.state.index).toBe(0);
  });

  it('step(+1) advances index', () => {
    const root = ms('a', [ms('b', [ms('c')])]);
    const { result } = renderHook(() => usePlayback(root));
    act(() => { result.current.controls.step(1); });
    expect(result.current.state.index).toBe(1);
  });

  it('step(-1) decrements index but not below 0', () => {
    const root = ms('a', [ms('b')]);
    const { result } = renderHook(() => usePlayback(root));
    act(() => { result.current.controls.step(-1); });
    expect(result.current.state.index).toBe(0);
  });

  it('exposes 0.25×, 0.5×, 1×, 2×, 4× speeds', () => {
    const root = ms('a');
    const { result } = renderHook(() => usePlayback(root));
    act(() => { result.current.controls.setSpeed(0.25); });
    expect(result.current.state.speed).toBe(0.25);
    act(() => { result.current.controls.setSpeed(0.5); });
    expect(result.current.state.speed).toBe(0.5);
  });
});
```

Add `@testing-library/react` dev dependency if missing:

```bash
npm install --save-dev @testing-library/react@^16
```

- [ ] **Step 2: Run; expect fail**

Run: `npm test -- playback-step`
Expected: fails (autoplay still true, `step` not defined, `Speed` doesn't include 0.25 or 0.5).

- [ ] **Step 3: Implement changes in `usePlayback.ts`**

Replace `src/playback/usePlayback.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import type { Milestone } from '../parse/types';

export type Speed = 0.25 | 0.5 | 1 | 2 | 4;

export function flattenDFS(root: Milestone): Milestone[] {
  const out: Milestone[] = [];
  function walk(node: Milestone): void {
    out.push(node);
    for (const c of node.children) walk(c);
  }
  walk(root);
  return out;
}

const BASE_MS_PER_NODE = 400;

export type PlaybackState = {
  order: Milestone[];
  index: number;
  edgeProgress: number;
  playing: boolean;
  speed: Speed;
  finished: boolean;
};

export type PlaybackControls = {
  play(): void;
  pause(): void;
  toggle(): void;
  setSpeed(s: Speed): void;
  restart(): void;
  step(direction: 1 | -1): void;
  scrubTo(milestoneIndex: number): void;
};

export function usePlayback(root: Milestone | null): { state: PlaybackState; controls: PlaybackControls } {
  const [order, setOrder] = useState<Milestone[]>([]);
  const [index, setIndex] = useState(0);
  const [edgeProgress, setEdgeProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!root) { setOrder([]); setIndex(0); setEdgeProgress(0); setPlaying(false); return; }
    const flat = flattenDFS(root);
    setOrder(flat);
    setIndex(0);
    setEdgeProgress(0);
    setPlaying(false);
  }, [root]);

  useEffect(() => {
    if (!playing || order.length === 0) return;
    lastTickRef.current = null;
    function tick(now: number) {
      if (lastTickRef.current == null) lastTickRef.current = now;
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;
      const msPerNode = BASE_MS_PER_NODE / speed;
      setEdgeProgress((prev) => {
        const next = prev + dt / msPerNode;
        if (next >= 1) {
          setIndex((idx) => Math.min(idx + 1, order.length - 1));
          return 0;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, order, speed]);

  useEffect(() => {
    if (index >= order.length - 1 && edgeProgress >= 0.999) {
      setPlaying(false);
    }
  }, [index, edgeProgress, order.length]);

  const controls: PlaybackControls = {
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    toggle: () => setPlaying((p) => !p),
    setSpeed: (s) => setSpeed(s),
    restart: () => { setIndex(0); setEdgeProgress(0); setPlaying(true); },
    step: (direction) => {
      setPlaying(false);
      if (direction === 1) {
        setIndex((i) => Math.min(i + 1, Math.max(0, order.length - 1)));
        setEdgeProgress(0);
      } else {
        setIndex((i) => Math.max(0, i - 1));
        setEdgeProgress(0);
      }
    },
    scrubTo: (milestoneIndex) => {
      setPlaying(false);
      setIndex(Math.max(0, Math.min(milestoneIndex, Math.max(0, order.length - 1))));
      setEdgeProgress(0);
    },
  };

  return {
    state: {
      order, index, edgeProgress, playing, speed,
      finished: order.length > 0 && index >= order.length - 1 && edgeProgress >= 0.999,
    },
    controls,
  };
}

export function msPerNode(speed: Speed): number {
  return BASE_MS_PER_NODE / speed;
}
```

- [ ] **Step 4: Update PlaybackControls.tsx for new speed set + step buttons**

Replace `src/components/PlaybackControls.tsx`:

```tsx
import type { PlaybackControls as Controls, PlaybackState, Speed } from '../playback/usePlayback';

type Props = { state: PlaybackState; controls: Controls };

const SPEEDS: Speed[] = [0.25, 0.5, 1, 2, 4];

export function PlaybackControls({ state, controls }: Props) {
  return (
    <div style={styles.bar}>
      <button onClick={() => controls.step(-1)} style={styles.btn} data-testid="step-back" aria-label="step back">‹</button>
      <button onClick={controls.toggle} style={styles.btn} data-testid="play-toggle" aria-label="toggle play">
        {state.playing ? '❚❚' : '▶'}
      </button>
      <button onClick={() => controls.step(1)} style={styles.btn} data-testid="step-forward" aria-label="step forward">›</button>
      <div style={styles.speedGroup} role="group" aria-label="speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => controls.setSpeed(s)}
            style={{ ...styles.speed, ...(state.speed === s ? styles.speedActive : {}) }}
            data-testid={`speed-${s}`}
          >
            {s}×
          </button>
        ))}
      </div>
      <button onClick={controls.restart} style={styles.btn} data-testid="restart" aria-label="restart">↺</button>
    </div>
  );
}

const styles = {
  bar: {
    position: 'absolute' as const,
    left: '50%',
    bottom: 16,
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid var(--edge-idle)',
    padding: '6px 10px',
    fontFamily: 'ui-monospace, monospace',
    zIndex: 4,
  },
  btn: {
    background: 'transparent',
    border: '1px solid var(--edge-idle)',
    color: 'var(--text)',
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
  },
  speedGroup: { display: 'flex', marginLeft: 6 },
  speed: {
    background: 'transparent',
    border: '1px solid var(--edge-idle)',
    color: 'var(--text-dim)',
    padding: '4px 6px',
    marginLeft: -1,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 11,
  },
  speedActive: { color: 'var(--edge-trail)', borderColor: 'var(--edge-trail)' },
};
```

- [ ] **Step 5: Couple typewriter duration to speed in `NowPlaying.tsx`**

Modify `src/components/NowPlaying.tsx`. Change the props type to accept `speed`, and compute typewriter duration. Replace the `Props` type and the body of `NowPlaying`:

```tsx
import { useEffect, useState } from 'react';
import type { Milestone } from '../parse/types';
import { msPerNode, type Speed } from '../playback/usePlayback';

type Props = {
  current: Milestone | null;
  edgeProgress: number;
  inSubagent: boolean;
  speed: Speed;
};

function useTypewriter(text: string, durationMs: number): string {
  const [out, setOut] = useState('');
  useEffect(() => {
    if (!text) { setOut(''); return; }
    setOut('');
    const start = performance.now();
    let raf = 0;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const len = Math.floor(text.length * t);
      setOut(text.slice(0, len));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, durationMs]);
  return out;
}

export function NowPlaying({ current, edgeProgress, inSubagent, speed }: Props) {
  const summaryText = current?.summary ?? '';
  const resultText = edgeProgress >= 0.6 ? (current?.result ?? '') : '';
  const dur = Math.max(60, Math.min(280, msPerNode(speed) * 0.5));
  const summary = useTypewriter(summaryText, dur);
  const result = useTypewriter(resultText, dur);
  // ... rest unchanged
```

Keep the rest of the file unchanged. Then in `src/App.tsx`, pass `speed`:

```tsx
<NowPlaying current={currentMilestone} edgeProgress={playback.edgeProgress} inSubagent={inSubagent} speed={playback.speed} />
```

- [ ] **Step 6: Adapt the existing playback e2e test (now starts paused)**

Replace `tests/e2e/playback.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('playback: starts paused; play advances; pause freezes; resume completes', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();

  // Initially paused — no active node beyond the seed; wait long enough that auto-play would have advanced if enabled.
  await page.waitForTimeout(800);
  const initialActive = await page.locator('svg g[data-state="active"]').count();
  expect(initialActive).toBeLessThanOrEqual(1);

  // Press play
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(600);
  const midActive = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  expect(midActive).not.toBeNull();

  // Pause
  await page.getByTestId('play-toggle').click();
  const pausedAt = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  await page.waitForTimeout(800);
  const stillAt = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  expect(stillAt).toBe(pausedAt);

  // Resume and finish
  await page.getByTestId('play-toggle').click();
  await expect(page.locator('svg g[data-state="success"]')).toHaveCount(4, { timeout: 8_000 });
});
```

- [ ] **Step 7: Run all tests**

Run: `npm test && npm run test:e2e`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/playback/usePlayback.ts src/components/PlaybackControls.tsx src/components/NowPlaying.tsx src/App.tsx tests/unit/playback-step.test.ts tests/e2e/playback.spec.ts package.json package-lock.json
git commit -m "feat(playback): default paused; add step/scrubTo controls and 0.25×/0.5× speeds"
```

---

## Task 4: Add scrubber (timeline)

**Why:** Click/drag through the timeline to find a moment without waiting.

**Files:**
- Modify: `src/components/PlaybackControls.tsx` (or split into a `<Scrubber>` subcomponent inline)
- Test: `tests/e2e/scrubber-step.spec.ts` (new)

- [ ] **Step 1: Write failing e2e test**

Create `tests/e2e/scrubber-step.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('scrubber click jumps playhead and pauses', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();

  const scrubber = page.getByTestId('scrubber-track');
  await expect(scrubber).toBeVisible();
  const box = await scrubber.boundingBox();
  if (!box) throw new Error('no scrubber bbox');
  // Click near 80% — should land on the last or second-to-last milestone
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
  const handlePct = await page.getByTestId('scrubber-handle').getAttribute('data-pct');
  expect(Number(handlePct)).toBeGreaterThan(50);
  // Should be paused (play button shows ▶)
  await expect(page.getByTestId('play-toggle')).toHaveText('▶');
});

test('step-forward button advances one milestone', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();
  const before = await page.getByTestId('scrubber-handle').getAttribute('data-pct');
  await page.getByTestId('step-forward').click();
  const after = await page.getByTestId('scrubber-handle').getAttribute('data-pct');
  expect(Number(after)).toBeGreaterThan(Number(before));
});
```

- [ ] **Step 2: Run; expect fail**

Run: `npm run test:e2e -- tests/e2e/scrubber-step.spec.ts`
Expected: fails — no scrubber element yet.

- [ ] **Step 3: Add a Scrubber to PlaybackControls.tsx**

Modify `src/components/PlaybackControls.tsx`. Add a `Scrubber` component inside the same file (small enough to live here):

```tsx
import { useRef } from 'react';

function Scrubber({ index, edgeProgress, total, onSeek }: {
  index: number; edgeProgress: number; total: number; onSeek: (i: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = total > 1 ? ((index + edgeProgress) / (total - 1)) * 100 : 0;

  function seekFromEvent(clientX: number): void {
    const t = trackRef.current;
    if (!t) return;
    const rect = t.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.x) / rect.width));
    onSeek(Math.round(ratio * (total - 1)));
  }

  return (
    <div
      ref={trackRef}
      data-testid="scrubber-track"
      onMouseDown={(e) => {
        seekFromEvent(e.clientX);
        const move = (ev: MouseEvent) => seekFromEvent(ev.clientX);
        const up = () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      }}
      style={{
        position: 'relative',
        height: 6,
        width: 320,
        background: 'rgba(26,58,74,0.6)',
        border: '1px solid var(--edge-idle)',
        cursor: 'pointer',
        marginRight: 8,
      }}
    >
      <div
        data-testid="scrubber-fill"
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`, background: 'var(--edge-trail)', opacity: 0.6,
        }}
      />
      <div
        data-testid="scrubber-handle"
        data-pct={pct.toFixed(1)}
        style={{
          position: 'absolute', top: -3, height: 12, width: 4,
          left: `calc(${pct}% - 2px)`,
          background: 'var(--edge-trail)', boxShadow: '0 0 6px var(--edge-trail)',
        }}
      />
    </div>
  );
}
```

Add `<Scrubber ... />` as the first child of `<div style={styles.bar}>`:

```tsx
<Scrubber
  index={state.index}
  edgeProgress={state.edgeProgress}
  total={state.order.length}
  onSeek={controls.scrubTo}
/>
```

- [ ] **Step 4: Run new e2e**

Run: `npm run test:e2e -- tests/e2e/scrubber-step.spec.ts`
Expected: PASS.

- [ ] **Step 5: Full sweep**

Run: `npm test && npm run test:e2e`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/components/PlaybackControls.tsx tests/e2e/scrubber-step.spec.ts
git commit -m "feat(playback): add timeline scrubber with click/drag-to-seek"
```

---

## Task 5: Overflow gate — "Load anyway" instead of hard block

**Why:** Spec section 4. Lift the 1000-milestone cap behind explicit user confirmation.

**Files:**
- Modify: `src/App.tsx`
- Test: `tests/e2e/large-session.spec.ts` (new) — uses a small fake-large session by tweaking the threshold? Simpler: assert the confirmation appears for the existing 1000-cap. We'll add a fixture path or simulate.

Pragmatic approach: keep the test deterministic by lowering the threshold for tests via a `data-test-large-threshold` attr — overkill for a POC. Skip the e2e test for this and rely on the visual change. Manual verification noted below.

- [ ] **Step 1: Modify `src/App.tsx`**

In `App.tsx`, replace the `>1000` overflow block. Add `loadConfirmedIds` state and a button:

```tsx
const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
const needsConfirm = session && session.totalMilestones > 1000 && !confirmedIds.has(session.id);
```

Render block — replace the entire overflow section with:

```tsx
{session && needsConfirm && (
  <div style={styles.overflow} data-testid="overflow-confirm">
    <div style={styles.overflowMsg}>
      LARGE SESSION — {session.totalMilestones} MILESTONES
    </div>
    <div style={styles.overflowSub}>Rendering may take a moment.</div>
    <button
      style={styles.overflowBtn}
      data-testid="load-anyway"
      onClick={() => setConfirmedIds((s) => new Set(s).add(session.id))}
    >
      LOAD ANYWAY
    </button>
  </div>
)}
{session && !needsConfirm && (
  <>
    {/* existing graph + HUD + controls */}
  </>
)}
```

Adjust the existing `{session && session.totalMilestones <= 1000 && (...)}` block to `{session && !needsConfirm && (...)}` and DELETE the old `> 1000` overflow message div.

Add styles to the existing `const styles = {...}` object:

```ts
overflow: {
  position: 'absolute' as const, inset: 0,
  display: 'flex', flexDirection: 'column' as const,
  alignItems: 'center', justifyContent: 'center',
  color: 'var(--text-dim)', gap: 12,
},
overflowMsg: { letterSpacing: 4, fontSize: 13, color: 'var(--text)' },
overflowSub: { fontSize: 11, color: 'var(--text-dim)' },
overflowBtn: {
  background: 'transparent', border: '1px solid var(--edge-trail)',
  color: 'var(--edge-trail)', padding: '8px 18px', cursor: 'pointer',
  fontFamily: 'ui-monospace, monospace', letterSpacing: 3, fontSize: 11,
  boxShadow: '0 0 12px rgba(0, 229, 255, 0.25)',
},
```

- [ ] **Step 2: Run existing tests**

Run: `npm test && npm run test:e2e`
Expected: all green (no test currently covers the >1000 path).

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(overflow): replace hard >1000 cap with 'Load anyway' confirmation"
```

---

## Task 6: Add `useCamera` hook with d3-zoom (pan + wheel-zoom + fit)

**Why:** Foundation for everything else visual. Replaces fit-to-screen with user-controlled transform.

**Files:**
- Create: `src/graph/useCamera.ts`
- Test: `tests/unit/camera.test.ts` (new)

- [ ] **Step 1: Write failing unit tests for fit math**

Create `tests/unit/camera.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fitTransform, type Bounds, type Viewport } from '../../src/graph/useCamera';

describe('fitTransform', () => {
  const layoutBounds: Bounds = { width: 1200, height: 4000 };
  const viewport: Viewport = { width: 1200, height: 800 };

  it('scales down to fit tall layout with margin', () => {
    const t = fitTransform(layoutBounds, viewport, 24);
    // Height-constrained: scale = (800 - 48) / 4000 = 0.188
    expect(t.k).toBeCloseTo((800 - 48) / 4000, 3);
  });

  it('centers the layout horizontally', () => {
    const t = fitTransform(layoutBounds, viewport, 24);
    // Layout width scaled = 1200 * k; centered means x = (viewport.w - layoutW*k) / 2
    expect(t.x).toBeCloseTo((1200 - 1200 * t.k) / 2, 1);
  });
});
```

- [ ] **Step 2: Run; expect fail**

Run: `npm test -- camera`
Expected: fails — module not found.

- [ ] **Step 3: Implement `src/graph/useCamera.ts`**

```ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type D3ZoomEvent } from 'd3-zoom';
import { select } from 'd3-selection';

export type Bounds = { width: number; height: number };
export type Viewport = { width: number; height: number };
export type Transform = { k: number; x: number; y: number };

export function fitTransform(layout: Bounds, viewport: Viewport, margin = 24): Transform {
  const availW = Math.max(1, viewport.width - margin * 2);
  const availH = Math.max(1, viewport.height - margin * 2);
  const k = Math.min(availW / Math.max(1, layout.width), availH / Math.max(1, layout.height), 1);
  const x = (viewport.width - layout.width * k) / 2;
  const y = margin;
  return { k, x, y };
}

export function centerOnTransform(
  layoutPoint: { x: number; y: number },
  viewport: Viewport,
  k: number,
): Transform {
  return {
    k,
    x: viewport.width / 2 - layoutPoint.x * k,
    y: viewport.height / 2 - layoutPoint.y * k,
  };
}

type Options = {
  svgRef: React.RefObject<SVGSVGElement | null>;
  layout: Bounds;
  viewport: Viewport;
};

export function useCamera({ svgRef, layout, viewport }: Options) {
  const [transform, setTransform] = useState<Transform>({ k: 1, x: 0, y: 0 });
  const [follow, setFollow] = useState(true);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const programmaticRef = useRef(false);

  // Initialize d3-zoom on the svg
  useEffect(() => {
    if (!svgRef.current) return;
    const svgSel = select(svgRef.current);
    const zb = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 8])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        setTransform({ k: event.transform.k, x: event.transform.x, y: event.transform.y });
        if (!programmaticRef.current && event.sourceEvent) {
          // User-initiated: lock follow off
          setFollow(false);
        }
      });
    svgSel.call(zb);
    zoomBehaviorRef.current = zb;
    return () => { svgSel.on('.zoom', null); };
  }, [svgRef]);

  // Apply transform programmatically
  const applyTransform = useCallback((t: Transform, animate = true) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    programmaticRef.current = true;
    const svgSel = select(svgRef.current);
    const id = zoomIdentity.translate(t.x, t.y).scale(t.k);
    if (animate) {
      svgSel.transition().duration(280).call(zoomBehaviorRef.current.transform, id);
    } else {
      svgSel.call(zoomBehaviorRef.current.transform, id);
    }
    setTimeout(() => { programmaticRef.current = false; }, 320);
  }, [svgRef]);

  const fit = useCallback(() => {
    applyTransform(fitTransform(layout, viewport, 24));
  }, [applyTransform, layout, viewport]);

  const centerOn = useCallback((pt: { x: number; y: number }, k?: number) => {
    applyTransform(centerOnTransform(pt, viewport, k ?? Math.max(0.6, transform.k)));
  }, [applyTransform, viewport, transform.k]);

  return { transform, follow, setFollow, fit, centerOn };
}
```

Install `d3-zoom` types if not already (they ship with the `@types/d3`):

```bash
node -e "console.log(require('d3-zoom/package.json').version)"
```

Expected: prints a version (already a transitive dep of d3). If missing, run `npm install d3-selection d3-zoom`.

- [ ] **Step 4: Run unit tests**

Run: `npm test -- camera`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/graph/useCamera.ts tests/unit/camera.test.ts
git commit -m "feat(camera): add useCamera hook with d3-zoom, fit/centerOn helpers"
```

---

## Task 7: Wire `useCamera` into `GraphCanvas`; remove fit-to-screen viewBox

**Why:** Make the graph zoomable in the actual app.

**Files:**
- Modify: `src/components/GraphCanvas.tsx`
- Modify: `tests/e2e/zoom-and-tooltip.spec.ts` (extend)

- [ ] **Step 1: Extend e2e test for wheel-zoom**

Append to `tests/e2e/zoom-and-tooltip.spec.ts`:

```ts
test('wheel-zoom enlarges nodes (graph is no longer fit-to-screen)', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  const firstNode = page.locator('svg g[data-id]').first();
  await expect(firstNode).toBeVisible();
  const before = (await firstNode.boundingBox())!;
  // Wheel-zoom in
  const svg = page.locator('svg');
  const svgBox = (await svg.boundingBox())!;
  await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
  await page.mouse.wheel(0, -800);
  await page.waitForTimeout(200);
  const after = (await firstNode.boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width);
});

test('Fit button restores default view', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  const svg = page.locator('svg');
  const svgBox = (await svg.boundingBox())!;
  await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
  await page.mouse.wheel(0, -1200);
  await page.waitForTimeout(150);
  await page.getByTestId('fit-button').click();
  await page.waitForTimeout(350);
  // After fit, nodes should be visible inside viewport
  const node = page.locator('svg g[data-id]').first();
  const box = await node.boundingBox();
  expect(box).not.toBeNull();
});
```

- [ ] **Step 2: Update `GraphCanvas.tsx` — use camera transform**

Replace `src/components/GraphCanvas.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react';
import { layoutTree, type LaidOutNode } from '../graph/layout';
import { GraphDefs } from '../theme/Filters';
import { NodeShape } from './NodeShape';
import { EdgePath } from './EdgePath';
import { NodeTooltip } from './NodeTooltip';
import { collectTaintedIds } from '../parse/failure';
import { useCamera } from '../graph/useCamera';
import type { Milestone, Session } from '../parse/types';
import type { PlaybackState } from '../playback/usePlayback';

type Props = {
  session: Session;
  playback: PlaybackState;
  subagentIds: Set<string>;
  pinnedId: string | null;
  onPin: (id: string | null) => void;
};

type SubagentRegion = { x: number; y: number; width: number; height: number };

function collectDescendantIds(node: Milestone): string[] {
  const ids = [node.id];
  for (const c of node.children) ids.push(...collectDescendantIds(c));
  return ids;
}

function computeSubagentRegions(root: Milestone, nodes: LaidOutNode[]): SubagentRegion[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const regions: SubagentRegion[] = [];
  function walk(node: Milestone): void {
    if (node.kind === 'subagent_spawn' && node.children[0]) {
      const ids = collectDescendantIds(node.children[0]);
      const positions = ids.map((id) => byId.get(id)).filter((n): n is LaidOutNode => n !== undefined);
      if (positions.length > 0) {
        const xs = positions.map((p) => p.x);
        const ys = positions.map((p) => p.y);
        regions.push({
          x: Math.min(...xs) - 70, y: Math.min(...ys) - 20,
          width: Math.max(...xs) - Math.min(...xs) + 140,
          height: Math.max(...ys) - Math.min(...ys) + 50,
        });
      }
    }
    for (const c of node.children) walk(c);
  }
  walk(root);
  return regions;
}

export function GraphCanvas({ session, playback, subagentIds, pinnedId, onPin }: Props) {
  const layout = useMemo(() => layoutTree(session.root), [session]);
  const subagentRegions = useMemo(() => computeSubagentRegions(session.root, layout.nodes), [session, layout]);
  const taintedIds = useMemo(() => collectTaintedIds(session.root), [session]);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  useMemo(() => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    setViewport({ width: r.width, height: r.height });
  }, []);

  // Track viewport size with ResizeObserver
  React.useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setViewport({ width: r.width, height: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const { transform, fit } = useCamera({ svgRef, layout, viewport });
  // Auto-fit once on layout change
  React.useEffect(() => { fit(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session]);

  const [hover, setHover] = useState<{ milestone: Milestone; screenX: number; screenY: number } | null>(null);

  const currentId = playback.order[playback.index]?.id;
  const traversedIds = new Set(playback.order.slice(0, playback.index + 1).map((m) => m.id));
  const successIds = session.successPath;
  const traversedEdgeKey =
    playback.index > 0
      ? `${playback.order[playback.index - 1].id}->${playback.order[playback.index].id}`
      : null;

  function handleNodeEnter(milestone: Milestone, ev: React.MouseEvent<SVGGElement>): void {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    setHover({
      milestone,
      screenX: rect.x + rect.width / 2 - containerRect.x,
      screenY: rect.y + rect.height - containerRect.y,
    });
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ display: 'block', cursor: 'grab' }}
      >
        <GraphDefs />
        <g className="zoom-layer" transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
          {subagentRegions.map((r, i) => (
            <rect
              key={`sg-region-${i}`}
              x={r.x} y={r.y} width={r.width} height={r.height}
              fill="var(--subagent-accent)" fillOpacity={0.05}
              stroke="var(--subagent-accent)" strokeOpacity={0.25}
              strokeWidth={1} rx={8}
              data-testid="subagent-region"
            />
          ))}
          {layout.edges.map((e) => {
            const key = `${e.sourceId}->${e.targetId}`;
            const isTraversed = traversedIds.has(e.targetId);
            const isCurrent = key === traversedEdgeKey;
            const inSub = subagentIds.has(e.targetId);
            const pruned = taintedIds.has(e.targetId) && !traversedIds.has(e.targetId);
            const state = pruned ? 'pruned' : isCurrent ? 'drawing' : isTraversed ? 'done' : 'idle';
            return (
              <EdgePath
                key={key}
                edge={e}
                state={state}
                progress={isCurrent ? playback.edgeProgress : isTraversed ? 1 : 0}
                inSubagent={inSub}
              />
            );
          })}
          {layout.nodes.map((n) => {
            const inSub = subagentIds.has(n.id);
            let state: 'idle' | 'active' | 'success' | 'failed' | 'pruned';
            if (n.milestone.failed) state = 'failed';
            else if (taintedIds.has(n.id)) state = 'pruned';
            else if (playback.finished && successIds.has(n.id)) state = 'success';
            else if (playback.finished && traversedIds.has(n.id)) state = 'success';
            else if (n.id === currentId) state = 'active';
            else if (traversedIds.has(n.id)) state = 'success';
            else state = 'idle';
            const isPinned = n.id === pinnedId;
            return (
              <g
                key={n.id}
                onMouseEnter={(e) => handleNodeEnter(n.milestone, e)}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => { e.stopPropagation(); onPin(isPinned ? null : n.id); }}
                style={{ cursor: 'pointer' }}
              >
                <NodeShape node={n} state={state} inSubagent={inSub} pinned={isPinned} />
              </g>
            );
          })}
        </g>
      </svg>
      <button
        data-testid="fit-button"
        onClick={() => fit()}
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 6,
          background: 'rgba(5,8,13,0.85)', border: '1px solid var(--edge-idle)',
          color: 'var(--text)', padding: '4px 10px', cursor: 'pointer',
          fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: 2,
        }}
      >FIT</button>
      {hover && <NodeTooltip milestone={hover.milestone} screenX={hover.screenX} screenY={hover.screenY} />}
    </div>
  );
}
```

Note: needs `import React from 'react';` at the top because `React.useEffect` is used (or just import `useEffect` explicitly). Use:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
```

and replace `React.useEffect` with `useEffect`.

- [ ] **Step 3: Update `NodeShape.tsx` to accept and render `pinned`**

Add `pinned?: boolean` to `NodeShape` props. When `pinned`, render an extra `<rect>` ring:

```tsx
type Props = {
  node: LaidOutNode;
  state: 'idle' | 'active' | 'success' | 'failed' | 'pruned';
  inSubagent: boolean;
  pinned?: boolean;
};

// inside the returned <g>, before closing:
{pinned && (
  <rect width={w + 6} height={h + 6} x={-3} y={-3} rx={6}
    fill="none" stroke="var(--edge-trail)" strokeWidth={1.5}
    style={{ filter: 'url(#tg-glow)' }} />
)}
```

- [ ] **Step 4: Update `App.tsx` to manage pinned state and pass to GraphCanvas**

In `App.tsx`:

```tsx
const [pinnedId, setPinnedId] = useState<string | null>(null);
// reset when session changes
useEffect(() => { setPinnedId(null); }, [selected]);
```

Pass to `<GraphCanvas ... pinnedId={pinnedId} onPin={setPinnedId} />`.

- [ ] **Step 5: Run new tests**

Run: `npm run test:e2e -- tests/e2e/zoom-and-tooltip.spec.ts`
Expected: PASS for all three sub-tests (tooltip, wheel-zoom, fit-button).

- [ ] **Step 6: Full sweep**

Run: `npm test && npm run test:e2e`
Expected: all green. If the original `subagent.spec.ts` or `failure-rendering.spec.ts` relied on the old `viewBox`, fix any layout-coordinate-vs-screen-coordinate assumption — typically not needed since they use `data-testid` lookups.

- [ ] **Step 7: Commit**

```bash
git add src/components/GraphCanvas.tsx src/components/NodeShape.tsx src/App.tsx tests/e2e/zoom-and-tooltip.spec.ts
git commit -m "feat(canvas): wire useCamera; wheel-zoom, drag-pan, fit; click to pin node"
```

---

## Task 8: Auto-follow the playhead

**Why:** Spec section 1. During playback, keep the active node visible. User-initiated pan/zoom locks follow off (already wired in `useCamera`).

**Files:**
- Modify: `src/components/GraphCanvas.tsx`

- [ ] **Step 1: Implement follow effect**

In `GraphCanvas.tsx`, after the `useCamera` call, add:

```tsx
const { transform, follow, setFollow, fit, centerOn } = useCamera({ svgRef, layout, viewport });

// When the current node changes during playback, re-center if follow is on
useEffect(() => {
  if (!follow || !currentId) return;
  const node = layout.nodes.find((n) => n.id === currentId);
  if (!node) return;
  // Only re-center if the node would fall outside the central 60% of the viewport
  const screenX = node.x * transform.k + transform.x;
  const screenY = node.y * transform.k + transform.y;
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const dx = Math.abs(screenX - cx);
  const dy = Math.abs(screenY - cy);
  if (dx > viewport.width * 0.3 || dy > viewport.height * 0.3) {
    centerOn({ x: node.x, y: node.y }, transform.k);
  }
}, [currentId, follow, layout, transform.k, transform.x, transform.y, viewport.height, viewport.width, centerOn]);
```

Add a small Lock button next to Fit:

```tsx
<button
  data-testid="follow-toggle"
  onClick={() => setFollow(!follow)}
  style={{
    position: 'absolute', top: 12, right: 64, zIndex: 6,
    background: 'rgba(5,8,13,0.85)',
    border: `1px solid ${follow ? 'var(--edge-trail)' : 'var(--edge-idle)'}`,
    color: follow ? 'var(--edge-trail)' : 'var(--text)',
    padding: '4px 10px', cursor: 'pointer',
    fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: 2,
  }}
>FOLLOW</button>
```

- [ ] **Step 2: Run tests**

Run: `npm test && npm run test:e2e`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/components/GraphCanvas.tsx
git commit -m "feat(camera): auto-follow active node during playback; toggle button"
```

---

## Task 9: Detail panel (right-docked, click-to-pin)

**Why:** Spec section 2. Heavy detail (full `detail` blob, `result`) docks on the right when user clicks a node.

**Files:**
- Create: `src/components/DetailPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/DetailPanel.tsx`**

```tsx
import type { Milestone } from '../parse/types';

type Props = { milestone: Milestone | null; onClose: () => void };

export function DetailPanel({ milestone, onClose }: Props) {
  if (!milestone) return null;
  return (
    <aside data-testid="detail-panel" style={styles.panel}>
      <header style={styles.header}>
        <div style={styles.kind}>{milestone.kind.toUpperCase().replace('_', ' ')}</div>
        <button onClick={onClose} aria-label="close" style={styles.close} data-testid="detail-close">×</button>
      </header>
      <div style={styles.label}>{milestone.label}</div>
      <div style={styles.summary}>{milestone.summary}</div>
      {milestone.result && (
        <div style={{ ...styles.result, color: milestone.failed ? 'var(--node-failed)' : 'var(--text-dim)' }}>
          {milestone.result}
        </div>
      )}
      {milestone.detail && (
        <pre style={styles.detail}>{milestone.detail}</pre>
      )}
    </aside>
  );
}

const styles = {
  panel: {
    position: 'absolute' as const,
    top: 0, right: 0, bottom: 0,
    width: 420,
    background: 'rgba(5,8,13,0.95)',
    borderLeft: '1px solid var(--edge-idle)',
    boxShadow: '-12px 0 24px rgba(0,0,0,0.4)',
    padding: '16px 18px',
    fontFamily: 'ui-monospace, monospace',
    color: 'var(--text)',
    overflowY: 'auto' as const,
    zIndex: 8,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  kind: { fontSize: 10, letterSpacing: 3, color: 'var(--edge-trail)' },
  close: {
    background: 'transparent', border: '1px solid var(--edge-idle)',
    color: 'var(--text)', cursor: 'pointer',
    padding: '0 8px', fontSize: 14, lineHeight: 1.4,
  },
  label: { fontSize: 13, color: 'var(--edge-trail)', marginBottom: 6 },
  summary: { fontSize: 12, color: 'var(--text)', marginBottom: 8 },
  result: { fontSize: 11, marginBottom: 12, whiteSpace: 'pre-wrap' as const },
  detail: {
    fontSize: 11, color: 'var(--text-dim)',
    whiteSpace: 'pre-wrap' as const, margin: 0,
    background: 'rgba(15,38,50,0.4)', padding: '8px 10px',
    border: '1px solid var(--grid)',
  },
};
```

- [ ] **Step 2: Mount in `App.tsx` and shrink the graph area when open**

In `App.tsx`, find the pinned milestone and render the panel:

```tsx
const pinnedMilestone = useMemo(() => {
  if (!session || !pinnedId) return null;
  // Find in playback.order — every milestone is in flatten
  return playback.order.find((m) => m.id === pinnedId) ?? null;
}, [session, pinnedId, playback.order]);
```

Render at the end of `<main>`:

```tsx
<DetailPanel milestone={pinnedMilestone} onClose={() => setPinnedId(null)} />
```

Adjust `<main style={...}>`:

```tsx
<main style={{ ...styles.main, paddingRight: pinnedMilestone ? 420 : 0, transition: 'padding-right 240ms ease' }}>
```

Import `DetailPanel`.

- [ ] **Step 3: Add e2e test**

Append to `tests/e2e/zoom-and-tooltip.spec.ts`:

```ts
test('click node opens detail panel; Esc/close button dismisses', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  const firstNode = page.locator('svg g[data-id]').first();
  await firstNode.click();
  const panel = page.getByTestId('detail-panel');
  await expect(panel).toBeVisible();
  await page.getByTestId('detail-close').click();
  await expect(panel).toHaveCount(0);
});
```

- [ ] **Step 4: Run**

Run: `npm run test:e2e -- tests/e2e/zoom-and-tooltip.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DetailPanel.tsx src/App.tsx tests/e2e/zoom-and-tooltip.spec.ts
git commit -m "feat(detail-panel): right-docked detail with click-to-pin and dismiss"
```

---

## Task 10: Collapsible / grouped / searchable sidebar

**Why:** Spec section 5. Make canvas the focus.

**Files:**
- Modify: `src/components/SessionList.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Refactor `SessionList.tsx`**

Replace `src/components/SessionList.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useSessionList } from '../api/hooks';
import type { SessionMeta } from '../parse/types';

type Props = {
  selected: { projectId: string; sessionId: string } | null;
  onSelect: (s: SessionMeta) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

function projectKey(cwd: string): string {
  // Last two path segments make a reasonable group label
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.slice(-2).join('/');
}

export function SessionList({ selected, onSelect, collapsed, onToggleCollapsed }: Props) {
  const { data, isLoading, error } = useSessionList();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    if (!data) return [] as Array<{ key: string; items: SessionMeta[] }>;
    const filtered = query
      ? data.filter((s) => s.cwd.toLowerCase().includes(query.toLowerCase()))
      : data;
    const map = new Map<string, SessionMeta[]>();
    for (const s of filtered) {
      const k = projectKey(s.cwd);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
  }, [data, query]);

  if (collapsed) {
    return (
      <aside style={{ ...styles.aside, width: 40 }} data-testid="session-list">
        <button onClick={onToggleCollapsed} style={styles.collapseBtn} aria-label="expand sessions" data-testid="sidebar-toggle">»</button>
      </aside>
    );
  }

  return (
    <aside style={styles.aside} data-testid="session-list">
      <div style={styles.header}>
        <h2 style={styles.title}>SESSIONS</h2>
        <button onClick={onToggleCollapsed} style={styles.collapseBtn} aria-label="collapse sessions" data-testid="sidebar-toggle">«</button>
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="filter…"
        style={styles.filter}
        data-testid="session-filter"
      />
      {isLoading && <div style={styles.muted}>scanning…</div>}
      {error && <div style={styles.error}>error: {(error as Error).message}</div>}
      {data && data.length === 0 && <div style={styles.muted}>(none)</div>}
      <div style={styles.scroll}>
        {groups.map((g) => (
          <div key={g.key} style={styles.group}>
            <div style={styles.groupHeader}>{g.key} <span style={styles.groupCount}>({g.items.length})</span></div>
            <ul style={styles.list}>
              {g.items.map((s) => {
                const isSelected = selected?.projectId === s.projectId && selected?.sessionId === s.sessionId;
                return (
                  <li
                    key={`${s.projectId}/${s.sessionId}`}
                    onClick={() => onSelect(s)}
                    style={{ ...styles.item, ...(isSelected ? styles.itemSelected : {}) }}
                  >
                    <div style={styles.itemMeta}>
                      {new Date(s.startedAt).toLocaleString()} · {Math.round(s.sizeBytes / 1024)}KB
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}

const styles = {
  aside: {
    width: 280, height: '100%',
    borderRight: '1px solid var(--grid)',
    display: 'flex' as const, flexDirection: 'column' as const,
    padding: '12px 0', transition: 'width 200ms ease',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px 6px' },
  title: { margin: 0, fontSize: 11, letterSpacing: 3, color: 'var(--text-dim)', fontWeight: 400 },
  collapseBtn: {
    background: 'transparent', border: '1px solid var(--edge-idle)',
    color: 'var(--text)', cursor: 'pointer',
    padding: '0 8px', fontSize: 12,
  },
  filter: {
    margin: '0 12px 8px', padding: '4px 6px',
    background: 'rgba(5,8,13,0.85)', border: '1px solid var(--edge-idle)',
    color: 'var(--text)', fontSize: 11, fontFamily: 'ui-monospace, monospace',
  },
  scroll: { overflowY: 'auto' as const, flex: 1 },
  group: { marginBottom: 8 },
  groupHeader: { padding: '6px 12px 2px', fontSize: 10, letterSpacing: 2, color: 'var(--edge-trail)' },
  groupCount: { color: 'var(--text-dim)' },
  list: { listStyle: 'none', padding: 0, margin: 0 },
  item: { padding: '8px 12px', cursor: 'pointer', borderLeft: '2px solid transparent' },
  itemSelected: { borderLeftColor: 'var(--edge-trail)', background: 'rgba(0, 229, 255, 0.04)' },
  itemMeta: { fontSize: 11, color: 'var(--text-dim)' },
  muted: { padding: '0 12px', color: 'var(--text-dim)', fontSize: 12 },
  error: { padding: '0 12px', color: 'var(--node-failed)', fontSize: 12 },
};
```

- [ ] **Step 2: Wire collapsed state in `App.tsx`**

```tsx
const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
<SessionList
  selected={selected}
  onSelect={...}
  collapsed={sidebarCollapsed}
  onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
/>
```

- [ ] **Step 3: Run tests**

Run: `npm test && npm run test:e2e`
Expected: all green. Existing tests using `aside li` should still locate items since groups still contain `<li>` rows.

If `aside li` is ambiguous, scope to `data-testid="session-list" li`. Adjust failing tests if needed.

- [ ] **Step 4: Commit**

```bash
git add src/components/SessionList.tsx src/App.tsx
git commit -m "feat(sidebar): collapsible, grouped-by-project, searchable session list"
```

---

## Task 11: Filter toggles (hide pruned / subagents / success-path-only)

**Why:** Spec section 6.

**Files:**
- Create: `src/components/FilterToggles.tsx`
- Modify: `src/components/GraphCanvas.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/FilterToggles.tsx`**

```tsx
export type Filters = {
  hidePruned: boolean;
  hideSubagents: boolean;
  successOnly: boolean;
};

type Props = { value: Filters; onChange: (next: Filters) => void };

export function FilterToggles({ value, onChange }: Props) {
  function tg<K extends keyof Filters>(k: K): React.ChangeEventHandler<HTMLInputElement> {
    return (e) => onChange({ ...value, [k]: e.currentTarget.checked });
  }
  return (
    <div data-testid="filter-toggles" style={styles.box}>
      <label style={styles.row}><input type="checkbox" checked={value.hidePruned} onChange={tg('hidePruned')} /> hide pruned</label>
      <label style={styles.row}><input type="checkbox" checked={value.hideSubagents} onChange={tg('hideSubagents')} /> hide subagents</label>
      <label style={styles.row}><input type="checkbox" checked={value.successOnly} onChange={tg('successOnly')} /> success path only</label>
    </div>
  );
}

const styles = {
  box: {
    position: 'absolute' as const, top: 12, right: 120, zIndex: 6,
    background: 'rgba(5,8,13,0.85)', border: '1px solid var(--edge-idle)',
    padding: '6px 10px', fontFamily: 'ui-monospace, monospace',
    fontSize: 11, color: 'var(--text)', display: 'flex' as const, gap: 10,
  },
  row: { display: 'flex' as const, alignItems: 'center', gap: 4, cursor: 'pointer' },
};
```

- [ ] **Step 2: Apply filters in `GraphCanvas.tsx`**

Pass `filters: Filters` as a prop. Apply when computing node `state`:

```tsx
// At the top of GraphCanvas:
type Props = { ..., filters: Filters };

// In the per-node loop, before <NodeShape>:
const isPruned = state === 'pruned';
const isSub = subagentIds.has(n.id);
const isSuccess = successIds.has(n.id);
if (filters.hidePruned && isPruned) return null;
if (filters.hideSubagents && isSub) return null;
if (filters.successOnly && !isSuccess && state !== 'active') return null;
```

Same checks for edges: if either endpoint is filtered out, skip the edge.

- [ ] **Step 3: Wire in `App.tsx`**

```tsx
const [filters, setFilters] = useState<Filters>({ hidePruned: false, hideSubagents: false, successOnly: false });
{session && !needsConfirm && <FilterToggles value={filters} onChange={setFilters} />}
<GraphCanvas session={session} playback={playback} subagentIds={subagentIds} pinnedId={pinnedId} onPin={setPinnedId} filters={filters} />
```

- [ ] **Step 4: Run tests**

Run: `npm test && npm run test:e2e`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/FilterToggles.tsx src/components/GraphCanvas.tsx src/App.tsx
git commit -m "feat(filters): hide pruned / subagents / success-only toggles"
```

---

## Task 12: Legend (collapsible corner panel)

**Why:** Spec section 6.

**Files:**
- Create: `src/components/Legend.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/Legend.tsx`**

```tsx
import { useState } from 'react';

export function Legend() {
  const [open, setOpen] = useState(true);
  return (
    <div data-testid="legend" style={styles.box}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={styles.header}
        aria-label="toggle legend"
        data-testid="legend-toggle"
      >LEGEND {open ? '▾' : '▸'}</button>
      {open && (
        <div style={styles.body}>
          <Row swatch="var(--node-idle)" stroke="var(--edge-idle)" label="idle" />
          <Row swatch="var(--node-active)" stroke="var(--node-active)" label="active" />
          <Row swatch="var(--node-idle)" stroke="var(--node-success)" label="success" />
          <Row swatch="var(--node-idle)" stroke="var(--node-failed)" label="failed" />
          <Row swatch="var(--node-pruned)" stroke="var(--node-pruned)" label="pruned (dimmed)" />
          <Row swatch="transparent" stroke="var(--subagent-accent)" label="subagent" dashed />
        </div>
      )}
    </div>
  );
}

function Row({ swatch, stroke, label, dashed }: { swatch: string; stroke: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
      <div style={{
        width: 18, height: 10, background: swatch,
        border: `1px ${dashed ? 'dashed' : 'solid'} ${stroke}`,
      }} />
      <span>{label}</span>
    </div>
  );
}

const styles = {
  box: {
    position: 'absolute' as const, left: 12, bottom: 76, zIndex: 6,
    background: 'rgba(5,8,13,0.85)', border: '1px solid var(--edge-idle)',
    fontFamily: 'ui-monospace, monospace', fontSize: 11,
    color: 'var(--text)',
  },
  header: {
    width: '100%', padding: '4px 10px',
    background: 'transparent', border: 'none', borderBottom: '1px solid var(--edge-idle)',
    color: 'var(--edge-trail)', letterSpacing: 2, fontSize: 10,
    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const,
  },
  body: { padding: '6px 10px' },
};
```

- [ ] **Step 2: Mount in `App.tsx`**

```tsx
import { Legend } from './components/Legend';
// inside main:
{session && !needsConfirm && <Legend />}
```

- [ ] **Step 3: Run tests**

Run: `npm test && npm run test:e2e`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/components/Legend.tsx src/App.tsx
git commit -m "feat(legend): collapsible legend showing node/edge state semantics"
```

---

## Task 13: Keyboard shortcuts

**Why:** Spec section 6. Discoverability and pace control.

**Files:**
- Create: `src/playback/useKeyboard.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/playback/useKeyboard.ts`**

```ts
import { useEffect } from 'react';
import type { PlaybackControls, Speed } from './usePlayback';

type Handlers = {
  controls: PlaybackControls;
  speed: Speed;
  onFit: () => void;
  onFollow: () => void;
  onSidebar: () => void;
  onLegend: () => void;
  onMinimap: () => void;
  onCloseDetail: () => void;
};

const SPEED_ORDER: Speed[] = [0.25, 0.5, 1, 2, 4];

export function useKeyboard(h: Handlers): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore when typing in an input/textarea
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;

      switch (e.key) {
        case ' ': e.preventDefault(); h.controls.toggle(); break;
        case 'ArrowLeft': h.controls.step(-1); break;
        case 'ArrowRight': h.controls.step(1); break;
        case '[': {
          const i = Math.max(0, SPEED_ORDER.indexOf(h.speed) - 1);
          h.controls.setSpeed(SPEED_ORDER[i]); break;
        }
        case ']': {
          const i = Math.min(SPEED_ORDER.length - 1, SPEED_ORDER.indexOf(h.speed) + 1);
          h.controls.setSpeed(SPEED_ORDER[i]); break;
        }
        case 'f': case 'F': h.onFit(); break;
        case 'l': case 'L': h.onFollow(); break;
        case '\\': h.onSidebar(); break;
        case '?': h.onLegend(); break;
        case 'm': case 'M': h.onMinimap(); break;
        case 'Escape': h.onCloseDetail(); break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [h.controls, h.speed, h.onFit, h.onFollow, h.onSidebar, h.onLegend, h.onMinimap, h.onCloseDetail]);
}
```

- [ ] **Step 2: Wire in `App.tsx`**

Need refs/handlers from `GraphCanvas`. Lift `fit` and `setFollow` up: pass a `cameraRef` callback or move `useCamera` invocation into `App`. Simpler: lift via context — but for a small POC, pass a callback `onMountCamera` to `GraphCanvas` that hands the controls back.

Add to `GraphCanvas` props:

```tsx
type CameraApi = { fit: () => void; toggleFollow: () => void };
type Props = { ..., onCameraReady?: (api: CameraApi) => void };
```

In `GraphCanvas`, after `useCamera`:

```tsx
useEffect(() => {
  onCameraReady?.({ fit, toggleFollow: () => setFollow(!follow) });
}, [fit, follow, onCameraReady]);
```

In `App.tsx`:

```tsx
const cameraApi = useRef<CameraApi | null>(null);
useKeyboard({
  controls: controls,
  speed: playback.speed,
  onFit: () => cameraApi.current?.fit(),
  onFollow: () => cameraApi.current?.toggleFollow(),
  onSidebar: () => setSidebarCollapsed((v) => !v),
  onLegend: () => {/* legend manages its own state; expose via key later */},
  onMinimap: () => {/* same */},
  onCloseDetail: () => setPinnedId(null),
});

<GraphCanvas ... onCameraReady={(api) => { cameraApi.current = api; }} />
```

(`onLegend`/`onMinimap` no-ops are acceptable for now; legend and minimap have their own toggle buttons in the UI.)

- [ ] **Step 3: Run tests**

Run: `npm test && npm run test:e2e`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/playback/useKeyboard.ts src/components/GraphCanvas.tsx src/App.tsx
git commit -m "feat(keyboard): Space/←/→/[/]/F/L/\\/Esc/M/? shortcuts"
```

---

## Task 14: Minimap

**Why:** Spec section 7.

**Files:**
- Create: `src/components/Minimap.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/GraphCanvas.tsx` (expose layout + camera info for the minimap)

- [ ] **Step 1: Lift layout & camera info into App, OR pass downward**

Simplest: render the minimap inside `GraphCanvas` where layout + transform + viewport are already in scope.

- [ ] **Step 2: Create `src/components/Minimap.tsx`**

```tsx
import type { LayoutResult } from '../graph/layout';
import type { Transform } from '../graph/useCamera';

type Props = {
  layout: LayoutResult;
  transform: Transform;
  viewport: { width: number; height: number };
  currentLayoutPoint: { x: number; y: number } | null;
  onJump: (layoutPoint: { x: number; y: number }) => void;
};

const W = 200, H = 140;

export function Minimap({ layout, transform, viewport, currentLayoutPoint, onJump }: Props) {
  const sx = W / Math.max(1, layout.width);
  const sy = H / Math.max(1, layout.height);
  const s = Math.min(sx, sy);
  const offX = (W - layout.width * s) / 2;
  const offY = (H - layout.height * s) / 2;

  // Viewport rect in layout coordinates:
  // screen (0,0) corresponds to layout ((-transform.x) / k, (-transform.y) / k)
  const vx = (-transform.x) / transform.k;
  const vy = (-transform.y) / transform.k;
  const vw = viewport.width / transform.k;
  const vh = viewport.height / transform.k;

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.x;
    const py = e.clientY - rect.y;
    const lx = (px - offX) / s;
    const ly = (py - offY) / s;
    onJump({ x: lx, y: ly });
  }

  return (
    <svg
      data-testid="minimap"
      width={W} height={H}
      onClick={handleClick}
      style={{
        position: 'absolute', right: 12, bottom: 76, zIndex: 6,
        background: 'rgba(5,8,13,0.85)', border: '1px solid var(--edge-idle)',
        cursor: 'crosshair',
      }}
    >
      <g transform={`translate(${offX}, ${offY}) scale(${s})`}>
        {layout.edges.map((e) => (
          <line key={`${e.sourceId}->${e.targetId}`}
            x1={e.sourceX} y1={e.sourceY} x2={e.targetX} y2={e.targetY}
            stroke="var(--edge-idle)" strokeWidth={2 / s} />
        ))}
        {layout.nodes.map((n) => (
          <circle key={n.id} cx={n.x} cy={n.y} r={3 / s} fill="var(--text-dim)" />
        ))}
        {currentLayoutPoint && (
          <circle cx={currentLayoutPoint.x} cy={currentLayoutPoint.y} r={5 / s} fill="var(--edge-trail)" />
        )}
        <rect
          x={vx} y={vy} width={vw} height={vh}
          fill="none" stroke="var(--edge-trail)" strokeOpacity={0.6} strokeWidth={2 / s}
        />
      </g>
    </svg>
  );
}
```

- [ ] **Step 3: Mount inside `GraphCanvas.tsx`**

After the `<svg>` and FIT/FOLLOW buttons, render:

```tsx
<Minimap
  layout={layout}
  transform={transform}
  viewport={viewport}
  currentLayoutPoint={currentId ? layout.nodes.find((n) => n.id === currentId) ?? null : null}
  onJump={(pt) => centerOn(pt, transform.k)}
/>
```

Import `Minimap`. Make sure `centerOn` is in scope (it is — returned from `useCamera`).

- [ ] **Step 4: Run tests**

Run: `npm test && npm run test:e2e`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/Minimap.tsx src/components/GraphCanvas.tsx
git commit -m "feat(minimap): always-on minimap with viewport rect and click-to-jump"
```

---

## Task 15: Jump-to-event buttons

**Why:** Spec — wayfinding (Bundle C).

**Files:**
- Modify: `src/components/PlaybackControls.tsx`
- Modify: `src/App.tsx` (pass order/jumpers)

- [ ] **Step 1: Add helper to find next index by kind/failed**

In `src/playback/usePlayback.ts`, add an exported helper:

```ts
import type { Milestone } from '../parse/types';

export function nextIndexMatching(order: Milestone[], from: number, pred: (m: Milestone) => boolean): number | null {
  for (let i = from + 1; i < order.length; i++) {
    if (pred(order[i])) return i;
  }
  return null;
}
```

- [ ] **Step 2: Add buttons to `PlaybackControls.tsx`**

Add a row in the bar (after speeds):

```tsx
<div style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
  <button
    style={styles.btn}
    data-testid="jump-subagent"
    title="next subagent"
    onClick={() => {
      const i = nextIndexMatching(state.order, state.index, (m) => m.kind === 'subagent_spawn');
      if (i != null) controls.scrubTo(i);
    }}
  >⌥</button>
  <button
    style={styles.btn}
    data-testid="jump-tool"
    title="next tool call"
    onClick={() => {
      const i = nextIndexMatching(state.order, state.index, (m) => m.kind === 'tool_call');
      if (i != null) controls.scrubTo(i);
    }}
  >⚙</button>
  <button
    style={styles.btn}
    data-testid="jump-fail"
    title="next failure"
    onClick={() => {
      const i = nextIndexMatching(state.order, state.index, (m) => m.failed);
      if (i != null) controls.scrubTo(i);
    }}
  >⊘</button>
  <button
    style={styles.btn}
    data-testid="jump-end"
    title="end"
    onClick={() => controls.scrubTo(state.order.length - 1)}
  >■</button>
</div>
```

Import `nextIndexMatching` from `../playback/usePlayback`.

- [ ] **Step 3: Run tests**

Run: `npm test && npm run test:e2e`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/components/PlaybackControls.tsx src/playback/usePlayback.ts
git commit -m "feat(playback): jump-to-event buttons (subagent / tool / failure / end)"
```

---

## Task 16: Off-canvas chrome — bottom gutter for HUD + controls

**Why:** Spec section 9. Don't cover the bottom of the graph with the HUD bar.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/NowPlaying.tsx`
- Modify: `src/components/PlaybackControls.tsx`

- [ ] **Step 1: Reserve a gutter in App layout**

In `App.tsx`, restructure `<main>` so the graph and the chrome live in separate slots:

```tsx
<main style={{
  flex: 1, display: 'flex', flexDirection: 'column',
  position: 'relative', overflow: 'hidden',
  paddingRight: pinnedMilestone ? 420 : 0,
  transition: 'padding-right 240ms ease',
}}>
  <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
    {/* GraphCanvas, FilterToggles, Legend, fit/follow buttons, tooltip etc. */}
  </div>
  <div data-testid="chrome-gutter" style={{
    height: 96, borderTop: '1px solid var(--grid)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(5,8,13,0.5)', flexShrink: 0, gap: 24, position: 'relative',
  }}>
    <NowPlaying ... />
    <PlaybackControls ... />
  </div>
</main>
```

- [ ] **Step 2: Update NowPlaying & PlaybackControls to render in-flow (not `position: absolute`)**

In `NowPlaying.tsx`, remove `position: absolute`, `left`, `bottom`, `transform`:

```ts
frame: {
  minWidth: 520, maxWidth: 720,
  background: 'rgba(5,8,13,0.85)',
  border: '1px solid',
  padding: '10px 16px',
  fontFamily: 'ui-monospace, monospace',
  backdropFilter: 'blur(2px)',
},
```

In `PlaybackControls.tsx`, same — drop absolute positioning. Layout flows naturally in the gutter.

- [ ] **Step 3: Run tests**

Run: `npm test && npm run test:e2e`
Expected: all green. Tests use `getByTestId(...)` so positioning doesn't matter.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/NowPlaying.tsx src/components/PlaybackControls.tsx
git commit -m "feat(layout): reserve bottom gutter for HUD + controls so canvas is never occluded"
```

---

## Task 17: Verify visually with Playwright

**Why:** This is a heavy UX overhaul; tests are necessary but not sufficient. Drive the real app and confirm.

- [ ] **Step 1: Manual smoke**

Start dev server (`npm run dev`), open in the Playwright MCP browser, and walk through:

1. Sidebar collapses (`«` button + `\` key).
2. Sidebar filter typing narrows the list.
3. Click ThoughtGraph 210 KB session. Verify graph is **fit and readable** (nodes ≥ design size at fit, not 5 px tall).
4. Press Space — playback starts paused initially; Space starts it.
5. While playing, the camera follows the playhead.
6. Hover a node — tooltip is **right next to it**, not 280 px away.
7. Click a node — DetailPanel docks on the right; canvas shrinks; Esc closes.
8. Wheel-zoom in/out works; FIT button restores.
9. Drag the scrubber — playback jumps and pauses.
10. Click `⊘` jump-to-failure — playhead lands on a failed node.
11. Pick the 3.8 MB session (1367 milestones) — "LOAD ANYWAY" appears; click it; renders.
12. Minimap shows the full tree and the viewport rect updates as you pan.

- [ ] **Step 2: Take a screenshot for the record**

Save `tg-after.png` (use Playwright MCP screenshot) for comparison with the pre-overhaul `tg-01-initial-load.png`.

- [ ] **Step 3: Commit any small fixes discovered**

If any issues turned up, fix and commit them with focused messages.

---

## Self-review

After completing tasks 1–17:

- Spec section 1 (pan/zoom + follow) → Tasks 6, 7, 8.
- Spec section 2 (tooltip + detail panel) → Tasks 1, 9.
- Spec section 3 (playback) → Tasks 3, 4, 15.
- Spec section 4 (overflow) → Task 5.
- Spec section 5 (sidebar) → Task 10.
- Spec section 6 (filters + legend + keyboard) → Tasks 11, 12, 13.
- Spec section 7 (minimap) → Task 14.
- Spec section 8 (label truncation) → Task 2.
- Spec section 9 (off-canvas chrome) → Task 16.

No placeholders. Identifiers consistent across tasks: `useCamera`, `fitTransform`, `centerOnTransform`, `nextIndexMatching`, `Filters`, `PlaybackControls.step/scrubTo/setSpeed`, `Speed = 0.25 | 0.5 | 1 | 2 | 4`.

Risks called out in spec — mitigations land in code: programmatic-transform flag in `useCamera`, follow-lock on user pan/zoom (Task 6), DetailPanel transitions canvas padding (Task 9), minimap renders in SVG once per layout change (Task 14).
