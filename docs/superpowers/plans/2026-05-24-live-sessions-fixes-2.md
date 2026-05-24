# Live Sessions Fixes Round 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five LIVE-sessions defects (pane explosion, header overlap, hairline gaps, broken MAIN after closures, non-sibling toolbar buttons) by tightening the active threshold to 30s, introducing a shared `CanvasToolbar`, padding the panes container, and giving the LIVE-engaged GraphCanvas auto-fit + auto-follow on mount.

**Architecture:** Single 30-second activity threshold drives both visibility and closing-countdown entry. A new `CanvasToolbar` component is the only source of LIVE/FOLLOW/FIT buttons — used by `App.tsx` (non-live path) and `LivePanes.tsx` (multi-pane LIVE-only, N=1 LIVE+FIT). `LivePanes` outer wrapper gains 56px top padding and a 12px gap with subtle cyan tint. A small `useLiveFollow` effect-pattern keeps the camera following the latest node in LIVE mode.

**Tech Stack:** React 19 + TypeScript 5.6, Vitest 3 + @testing-library/react, Playwright e2e, d3-zoom via existing `useCamera` hook. Spec: `docs/superpowers/specs/2026-05-24-live-sessions-fixes-2-design.md`. Current branch: `feature/live-sessions-fixes-2`.

---

## File map

**Modified files:**
- `src/components/live/liveness.ts` — `SUBAGENT_STABLE_MS: 60_000 → 30_000`
- `src/components/live/LivePanes.tsx` — apply visibility filter, outer padding, 12px gap, cyan tint, toolbar at both branches, camera fit+follow on mount in N=1
- `src/components/live/LivePane.tsx` — camera ref + setFollow(true) on mount
- `src/components/GraphCanvas.tsx` — remove inline FIT/FOLLOW JSX (toolbar takes over)
- `src/App.tsx` — remove inline `<LiveButton>` div; render `<CanvasToolbar>` in non-live path

**New files:**
- `src/components/CanvasToolbar.tsx` — flex-row container with LIVE/FOLLOW/FIT children (each `show*`-gated)
- `src/components/live/visibleSubagents.ts` — pure helper `pickVisibleSubagentEntries(entries, mtimes, statusMap, nowMs)` (filter rule extracted for testability)
- `tests/unit/components/CanvasToolbar.test.tsx`
- `tests/unit/live/visibleSubagents.test.ts`

**Deleted files:**
- `src/components/live/LiveButton.tsx` — superseded by CanvasToolbar's inline LIVE button
- `tests/unit/components/LiveButton.test.tsx`

**Modified tests (threshold change):**
- `tests/unit/live/liveness.test.ts`
- `tests/unit/live/paneStatus.test.ts`
- `tests/unit/components/LivePanes.test.tsx`

---

## Task 1: Drop SUBAGENT_STABLE_MS to 30s

**Files:**
- Modify: `src/components/live/liveness.ts`
- Modify (test): `tests/unit/live/liveness.test.ts`
- Modify (test): `tests/unit/live/paneStatus.test.ts`
- Modify (test): `tests/unit/components/LivePanes.test.tsx`

- [ ] **Step 1: Update the constant test to expect 30_000**

Edit `tests/unit/live/liveness.test.ts`, change line 17:

```ts
expect(SUBAGENT_STABLE_MS).toBe(30_000);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/unit/live/liveness.test.ts
```

Expected: FAIL with `expected 60000 to be 30000`.

- [ ] **Step 3: Update the constant in liveness.ts**

Edit `src/components/live/liveness.ts` line 4:

```ts
export const SUBAGENT_STABLE_MS = 30_000;
```

- [ ] **Step 4: Re-run; expect green**

```bash
npx vitest run tests/unit/live/liveness.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update paneStatus tests for new threshold**

Edit `tests/unit/live/paneStatus.test.ts`. Three replacements:

- Line 18: `const now = lastUpdated + 30_000;` → `const now = lastUpdated + 15_000;` (recent, half the new threshold)
- Line 25: `const now = lastUpdated + 60_001;` → `const now = lastUpdated + 30_001;`
- Line 32: `const closingStartedAt = lastUpdated + 60_001;` → `const closingStartedAt = lastUpdated + 30_001;`
- Line 39: `const closingStartedAt = lastUpdated + 60_001;` → `const closingStartedAt = lastUpdated + 30_001;`
- Line 45: `const frozenAt = lastUpdated + 70_000;` → `const frozenAt = lastUpdated + 40_000;`
- Line 49: `closingStartedAt: lastUpdated + 60_001,` → `closingStartedAt: lastUpdated + 30_001,`
- Line 59: `const frozenAt = lastUpdated + 70_000;` → `const frozenAt = lastUpdated + 40_000;`
- Line 61: `closingStartedAt: lastUpdated + 60_001,` → `closingStartedAt: lastUpdated + 30_001,`

- [ ] **Step 6: Update LivePanes test for new threshold**

Edit `tests/unit/components/LivePanes.test.tsx`:

- Line 79 in the "transitions ... after 60s" test: `vi.advanceTimersByTime(61_000)` → `vi.advanceTimersByTime(31_000)`
- Also update the test description string on line 69: `'transitions sub-agent pane to closing after 60s of stable mtime, then closed after 30s more'` → `'transitions sub-agent pane to closing after 30s of stable mtime, then closed after 30s more'`

- [ ] **Step 7: Run all unit tests; expect green**

```bash
npm test
```

Expected: PASS (full suite).

- [ ] **Step 8: Commit**

```bash
git add src/components/live/liveness.ts tests/unit/live/liveness.test.ts tests/unit/live/paneStatus.test.ts tests/unit/components/LivePanes.test.tsx
git commit -m "fix(live): SUBAGENT_STABLE_MS 60s -> 30s"
```

---

## Task 2: Pure helper — pickVisibleSubagentEntries

**Files:**
- Create: `src/components/live/visibleSubagents.ts`
- Create: `tests/unit/live/visibleSubagents.test.ts`

A pure function that decides which sub-agent entries should be rendered, given the current mtimes map and the existing pane status map. Rule: render if **mtime is within `SUBAGENT_STABLE_MS` of `nowMs`** OR **status is `'closing' | 'frozen'`** (in-flight lifecycle).

- [ ] **Step 1: Write the failing test file**

Create `tests/unit/live/visibleSubagents.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickVisibleSubagentEntries } from '../../../src/components/live/visibleSubagents';
import type { PaneState } from '../../../src/components/live/paneStatus';

type Entry = { key: string; spawnId: string; root: { id: string } };

const entry = (key: string): Entry => ({ key, spawnId: key.replace('spawn:', ''), root: { id: 'r' } });

describe('pickVisibleSubagentEntries', () => {
  const now = new Date('2026-05-24T12:00:00Z').getTime();

  it('keeps entries whose paired fileId mtime is within 30s of now', () => {
    const entries = [entry('spawn:a')];
    const keyToFileId = new Map([['spawn:a', 'agent-aaaa']]);
    const mtimes = { 'agent-aaaa': new Date(now - 5_000).toISOString() };
    expect(pickVisibleSubagentEntries(entries, keyToFileId, mtimes, {}, now)).toEqual(entries);
  });

  it('drops entries whose paired fileId mtime is older than 30s (and not in lifecycle)', () => {
    const entries = [entry('spawn:a')];
    const keyToFileId = new Map([['spawn:a', 'agent-aaaa']]);
    const mtimes = { 'agent-aaaa': new Date(now - 60_000).toISOString() };
    expect(pickVisibleSubagentEntries(entries, keyToFileId, mtimes, {}, now)).toEqual([]);
  });

  it('drops entries whose paired fileId is missing from mtimes', () => {
    const entries = [entry('spawn:a')];
    const keyToFileId = new Map<string, string>();
    expect(pickVisibleSubagentEntries(entries, keyToFileId, {}, {}, now)).toEqual([]);
  });

  it('keeps stale-mtime entries if their status is closing (lifecycle in flight)', () => {
    const entries = [entry('spawn:a')];
    const keyToFileId = new Map([['spawn:a', 'agent-aaaa']]);
    const mtimes = { 'agent-aaaa': new Date(now - 60_000).toISOString() };
    const status: Record<string, PaneState> = {
      'spawn:a': { status: 'closing', closingStartedAt: now - 1_000, frozenAt: null, frozenRemainingMs: null },
    };
    expect(pickVisibleSubagentEntries(entries, keyToFileId, mtimes, status, now)).toEqual(entries);
  });

  it('keeps stale-mtime entries if their status is frozen', () => {
    const entries = [entry('spawn:a')];
    const keyToFileId = new Map([['spawn:a', 'agent-aaaa']]);
    const mtimes = { 'agent-aaaa': new Date(now - 60_000).toISOString() };
    const status: Record<string, PaneState> = {
      'spawn:a': { status: 'frozen', closingStartedAt: now - 10_000, frozenAt: now - 5_000, frozenRemainingMs: 15_000 },
    };
    expect(pickVisibleSubagentEntries(entries, keyToFileId, mtimes, status, now)).toEqual(entries);
  });

  it('drops entries whose status is closed even with fresh mtime', () => {
    const entries = [entry('spawn:a')];
    const keyToFileId = new Map([['spawn:a', 'agent-aaaa']]);
    const mtimes = { 'agent-aaaa': new Date(now).toISOString() };
    const status: Record<string, PaneState> = {
      'spawn:a': { status: 'closed', closingStartedAt: now - 50_000, frozenAt: null, frozenRemainingMs: null },
    };
    expect(pickVisibleSubagentEntries(entries, keyToFileId, mtimes, status, now)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/unit/live/visibleSubagents.test.ts
```

Expected: FAIL with "Cannot find module '.../visibleSubagents'".

- [ ] **Step 3: Implement the helper**

Create `src/components/live/visibleSubagents.ts`:

```ts
import { SUBAGENT_STABLE_MS } from './liveness';
import type { PaneState } from './paneStatus';

export function pickVisibleSubagentEntries<E extends { key: string }>(
  entries: E[],
  keyToFileId: Map<string, string>,
  subagentMtimes: Record<string, string>,
  statusMap: Record<string, PaneState>,
  nowMs: number,
): E[] {
  return entries.filter((e) => {
    const status = statusMap[e.key]?.status;
    if (status === 'closed') return false;
    if (status === 'closing' || status === 'frozen') return true;
    const fileId = keyToFileId.get(e.key);
    if (!fileId) return false;
    const mtimeIso = subagentMtimes[fileId];
    if (!mtimeIso) return false;
    const mtimeMs = new Date(mtimeIso).getTime();
    return nowMs - mtimeMs < SUBAGENT_STABLE_MS;
  });
}
```

- [ ] **Step 4: Run the test; expect green**

```bash
npx vitest run tests/unit/live/visibleSubagents.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/live/visibleSubagents.ts tests/unit/live/visibleSubagents.test.ts
git commit -m "feat(live): pickVisibleSubagentEntries pure helper for pane filter"
```

---

## Task 3: Wire pickVisibleSubagentEntries into LivePanes

**Files:**
- Modify: `src/components/live/LivePanes.tsx:78-93` (build entries → filter → status map)
- Modify (test): `tests/unit/components/LivePanes.test.tsx` (add test for historical-subagent exclusion)

- [ ] **Step 1: Write the failing test for historical-subagent filtering**

Add the following test inside the `describe('LivePanes', () => { ... })` block in `tests/unit/components/LivePanes.test.tsx`, right after the existing tests:

```ts
  it('hides historical sub-agents whose file mtime is older than 30s at session open', () => {
    const session = makeSession([m('a')], [
      { id: 'agent-aaaa1111', lastUpdatedAt: '2026-05-24T12:00:00Z', root: m('s1') }, // fresh
      { id: 'agent-bbbb2222', lastUpdatedAt: '2026-05-24T11:00:00Z', root: m('s2') }, // 1h old
    ]);
    render(<LivePanes session={session} subagentMtimes={{
      'agent-aaaa1111': '2026-05-24T12:00:00Z',
      'agent-bbbb2222': '2026-05-24T11:00:00Z',
    }} />);
    // MAIN + 1 fresh sub-agent = N=2
    expect(screen.getAllByTestId('live-pane')).toHaveLength(2);
    expect(screen.getByTestId('live-panes-grid').getAttribute('data-n')).toBe('2');
  });
```

- [ ] **Step 2: Run; expect failure**

```bash
npx vitest run tests/unit/components/LivePanes.test.tsx
```

Expected: FAIL with `expected length 2 to be 2` or count mismatch (currently renders both regardless of mtime).

- [ ] **Step 3: Apply the filter inside LivePanes**

Edit `src/components/live/LivePanes.tsx`. Add this import near the top alongside the others:

```ts
import { pickVisibleSubagentEntries } from './visibleSubagents';
```

Replace the block starting at line 120:

```ts
const displayable = subagentEntries.filter((e) => statusMap[e.key]?.status !== 'closed');
const total = 1 + displayable.length;
```

with:

```ts
const displayable = pickVisibleSubagentEntries(subagentEntries, keyToFileId, subagentMtimes, statusMap, nowMs);
const total = 1 + displayable.length;
```

- [ ] **Step 4: Run unit tests; expect green**

```bash
npm test
```

Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add src/components/live/LivePanes.tsx tests/unit/components/LivePanes.test.tsx
git commit -m "fix(live): hide historical sub-agent panes (mtime > 30s old)"
```

---

## Task 4: New CanvasToolbar component

**Files:**
- Create: `src/components/CanvasToolbar.tsx`
- Create: `tests/unit/components/CanvasToolbar.test.tsx`

A flex-row, position-absolute toolbar with LIVE/FOLLOW/FIT children, each gated on a `show*` prop. Renders nothing when all are false. Inlines LIVE button styling (replaces standalone LiveButton component).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/CanvasToolbar.test.tsx`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CanvasToolbar } from '../../../src/components/CanvasToolbar';

const noop = () => {};

describe('CanvasToolbar', () => {
  it('renders nothing when all show* are false', () => {
    const { container } = render(
      <CanvasToolbar
        showLive={false} liveEngaged={false} onToggleLive={noop}
        showFit={false} onFit={noop}
        showFollow={false} follow={false} onToggleFollow={noop}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders only LIVE when showLive=true and others false', () => {
    render(
      <CanvasToolbar
        showLive={true} liveEngaged={false} onToggleLive={noop}
        showFit={false} onFit={noop}
        showFollow={false} follow={false} onToggleFollow={noop}
      />
    );
    expect(screen.getByTestId('live-button')).toBeTruthy();
    expect(screen.queryByTestId('fit-button')).toBeNull();
    expect(screen.queryByTestId('follow-toggle')).toBeNull();
  });

  it('renders all three when all show* are true', () => {
    render(
      <CanvasToolbar
        showLive={true} liveEngaged={false} onToggleLive={noop}
        showFit={true} onFit={noop}
        showFollow={true} follow={false} onToggleFollow={noop}
      />
    );
    expect(screen.getByTestId('live-button')).toBeTruthy();
    expect(screen.getByTestId('fit-button')).toBeTruthy();
    expect(screen.getByTestId('follow-toggle')).toBeTruthy();
  });

  it('reflects liveEngaged via aria-pressed on the LIVE button', () => {
    const { rerender } = render(
      <CanvasToolbar
        showLive={true} liveEngaged={false} onToggleLive={noop}
        showFit={false} onFit={noop}
        showFollow={false} follow={false} onToggleFollow={noop}
      />
    );
    expect(screen.getByTestId('live-button').getAttribute('aria-pressed')).toBe('false');
    rerender(
      <CanvasToolbar
        showLive={true} liveEngaged={true} onToggleLive={noop}
        showFit={false} onFit={noop}
        showFollow={false} follow={false} onToggleFollow={noop}
      />
    );
    expect(screen.getByTestId('live-button').getAttribute('aria-pressed')).toBe('true');
  });

  it('fires the right callback on each button click', () => {
    const onToggleLive = vi.fn();
    const onFit = vi.fn();
    const onToggleFollow = vi.fn();
    render(
      <CanvasToolbar
        showLive={true} liveEngaged={false} onToggleLive={onToggleLive}
        showFit={true} onFit={onFit}
        showFollow={true} follow={false} onToggleFollow={onToggleFollow}
      />
    );
    fireEvent.click(screen.getByTestId('live-button'));
    fireEvent.click(screen.getByTestId('follow-toggle'));
    fireEvent.click(screen.getByTestId('fit-button'));
    expect(onToggleLive).toHaveBeenCalledTimes(1);
    expect(onToggleFollow).toHaveBeenCalledTimes(1);
    expect(onFit).toHaveBeenCalledTimes(1);
  });

  it('renders LIVE/FOLLOW/FIT in that left-to-right order when all shown', () => {
    render(
      <CanvasToolbar
        showLive={true} liveEngaged={false} onToggleLive={noop}
        showFit={true} onFit={noop}
        showFollow={true} follow={false} onToggleFollow={noop}
      />
    );
    const buttons = Array.from(document.querySelectorAll('[data-testid="canvas-toolbar"] button'));
    expect(buttons.map((b) => b.getAttribute('data-testid'))).toEqual([
      'live-button', 'follow-toggle', 'fit-button',
    ]);
  });
});
```

- [ ] **Step 2: Run; expect failure**

```bash
npx vitest run tests/unit/components/CanvasToolbar.test.tsx
```

Expected: FAIL with "Cannot find module '.../CanvasToolbar'".

- [ ] **Step 3: Implement the component**

Create `src/components/CanvasToolbar.tsx`:

```tsx
import type { CSSProperties } from 'react';

type Props = {
  showLive: boolean;
  liveEngaged: boolean;
  onToggleLive: () => void;

  showFit: boolean;
  onFit: () => void;

  showFollow: boolean;
  follow: boolean;
  onToggleFollow: () => void;
};

const container: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  zIndex: 6,
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  pointerEvents: 'auto',
};

const baseBtn: CSSProperties = {
  background: 'rgba(5,8,13,0.85)',
  padding: '2px 8px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 9,
  letterSpacing: 2,
  height: 20,
  boxSizing: 'border-box',
  cursor: 'pointer',
};

const liveBtn: CSSProperties = {
  ...baseBtn,
  border: '1px solid rgba(0,229,255,0.55)',
  color: '#00e5ff',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  textShadow: '0 0 6px rgba(0,229,255,0.55)',
  boxShadow: '0 0 8px rgba(0,229,255,0.18), inset 0 0 8px rgba(0,229,255,0.08)',
};

const liveDot: CSSProperties = {
  width: 4,
  height: 4,
  borderRadius: '50%',
  background: '#00e5ff',
  boxShadow: '0 0 5px #00e5ff',
  animation: 'livePulse 1.4s ease-in-out infinite',
};

const fitBtn: CSSProperties = {
  ...baseBtn,
  border: '1px solid var(--edge-idle)',
  color: 'var(--text)',
};

function followBtnStyle(follow: boolean): CSSProperties {
  return {
    ...baseBtn,
    border: `1px solid ${follow ? 'var(--edge-trail)' : 'var(--edge-idle)'}`,
    color: follow ? 'var(--edge-trail)' : 'var(--text)',
  };
}

export function CanvasToolbar({
  showLive, liveEngaged, onToggleLive,
  showFit, onFit,
  showFollow, follow, onToggleFollow,
}: Props) {
  if (!showLive && !showFit && !showFollow) return null;
  return (
    <div data-testid="canvas-toolbar" style={container}>
      {showLive && (
        <button
          data-testid="live-button"
          aria-pressed={liveEngaged}
          onClick={onToggleLive}
          title={liveEngaged ? 'exit live mode' : 'enter live mode'}
          style={liveBtn}
        >
          <span data-testid="live-button-dot" style={liveDot} />
          LIVE
        </button>
      )}
      {showFollow && (
        <button
          data-testid="follow-toggle"
          onClick={onToggleFollow}
          title="follow playhead (L)"
          style={followBtnStyle(follow)}
        >
          FOLLOW
        </button>
      )}
      {showFit && (
        <button
          data-testid="fit-button"
          onClick={onFit}
          title="fit (F)"
          style={fitBtn}
        >
          FIT
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run; expect green**

```bash
npx vitest run tests/unit/components/CanvasToolbar.test.tsx
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/CanvasToolbar.tsx tests/unit/components/CanvasToolbar.test.tsx
git commit -m "feat(canvas): CanvasToolbar component (LIVE/FOLLOW/FIT siblings)"
```

---

## Task 5: Use CanvasToolbar inside GraphCanvas (remove inline FIT/FOLLOW)

**Files:**
- Modify: `src/components/GraphCanvas.tsx:254-283` (remove the two inline `<button>` blocks)

The toolbar will be rendered by parents (`App.tsx` for the non-live path and `LivePanes.tsx` for live paths). GraphCanvas itself no longer renders FIT or FOLLOW. The `compact` and `liveEngaged` flags still inform parents but no longer gate inline buttons inside GraphCanvas.

- [ ] **Step 1: Delete the inline FIT and FOLLOW buttons**

Edit `src/components/GraphCanvas.tsx`. Delete lines 254–283 (the two `{!compact && (` and `{!liveEngaged && !compact && (` blocks containing the FIT and FOLLOW buttons). The Minimap (line 284+) and tooltip below stay.

After deletion the render's bottom should read:

```tsx
        </g>
      </svg>
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
      {hover && <NodeTooltip milestone={hover.milestone} screenX={hover.screenX} screenY={hover.screenY} />}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck and tests**

```bash
npm run typecheck && npm test
```

Expected: typecheck PASS; some component tests may fail because they look for `[data-testid="fit-button"]` rendered inside GraphCanvas. Those failures will be resolved when CanvasToolbar is wired into App.tsx (next task).

- [ ] **Step 3: Identify failures (informational only)**

```bash
npm test 2>&1 | grep -E "FAIL|fit-button|follow-toggle" | head
```

Expected output: zero or a small list. They will be addressed in Task 6. If e2e is failing here too, defer those to the sweep step.

- [ ] **Step 4: Commit**

```bash
git add src/components/GraphCanvas.tsx
git commit -m "refactor(canvas): drop inline FIT/FOLLOW (CanvasToolbar takes over)"
```

---

## Task 6: Wire CanvasToolbar into App.tsx + delete LiveButton

**Files:**
- Modify: `src/App.tsx` (lines 11, 217–227, after `<GraphCanvas>` JSX)
- Delete: `src/components/live/LiveButton.tsx`
- Delete: `tests/unit/components/LiveButton.test.tsx`

The single-canvas (not-live-engaged) path renders `<CanvasToolbar showLive={sessionIsLive} showFit showFollow ... />` as a sibling of `<GraphCanvas>`. The LIVE button absolute-positioned div is removed entirely from App.tsx since the toolbar now owns LIVE.

- [ ] **Step 1: Remove the LiveButton import**

Edit `src/App.tsx` line 11. Remove this line:

```ts
import { LiveButton } from './components/live/LiveButton';
```

Add immediately above the existing GraphCanvas import:

```ts
import { CanvasToolbar } from './components/CanvasToolbar';
```

- [ ] **Step 2: Delete the LiveButton absolute div in App.tsx**

Delete the block lines 217–227 of `src/App.tsx` (the `{sessionIsLive && (<div style={{ position: 'absolute', top: 12, right: liveEngaged ? 50 : 88, zIndex: 6, pointerEvents: 'auto' }}><LiveButton .../></div>)}` block).

- [ ] **Step 3: Add CanvasToolbar inside the non-live-engaged branch of the canvasSlot**

In `src/App.tsx`, find the `{liveEngaged ? (...) : (<>...</>)}` ternary. Replace the `<>` branch (which currently renders `<GraphCanvas .../>`, `<FilterToggles .../>`, `<Legend />`) with:

```tsx
              ) : (
                <>
                  <GraphCanvas
                    session={effectiveSession}
                    playback={playback}
                    subagentIds={subagentIds}
                    pinnedId={pinnedId}
                    onPin={setPinnedId}
                    onScrubTo={followingControls.scrubTo}
                    filters={filters}
                    onCameraReady={(api) => { cameraRef.current = api; }}
                    liveEngaged={liveEngaged}
                  />
                  <CanvasToolbar
                    showLive={sessionIsLive}
                    liveEngaged={liveEngaged}
                    onToggleLive={() => setLiveEngaged((v) => !v)}
                    showFit={true}
                    onFit={() => cameraRef.current?.fit()}
                    showFollow={true}
                    follow={cameraRef.current?.follow ?? false}
                    onToggleFollow={() => {
                      const next = !(cameraRef.current?.follow ?? false);
                      cameraRef.current?.setFollow(next);
                    }}
                  />
                  <FilterToggles value={filters} onChange={setFilters} />
                  <Legend />
                </>
              )}
```

- [ ] **Step 4: Delete the LiveButton component and its test**

```bash
rm src/components/live/LiveButton.tsx tests/unit/components/LiveButton.test.tsx
```

- [ ] **Step 5: Run typecheck and unit tests**

```bash
npm run typecheck && npm test
```

Expected: PASS. Any LivePanes test that relied on `[data-testid="live-button"]` should still pass because the LIVE button still exists with that testid inside CanvasToolbar.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/live/LiveButton.tsx tests/unit/components/LiveButton.test.tsx src/components/CanvasToolbar.tsx
git commit -m "feat(app): use CanvasToolbar; drop separate LiveButton component"
```

---

## Task 7: Pad LivePanes outer wrapper, bump gap, add cyan tint

**Files:**
- Modify: `src/components/live/LivePanes.tsx` (outer wrapper, `gridStyle`, `fullscreenStyle`)

Headers + toolbar no longer overlap because the panes container starts at y=56. Panes get 12px breathing room and a faint cyan field shows between them.

- [ ] **Step 1: Wrap the existing grid/fullscreen content in a padded outer div**

Edit `src/components/live/LivePanes.tsx`. Replace the top-level styles (lines 19–32) with:

```ts
const outerStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  padding: '56px 12px 12px 12px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
};

const gridStyle = (n: number): CSSProperties => ({
  flex: 1,
  display: 'grid',
  gridTemplateColumns: n === 1 ? '1fr' : '1fr 1fr',
  gap: 12,
  background: 'rgba(0,229,255,0.05)',
  minHeight: 0,
});

const fullscreenStyle: CSSProperties = {
  flex: 1, minHeight: 0, position: 'relative',
};

const lastSpanStyle: CSSProperties = { gridColumn: 'span 2' };
```

- [ ] **Step 2: Wrap both render branches in the outer div**

In the same file, replace the N=1 return block (currently `return ( <div data-testid="live-panes-grid" data-n={1} data-fullscreen="true" style={fullscreenStyle}> ... )`) with:

```tsx
if (total === 1) {
  const mainPlayback = makeLivePlayback(mainRoot);
  const mainSession: Session = { ...session, root: mainRoot, totalMilestones: mainPlayback.order.length };
  const subagentIds = collectSubagentIds(mainRoot);
  return (
    <div style={outerStyle}>
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
    </div>
  );
}
```

And replace the N≥2 return block with:

```tsx
return (
  <div style={outerStyle}>
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
  </div>
);
```

- [ ] **Step 3: Run unit tests**

```bash
npm test
```

Expected: PASS — existing tests query by `[data-testid="live-panes-grid"]` which still exists, and the outer wrapper doesn't affect their assertions.

- [ ] **Step 4: Commit**

```bash
git add src/components/live/LivePanes.tsx
git commit -m "fix(live): 56px header offset, 12px pane gap, subtle cyan tint"
```

---

## Task 8: N=1 short-circuit — toolbar + auto-fit + auto-follow

**Files:**
- Modify: `src/components/live/LivePanes.tsx` (N=1 branch)

Pass `onCameraReady` to the inner GraphCanvas. On first ready, fit() + setFollow(true). On every order-length change, setFollow(true) so the camera continues to track the latest node.

- [ ] **Step 1: Add the imports and refs at the top of the LivePanes component**

In `src/components/live/LivePanes.tsx`, add these imports near the top:

```ts
import { CanvasToolbar } from '../CanvasToolbar';
import type { CameraApi } from '../../graph/useCamera';
```

Inside the `LivePanes` component body, add these refs after the existing `intervalRef`:

```ts
const mainCameraRef = useRef<CameraApi | null>(null);
const mainFittedRef = useRef(false);
```

- [ ] **Step 2: Add the N=1 camera-follow effect**

Below the existing `useEffect` blocks but before the `freezeToggle` function, add:

```ts
const mainOrderLength = useMemo(
  () => (total === 1 ? makeLivePlayback(mainRoot).order.length : 0),
  [total, mainRoot],
);

useEffect(() => {
  if (total !== 1) return;
  const cam = mainCameraRef.current;
  if (!cam) return;
  cam.setFollow(true);
}, [total, mainOrderLength]);
```

Note: the inline `makeLivePlayback(mainRoot)` re-runs inside the useMemo just for the order length — acceptable because `flattenDFS` is O(n) and only triggers when `mainRoot` reference changes (i.e., when session refetches and mainRoot is recomputed).

- [ ] **Step 3: Wire onCameraReady + toolbar into the N=1 return block**

Replace the N=1 return block from Task 7 with this version (adds toolbar, `onCameraReady`, and an inline fit-once-on-first-ready):

```tsx
if (total === 1) {
  const mainPlayback = makeLivePlayback(mainRoot);
  const mainSession: Session = { ...session, root: mainRoot, totalMilestones: mainPlayback.order.length };
  const subagentIds = collectSubagentIds(mainRoot);
  return (
    <div style={outerStyle}>
      <CanvasToolbar
        showLive={true}
        liveEngaged={true}
        onToggleLive={onToggleLive}
        showFit={true}
        onFit={() => mainCameraRef.current?.fit()}
        showFollow={false}
        follow={false}
        onToggleFollow={() => {}}
      />
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
          onCameraReady={(api) => {
            mainCameraRef.current = api;
            if (!mainFittedRef.current) {
              mainFittedRef.current = true;
              api.fit();
              api.setFollow(true);
            }
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Accept an `onToggleLive` prop on LivePanes (so the in-pane toolbar can toggle LIVE off)**

In the same file, update the `Props` type at the top:

```ts
type Props = {
  session: Session;
  subagentMtimes: Record<string, string>;
  onToggleLive: () => void;
};
```

And destructure it in the component signature:

```ts
export function LivePanes({ session, subagentMtimes, onToggleLive }: Props) {
```

- [ ] **Step 5: Pass `onToggleLive` from App.tsx**

Edit `src/App.tsx`. Change the `<LivePanes session={effectiveSession} subagentMtimes={effectiveSession.subagentMtimes} />` line to:

```tsx
<LivePanes
  session={effectiveSession}
  subagentMtimes={effectiveSession.subagentMtimes}
  onToggleLive={() => setLiveEngaged((v) => !v)}
/>
```

- [ ] **Step 6: Update LivePanes test to pass onToggleLive**

Edit `tests/unit/components/LivePanes.test.tsx`. In every `render(<LivePanes ... />)` call, add the prop:

```tsx
render(<LivePanes session={session} subagentMtimes={{}} onToggleLive={() => {}} />);
```

(Apply to all four `render` / `rerender` call sites in the file.)

- [ ] **Step 7: Run typecheck and tests**

```bash
npm run typecheck && npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/live/LivePanes.tsx src/App.tsx tests/unit/components/LivePanes.test.tsx
git commit -m "feat(live): N=1 toolbar + auto-fit + auto-follow on mount/refetch"
```

---

## Task 9: Multi-pane toolbar (LIVE only) + per-pane camera follow

**Files:**
- Modify: `src/components/live/LivePanes.tsx` (N≥2 return block — add LIVE-only toolbar)
- Modify: `src/components/live/LivePane.tsx` (capture cameraRef + setFollow(true) on mount)

- [ ] **Step 1: Add LIVE-only toolbar to the N≥2 branch**

Edit `src/components/live/LivePanes.tsx`. Replace the N≥2 return block (from Task 7) with:

```tsx
return (
  <div style={outerStyle}>
    <CanvasToolbar
      showLive={true}
      liveEngaged={true}
      onToggleLive={onToggleLive}
      showFit={false}
      onFit={() => {}}
      showFollow={false}
      follow={false}
      onToggleFollow={() => {}}
    />
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
  </div>
);
```

- [ ] **Step 2: Add camera-follow effect inside LivePane**

Edit `src/components/live/LivePane.tsx`. Add these imports near the top:

```ts
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { CameraApi } from '../../graph/useCamera';
```

(useRef and useEffect are added to the existing import list.)

Inside the `LivePane` component body, after the existing `useState`:

```ts
const cameraRef = useRef<CameraApi | null>(null);
const fittedRef = useRef(false);

useEffect(() => {
  if (cameraRef.current) cameraRef.current.setFollow(true);
}, [playback.order.length]);
```

Update the `<GraphCanvas ... />` call inside the pane to add `onCameraReady`:

```tsx
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
  onCameraReady={(api) => {
    cameraRef.current = api;
    if (!fittedRef.current) {
      fittedRef.current = true;
      api.fit();
      api.setFollow(true);
    }
  }}
/>
```

- [ ] **Step 3: Run typecheck and unit tests**

```bash
npm run typecheck && npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/live/LivePanes.tsx src/components/live/LivePane.tsx
git commit -m "feat(live): multi-pane LIVE-only toolbar + per-pane camera follow"
```

---

## Task 10: Final sweep — typecheck, unit, e2e, manual verify

**Files:**
- None (verification only)

- [ ] **Step 1: Typecheck**

```bash
npm run typecheck
```

Expected: clean exit, no errors.

- [ ] **Step 2: Full unit test suite**

```bash
npm test
```

Expected: all suites green. The total count should reflect: -3 from deleted `LiveButton.test.tsx`, +6 from new `CanvasToolbar.test.tsx`, +6 from new `visibleSubagents.test.ts`, +1 from new LivePanes filter test = net +10.

- [ ] **Step 3: E2E suite**

```bash
npm run test:e2e
```

Expected: same pass rate as before this branch (`hud-readout.spec.ts` may still have its pre-existing flake — re-run if it fails alone). Critically, `tests/e2e/live-session-tag.spec.ts` should still pass: it asserts `aria-pressed=true` on a button with class behavior matching the LIVE toggle, which CanvasToolbar provides identically.

- [ ] **Step 4: Manual verification in the running dev server**

```bash
npm run dev
```

Open `http://localhost:5173`, navigate to a live session (touch a session JSONL's mtime to "now" if needed). Verify each bug per the spec's Verification section §1–§6:

1. ≤2 panes when only MAIN is active and recent (not 30).
2. 12px visible gap with faint cyan tint between panes.
3. Session header (top-left) and toolbar (top-right) are clear of pane content.
4. N=1 live mode: canvas fills slot, FIT visible alongside LIVE, FOLLOW hidden; new milestones from a `touch` on the JSONL re-center the camera on the latest node.
5. Manually close all sub-agents (or wait for the 30+30s lifecycle) — MAIN remains usable, all nodes visible, camera follows the latest node.
6. With LIVE *not* engaged (toggle off), LIVE+FOLLOW+FIT all share `y=12`, `gap: 8`, in that left-to-right order.

- [ ] **Step 5: Commit (verification log only, if anything was found)**

If no issues are surfaced in step 4, no commit is needed.

If something was off, add a final fix commit. Suggested message style:

```bash
git commit -m "fix(live): <specific fix surfaced by manual verify>"
```

- [ ] **Step 6: Stop the visual companion server**

```bash
bash "$HOME/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/brainstorming/scripts/stop-server.sh" .superpowers/brainstorm/17579-1779610859
```

- [ ] **Step 7: Hand back to user**

Report results in the chat. Do NOT merge to main — `feature/live-sessions-fixes-2` stays on the feature branch until the user verifies and explicitly authorizes the merge (per project git workflow).

---

## Self-review

**Spec coverage:**

- §1 30s threshold: Task 1.
- §1 visibility filter: Tasks 2 + 3.
- §2 shared CanvasToolbar with proper sibling layout: Tasks 4 + 5 + 6 (GraphCanvas), and used in Tasks 8 + 9 (LivePanes).
- §3 56px outer padding: Task 7.
- §4 12px gap + cyan 5% tint: Task 7.
- §5A auto-fit on mount: Task 8 (N=1) + Task 9 (per-pane).
- §5B default follow=true: Task 8 + Task 9.
- §5C same logic in compact sub-agent panes: Task 9.

Every spec requirement maps to a task. The `extractMainTrail.ts` helper (noted as unused in earlier context) is not touched by this plan — it remains a separate cleanup follow-up.

**Placeholder scan:** No "TBD", "TODO", or "implement later". Every code step contains complete, copy-pasteable code. Test code is concrete with real assertions, no `// add more tests` stubs.

**Type consistency:** `CanvasToolbar`'s prop shape is the same in Task 4 (definition), Task 6 (App.tsx), Task 8 (N=1), Task 9 (N≥2). `pickVisibleSubagentEntries`'s signature is the same in Task 2 (definition) and Task 3 (usage). `LivePanes` Props are extended once in Task 8 and the same shape is consumed in App.tsx and tests in the same task — no later drift.