# LIVE Per-Pane Inspectors (Details + Logical Steps) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In LIVE mode, remove the single global inspector dock and give each agent pane (MAIN + each subagent) its own right panel with `Details` + `Logical Steps` tabs scoped to that pane; clicking a Logical Step pins its start node in that pane's graph (and in the single graph in playback).

**Architecture:** Each `LivePane` already has its own pin state, its own `playback` (DFS order of that pane's `root`), its own camera, and an inline detail aside. Refactor that aside into a small in-pane tabbed panel: the `Details` tab keeps today's inline content; the `Logical Steps` tab renders the existing `<NarrativeTab>` against a per-pane narrative scope key. The narrator never reads the session file (it transforms POSTed milestones in a fixed cwd), so the `sessionId` path segment is an opaque cache key — a composite `${sessionId}__${safePaneId}` needs **zero server changes**. The global `InspectorTabs` dock is rendered only in playback.

**Tech Stack:** React 18 + TypeScript, Vite dev-server plugins (the API), `@tanstack/react-query` (data hooks), Vitest + @testing-library/react (unit, jsdom — no layout), Playwright (e2e, real browser). Build/typecheck via `tsc -b` (composite project; plain `tsc --noEmit` reads stale cached `server/*.d.ts`).

## Global Constraints

- **Do not change the server or API:** `server/vite-plugin-narrative.ts`, `server/narrative-state.ts`, `src/api/client.ts`, `src/api/hooks.ts` stay untouched. The composite scope id flows through `isSafeScopeKey` (`/^[A-Za-z0-9._-]+$/`, not `.`/`..`) and the in-memory store as an opaque string.
- **Do not regress recent fixes:** `.narr-flow { min-height:0; overflow-y:auto; overflow-x:hidden }` in `src/theme/narrative.css`; `DetailPanel` `overflow-x:hidden`/`overflow-wrap:anywhere`; the playback `chrome-gutter` reserve (`gutterReserve`) in `App.tsx`; the `tmp/` and narrator session filters.
- **Logical Steps stays opt-in per pane** — each pane only runs a narrator after its own Enable click (the `NarrativeTab`'s internal `enabled` state gates the query). Each enabled pane is a separate ~50s `claude -p` (haiku) call; do not auto-enable.
- **Typecheck command is `npm run typecheck`** (`tsc -b`), never bare `tsc --noEmit`.
- **Flaky tests on this Windows box (IPv4 127.0.0.1 vs server IPv6 ::1):** `tests/unit/server/gate-script.test.ts` "listening only on IPv6 ::1" and `tests/e2e/control-bar.spec.ts` test 1 (`ECONNREFUSED`) intermittently fail under full-suite load but pass in isolation — re-run before assuming a regression; they are unrelated to this work.

---

## File Structure

- `src/narrative/scopeKey.ts` (**new**) — pure helpers `safePaneId` + `narrativeScopeId`. Single source of truth for the per-pane key delimiter/sanitization.
- `src/components/narrative/NarrativeTab.tsx` (**modify**) — add optional `onSelectNode` prop; call it on block click. Serves both hosts (per-pane LIVE + playback dock).
- `src/components/live/LivePane.tsx` (**modify, main work**) — accept `projectId`/`sessionId`; refactor the `live-pane-detail` aside into a `Details | Logical Steps` tabbed column-flex panel; the Logical Steps tab mounts `<NarrativeTab>` scoped to this pane and pins on block click.
- `src/components/live/LivePanes.tsx` (**modify**) — thread `projectId`/`sessionId` into both panes; remove the now-dead `onControlBarHeight` measure wiring.
- `src/App.tsx` (**modify**) — render `<InspectorTabs>` only in playback; pass `onSelectNode={setPinnedId}`; drop `liveBarReserve`; simplify `bottomInset={gutterReserve}`.
- Tests: `tests/unit/narrative/scopeKey.test.ts` (**new**), extend `tests/unit/components/narrative-tab.test.tsx`, extend `tests/unit/components/LivePane.test.tsx`, new `tests/e2e/live-per-pane-inspector.spec.ts`, update `tests/e2e/control-bar.spec.ts` and `tests/e2e/narrative.spec.ts`.

---

### Task 1: `scopeKey` util (per-pane narrative key)

**Files:**
- Create: `src/narrative/scopeKey.ts`
- Test: `tests/unit/narrative/scopeKey.test.ts`

**Interfaces:**
- Produces: `safePaneId(paneId: string): string`; `narrativeScopeId(sessionId: string, paneId: string): string`.

- [ ] **Step 1: Write the failing test** — `tests/unit/narrative/scopeKey.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { safePaneId, narrativeScopeId } from '../../../src/narrative/scopeKey';
import { isSafeScopeKey } from '../../../server/plugin-shared';

describe('safePaneId', () => {
  it('leaves an already-safe id unchanged', () => {
    expect(safePaneId('main')).toBe('main');
  });
  it('replaces colon and other unsafe chars with dash', () => {
    expect(safePaneId('spawn:abc')).toBe('spawn-abc');
  });
  it('produces a value that passes the server scope-key validator', () => {
    expect(isSafeScopeKey(safePaneId('spawn:abc'))).toBe(true);
  });
});

describe('narrativeScopeId', () => {
  const sid = '2026-05-24-live-fixture';
  it('suffixes the (sanitized) pane id with the __ delimiter', () => {
    expect(narrativeScopeId(sid, 'main')).toBe(`${sid}__main`);
    expect(narrativeScopeId(sid, 'spawn:abc')).toBe(`${sid}__spawn-abc`);
  });
  it('MAIN scope differs from the bare sessionId and from subagent scopes', () => {
    expect(narrativeScopeId(sid, 'main')).not.toBe(sid);
    expect(narrativeScopeId(sid, 'main')).not.toBe(narrativeScopeId(sid, 'spawn:abc'));
  });
  it('the full scope id passes the server scope-key validator', () => {
    expect(isSafeScopeKey(narrativeScopeId(sid, 'spawn:abc'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/unit/narrative/scopeKey.test.ts`
Expected: FAIL — cannot resolve `../../../src/narrative/scopeKey`.

- [ ] **Step 3: Implement** — `src/narrative/scopeKey.ts`

```ts
/** Sanitize a pane id into a narrative-scope-safe token. The server validates
 *  each scope segment with isSafeScopeKey = /^[A-Za-z0-9._-]+$/, and subagent
 *  pane ids look like `spawn:<id>` (the ':' is not allowed). */
export function safePaneId(paneId: string): string {
  return paneId.replace(/[^A-Za-z0-9._-]/g, '-');
}

/** Per-pane narrative cache/store key, passed as the `sessionId` argument to the
 *  narrative hooks/API. The narrator never reads the session file (it transforms
 *  the POSTed milestones in a fixed cwd), so this composite is an opaque key.
 *  MAIN is suffixed too (never the bare sessionId) so a LIVE MAIN narrative never
 *  collides with the playback narrative keyed by the bare sessionId. */
export function narrativeScopeId(sessionId: string, paneId: string): string {
  return `${sessionId}__${safePaneId(paneId)}`;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run tests/unit/narrative/scopeKey.test.ts`
Expected: PASS (7 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/narrative/scopeKey.ts tests/unit/narrative/scopeKey.test.ts
git commit -m "feat(narrative): per-pane narrative scope-key helper"
```

---

### Task 2: `NarrativeTab` pins the start node on block click

**Files:**
- Modify: `src/components/narrative/NarrativeTab.tsx`
- Test: `tests/unit/components/narrative-tab.test.tsx`

**Interfaces:**
- Produces: `NarrativeTabProps.onSelectNode?: (milestoneId: string) => void` — called with `block.startMilestoneId` on every block click (independent of whether the scrub index resolves). `InspectorTabsProps extends NarrativeTabProps`, so the prop flows through `InspectorTabs` automatically.

- [ ] **Step 1: Extend the failing test** — in `tests/unit/components/narrative-tab.test.tsx`, add `onSelectNode: vi.fn()` to the `props` object and replace the existing click test body:

```tsx
const props = {
  projectId: 'p', sessionId: 's', live: false,
  milestones: [], orderIds: ['m1', 'm2', 'm3', 'm4'], currentIndex: 3,
  onScrubToIndex: vi.fn(), onSelectNode: vi.fn(),
};
```

```tsx
  it('click on a block scrubs to its start index AND selects its start node', () => {
    render(<NarrativeTab {...props} />);
    fireEvent.click(screen.getByTestId('narr-enable'));
    fireEvent.click(screen.getByTestId('narr-block-b2'));
    expect(props.onScrubToIndex).toHaveBeenCalledWith(2);  // m3 -> index 2
    expect(props.onSelectNode).toHaveBeenCalledWith('m3'); // b2.startMilestoneId
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/unit/components/narrative-tab.test.tsx`
Expected: FAIL — `onSelectNode` not called.

- [ ] **Step 3: Implement** — in `src/components/narrative/NarrativeTab.tsx`:

Add to the `NarrativeTabProps` interface (after `onScrubToIndex`):
```tsx
  /** Pin/select the block's start node. Optional so playback + per-pane hosts share this. */
  onSelectNode?: (milestoneId: string) => void;
```
Add `onSelectNode` to the destructure on the props line:
```tsx
  const { projectId, sessionId, live, milestones, orderIds, currentIndex, onScrubToIndex, onSelectNode } = props;
```
Update the block `onClick` (currently scrub-only):
```tsx
                    onClick={() => {
                      const idx = indexForBlockStart(b, indexMap);
                      if (idx >= 0) onScrubToIndex(idx);
                      onSelectNode?.(b.startMilestoneId);
                    }}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run tests/unit/components/narrative-tab.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/narrative/NarrativeTab.tsx tests/unit/components/narrative-tab.test.tsx
git commit -m "feat(narrative): NarrativeTab pins the start node on block click"
```

---

### Task 3: `LivePane` per-pane tabbed inspector (Details + Logical Steps)

**Files:**
- Modify: `src/components/live/LivePane.tsx`
- Test: `tests/unit/components/LivePane.test.tsx`

**Interfaces:**
- Consumes: `narrativeScopeId` (Task 1); `NarrativeTab` with `onSelectNode` (Task 2).
- Produces: `LivePane` props gain `projectId: string` and `sessionId: string`. New testids: `pane-tab-details`, `pane-tab-narrative`. The `live-pane-detail` aside testid is **kept**.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/components/LivePane.test.tsx`.

At the **top of the file** (after the existing imports), add a hooks mock so the embedded `NarrativeTab` renders without a QueryClient:
```tsx
vi.mock('../../../src/api/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/hooks')>()),
  useNarrative: () => ({ data: undefined, dataUpdatedAt: 0 }),
  useStartNarrative: () => ({ mutate: vi.fn(), isPending: false }),
  useTickNarrative: () => ({ mutate: vi.fn() }),
  useRefreshNarrative: () => ({ mutate: vi.fn() }),
}));
```
Add `fireEvent` to the testing-library import line:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
```
Add these tests inside the `describe('LivePane', ...)` block (all existing `render(...)` calls also need the two new required props — update them to pass `projectId="p" sessionId="s"`):
```tsx
  it('renders Details and Logical Steps tabs; Details is active by default', () => {
    const root = m('a', 'Read App.tsx', 'first', [m('b', 'Grep', 'newest')]);
    render(<LivePane kind="main" label="MAIN" root={root} cwd="/c" paneId="p1" projectId="p" sessionId="s" />);
    expect(screen.getByTestId('pane-tab-details')).toBeTruthy();
    expect(screen.getByTestId('pane-tab-narrative')).toBeTruthy();
    // Default Details tab shows the selected (newest) node's label.
    expect(screen.getByTestId('live-pane-detail').textContent).toContain('Grep');
  });

  it('switching to the Logical Steps tab shows the per-pane enable prompt', () => {
    const root = m('a', 'Read App.tsx', 'first', [m('b', 'Grep', 'newest')]);
    render(<LivePane kind="main" label="MAIN" root={root} cwd="/c" paneId="p1" projectId="p" sessionId="s" />);
    fireEvent.click(screen.getByTestId('pane-tab-narrative'));
    expect(screen.getByTestId('narr-enable')).toBeTruthy();
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/unit/components/LivePane.test.tsx`
Expected: FAIL — `pane-tab-details` not found (and TS errors on missing `projectId`/`sessionId`).

- [ ] **Step 3: Implement** — edit `src/components/live/LivePane.tsx`.

(a) Imports — add after the `makeLivePlayback` import:
```tsx
import { NarrativeTab } from '../narrative/NarrativeTab';
import { narrativeScopeId } from '../../narrative/scopeKey';
```

(b) Props — add to the `Props` type:
```tsx
  /** Project + session ids for this pane's own Logical Steps narrative (keyed per pane). */
  projectId: string;
  sessionId: string;
```
Add them to the destructure in the function signature (`export function LivePane({ ... })`):
```tsx
  kind, label, root, cwd, paneId, projectId, sessionId,
```

(c) Change `detailStyle` to a bounded column-flex container so the Logical Steps list can scroll inside it. Replace its `overflow: 'auto',` line with:
```tsx
    display: 'flex', flexDirection: 'column', minHeight: 0,
    overflow: 'hidden',
```

(d) Add tab styles near the other module-level style consts (e.g. after `detailStyle`):
```tsx
const paneTabBar: CSSProperties = {
  display: 'flex', flexShrink: 0, marginBottom: 8,
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};
function paneTabStyle(active: boolean, accent: string): CSSProperties {
  return {
    flex: 1, padding: '4px 0', fontSize: 9, letterSpacing: 1.5,
    cursor: 'pointer', background: 'none', border: 'none',
    fontFamily: 'ui-monospace, monospace',
    color: active ? accent : '#6e95a5',
    borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
  };
}
const paneTabContent: CSSProperties = {
  flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden',
};
```

(e) Inside the component body, add state + derived data after the existing `const selected = pinned ?? newest;`:
```tsx
  const [tab, setTab] = useState<'details' | 'narrative'>('details');
  const scopeId = useMemo(() => narrativeScopeId(sessionId, paneId), [sessionId, paneId]);
  const paneOrderIds = useMemo(() => playback.order.map((mm) => mm.id), [playback.order]);
  const paneNarratorMilestones = useMemo(
    () => playback.order.map((mm) => ({
      id: mm.id, kind: mm.kind, label: mm.label, summary: mm.summary, result: mm.result,
    })),
    [playback.order],
  );
```

(f) Replace the entire `<aside data-testid="live-pane-detail" ...> ... </aside>` block (current detail aside) with the tabbed version below. The Details tab content is the **existing** `MAIN · NODE` row + PINNED control + `selected` block, moved verbatim inside an `overflow:auto` wrapper; the Logical Steps tab mounts `NarrativeTab`:
```tsx
      <aside data-testid="live-pane-detail" style={detailStyle(showHeader, kind === 'main' ? ACCENT_MAIN : ACCENT_SUB)}>
        <div style={paneTabBar}>
          <button type="button" data-testid="pane-tab-details" onClick={() => setTab('details')} style={paneTabStyle(tab === 'details', accent)}>Details</button>
          <button type="button" data-testid="pane-tab-narrative" onClick={() => setTab('narrative')} style={paneTabStyle(tab === 'narrative', accent)}>Logical Steps</button>
        </div>
        <div style={paneTabContent}>
          {tab === 'details' ? (
            <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 9, letterSpacing: 3, color: accent }}>
                  {kind === 'main' ? 'MAIN · NODE' : 'SUBAGENT · NODE'}
                </span>
                {pinned && (
                  <button
                    type="button"
                    data-testid="live-pane-unpin"
                    onClick={() => setPinnedId(null)}
                    title="return to live"
                    aria-label="return to live"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: 'rgba(5,8,13,0.6)', border: `1px solid ${accent}`,
                      color: accent, fontFamily: 'ui-monospace, monospace',
                      fontSize: 8, letterSpacing: 2, padding: '2px 6px',
                      cursor: 'pointer', flexShrink: 0, boxShadow: `0 0 6px ${accent}55`,
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 7 }}>●</span>
                    PINNED
                    <span aria-hidden style={{ fontSize: 10, lineHeight: 1 }}>✕</span>
                  </button>
                )}
              </div>
              {selected && (
                <>
                  <div style={{ fontSize: 11, color: '#d4e9f0', marginBottom: 4 }}>{selected.label}</div>
                  <div style={{ fontSize: 10, color: '#6e95a5' }}>{selected.summary}</div>
                  {selected.result && (
                    <div style={{ fontSize: 10, color: selected.failed ? 'var(--node-failed)' : '#6e95a5', marginTop: 6, whiteSpace: 'pre-wrap' }}>{selected.result}</div>
                  )}
                  {selected.detail && (
                    <pre style={{
                      fontSize: 10, color: '#6e95a5', whiteSpace: 'pre-wrap', margin: '8px 0 0 0',
                      background: 'rgba(15,38,50,0.4)', padding: '6px 8px', border: '1px solid var(--grid)',
                    }}>{selected.detail}</pre>
                  )}
                </>
              )}
            </div>
          ) : (
            <div style={{ position: 'absolute', inset: 0 }}>
              <NarrativeTab
                projectId={projectId}
                sessionId={scopeId}
                live
                milestones={paneNarratorMilestones}
                orderIds={paneOrderIds}
                currentIndex={playback.index}
                onScrubToIndex={() => { /* no playhead scrub in LIVE; pinning drives the graph */ }}
                onSelectNode={(id) => setPinnedId(id)}
              />
            </div>
          )}
        </div>
      </aside>
```

- [ ] **Step 4: Run the unit test + typecheck**

Run: `npx vitest run tests/unit/components/LivePane.test.tsx`
Expected: PASS (existing tests + 2 new). Then `npm run typecheck` → exit 0.
Note: existing `render(<LivePane .../>)` calls in this file must include `projectId="p" sessionId="s"` (added in Step 1) or typecheck fails.

- [ ] **Step 5: Commit**

```bash
git add src/components/live/LivePane.tsx tests/unit/components/LivePane.test.tsx
git commit -m "feat(live): per-pane Details | Logical Steps inspector tabs"
```

---

### Task 4: `LivePanes` threads ids + drops dead control-bar measure wiring

**Files:**
- Modify: `src/components/live/LivePanes.tsx`

**Interfaces:**
- Consumes: `LivePane` now requires `projectId`/`sessionId` (Task 3).
- Produces: `LivePanes` `Props` no longer has `onControlBarHeight` (App stops passing it in Task 5).

- [ ] **Step 1: Thread ids into both panes.** `LivePanes` already has `projectId` (prop) and `const sessionId = session.id;`. Add `projectId={projectId} sessionId={sessionId}` to BOTH `<LivePane>` usages:
  - MAIN: `<LivePane kind="main" label="MAIN" root={mainRoot} cwd={session.cwd} paneId="main" projectId={projectId} sessionId={sessionId} ... />`
  - subagent: `<LivePane kind="subagent" ... paneId={e.key} projectId={projectId} sessionId={sessionId} ... />`

- [ ] **Step 2: Remove the dead control-bar measure wiring** (the global dock no longer overlays the control bar in LIVE):
  - Delete `onControlBarHeight?: (px: number) => void;` from the `Props` type (and its doc comment).
  - Remove `onControlBarHeight` from the function's destructured params.
  - Delete the `const outerRef = useRef<HTMLDivElement | null>(null);` line and the entire `useEffect(() => { ... ResizeObserver ... }, [onControlBarHeight]);` block that measures the control bar.
  - Change `<div ref={outerRef} style={outerStyle}>` back to `<div style={outerStyle}>`.

- [ ] **Step 3: Typecheck + LivePanes unit test**

Run: `npm run typecheck` (expect exit 0) then `npx vitest run tests/unit/components/LivePanes.test.tsx` (expect PASS).
Note: typecheck will FAIL until Task 5 removes App's `onControlBarHeight={setLiveBarReserve}` prop. If running tasks strictly in order, accept the typecheck error here referencing `App.tsx`'s `onControlBarHeight` and proceed to Task 5, then re-run. (Or do Task 4 + Task 5 before the first typecheck.)

- [ ] **Step 4: Commit** (combined with Task 5 is fine; if committing alone:)

```bash
git add src/components/live/LivePanes.tsx
git commit -m "refactor(live): thread project/session into panes; drop control-bar measure"
```

---

### Task 5: `App.tsx` — dock playback-only + playback pin-on-click

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `InspectorTabs` forwards `onSelectNode` to `NarrativeTab` (it spreads `...narrative`; no `InspectorTabs` change needed).

- [ ] **Step 1: Render the global dock only in playback + add pin-on-click.** Replace the unconditional `<InspectorTabs .../>` block with a guarded one (and the two prop changes — `bottomInset` and the new `onSelectNode`):

```tsx
          {!liveEngaged && (
            <InspectorTabs
              key={`${inspectorSession.projectId}/${inspectorSession.sessionId}`}
              milestone={displayedMilestone}
              onClose={handleDetailClose}
              width={detailWidth}
              onResize={(d) => setDetailWidth((w) => w + d)}
              projectId={inspectorSession.projectId}
              sessionId={inspectorSession.sessionId}
              live={liveEngaged}
              bottomInset={gutterReserve}
              milestones={narratorMilestones}
              orderIds={orderIds}
              currentIndex={playback.index}
              onScrubToIndex={(i) => followingControls.scrubTo(i)}
              onSelectNode={(id) => setPinnedId(id)}
            />
          )}
```

- [ ] **Step 2: Remove the dead `liveBarReserve` state** — delete this line (added for the LIVE dock that no longer renders):
```tsx
  const [liveBarReserve, setLiveBarReserve] = useState(0);
```
Update the comment above the reserve state to mention only the playback gutter (it currently references the LIVE control bar). Keep `gutterReserve`, `gutterRef`, and the gutter ResizeObserver — they still serve the playback dock.

- [ ] **Step 3: Stop passing `onControlBarHeight` to `<LivePanes>`** — remove the `onControlBarHeight={setLiveBarReserve}` prop from the `<LivePanes ... />` usage.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0 (no remaining references to `liveBarReserve` or `onControlBarHeight`).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/live/LivePanes.tsx
git commit -m "feat(live): per-pane inspectors replace the global dock in LIVE; playback dock pins on step click"
```

---

### Task 6: e2e — new per-pane spec + update affected specs

**Files:**
- Create: `tests/e2e/live-per-pane-inspector.spec.ts`
- Modify: `tests/e2e/control-bar.spec.ts`, `tests/e2e/narrative.spec.ts`

**Interfaces:**
- Consumes: LIVE fixture `C--demo-live/2026-05-24-live-fixture` (made live via `utimes`); `TG_NARRATOR_FAKE=1` (set in `playwright.config.ts`) so each pane's narrator returns canned `fake-1`/`fake-2` blocks instantly.

- [ ] **Step 1: Create `tests/e2e/live-per-pane-inspector.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { utimes } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../fixtures/claude-projects/C--demo-live/2026-05-24-live-fixture.jsonl');
const SESSION_ID = '2026-05-24-live-fixture';

test('LIVE: per-pane Details|Logical Steps replaces the global dock; step click pins', async ({ page }) => {
  const now = new Date();
  await utimes(FIXTURE, now, now);
  await page.goto('/');
  await page.locator(`[data-testid="session-item-${SESSION_ID}"]`).click();
  await expect(page.locator('[data-testid="live-panes-grid"]')).toBeVisible({ timeout: 15_000 });

  // The single global dock must NOT exist in LIVE.
  await expect(page.getByTestId('inspector-tabs')).toHaveCount(0);

  // MAIN pane has its own tabbed inspector, Details active by default.
  const mainPane = page.locator('[data-testid="live-pane"]').first();
  await expect(mainPane.getByTestId('pane-tab-details')).toBeVisible();
  await expect(mainPane.getByTestId('pane-tab-narrative')).toBeVisible();

  // Open this pane's Logical Steps (opt-in), enable, get fake blocks.
  await mainPane.getByTestId('pane-tab-narrative').click();
  await expect(mainPane.getByTestId('narr-enable')).toBeVisible({ timeout: 5_000 });
  await mainPane.getByTestId('narr-enable').click();
  await expect(mainPane.getByTestId('narr-flow')).toBeVisible({ timeout: 15_000 });
  await expect(mainPane.getByTestId('narr-block-fake-1')).toBeVisible({ timeout: 10_000 });

  // Click a step -> pins that pane's start node. Switch to Details -> PINNED control shows.
  await mainPane.getByTestId('narr-block-fake-1').click();
  await mainPane.getByTestId('pane-tab-details').click();
  await expect(mainPane.getByTestId('live-pane-unpin')).toBeVisible({ timeout: 5_000 });

  // The Logical Steps list stays inside the pane's aside (no downward overflow),
  // and is a vertical scroll container.
  await mainPane.getByTestId('pane-tab-narrative').click();
  const flow = mainPane.getByTestId('narr-flow');
  await expect(flow).toHaveCSS('min-height', '0px');
  await expect(flow).toHaveCSS('overflow-y', 'auto');
  const withinAside = await flow.evaluate((el) => {
    const aside = el.closest('[data-testid="live-pane-detail"]') as HTMLElement;
    return el.getBoundingClientRect().bottom <= aside.getBoundingClientRect().bottom + 1;
  });
  expect(withinAside).toBe(true);
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/live-per-pane-inspector.spec.ts`
Expected: 1 passed. (If the fixture renders only a MAIN pane, that's fine — the spec targets `.first()` pane.)

- [ ] **Step 3: Update `tests/e2e/control-bar.spec.ts`** — DELETE the test titled `inspector dock stops above the control bar (collapsed and expanded)` (the global `inspector-tabs` no longer renders in LIVE, so it would fail). Keep the first test (`bar renders ... gate round-trips`) and the last (`control bar controls stay click-reachable under a z-index:4 pane overlay` — the per-pane aside still carries `zIndex:4`, so it remains valid).

- [ ] **Step 4: Update `tests/e2e/narrative.spec.ts` (playback)** — after the existing block-click line (`await page.locator('[data-testid="narr-block-fake-2"]').click();`), assert the playback dock now pins the start node by switching to Details and confirming the detail panel renders:

```ts
  // Clicking a step now also pins/selects its start node (playback): the Details
  // tab shows the pinned node.
  await page.locator('[data-testid="tab-details"]').click();
  await expect(page.locator('[data-testid="detail-panel"]')).toBeVisible({ timeout: 5_000 });
```

- [ ] **Step 5: Run the affected e2e specs**

Run: `npx playwright test tests/e2e/live-per-pane-inspector.spec.ts tests/e2e/narrative.spec.ts tests/e2e/control-bar.spec.ts`
Expected: all pass (re-run on the known `control-bar` test-1 `ECONNREFUSED` IPv6 flake).

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/live-per-pane-inspector.spec.ts tests/e2e/control-bar.spec.ts tests/e2e/narrative.spec.ts
git commit -m "test(live): per-pane inspector e2e; retarget dock specs"
```

---

### Task 7: Full verification + manual Playwright pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 2: Full unit suite**

Run: `npx vitest run`
Expected: all pass (516 existing + new). If `gate-script.test.ts` "IPv6 ::1" fails, re-run it alone: `npx vitest run tests/unit/server/gate-script.test.ts` (known flake).

- [ ] **Step 3: Full e2e suite**

Run: `npx playwright test`
Expected: pass except the documented pre-existing baseline failures (hologram/playback/camera/hud/zoom) and the `control-bar` IPv6 flake; the new + updated narrative/live specs pass.

- [ ] **Step 4: Manual verification via Playwright MCP** (dev server on :5173, or the e2e webServer on :5174 with `TG_NARRATOR_FAKE=1` + fixture `CLAUDE_HOME`). Do NOT kill the user's running dev server; navigate the MCP browser to it.
  1. `browser_navigate` to the app; open a live session (touch the fixture mtime first, or use a genuinely-live session). `browser_snapshot` → confirm the multi-pane grid and that `inspector-tabs` is **absent**.
  2. In a pane: click `pane-tab-narrative` → Enable → fake/real blocks render. `browser_resize` narrower to stress the ~36% column; confirm the list scrolls and `narr-flow.bottom <= live-pane-detail.bottom`.
  3. Click a Logical Step → the pane's graph highlights the start node; `pane-tab-details` shows the `live-pane-unpin` PINNED control; click it to return to live.
  4. If multiple panes exist, open a subagent pane's Logical Steps → confirm it has its **own** Enable (independent opt-in) and its own blocks.
  5. Toggle LIVE off (`live-button`) → the global playback dock returns and clears the chrome gutter; click a block there → it scrubs **and** the Details tab shows the pinned node.
  6. `browser_network_requests` → per-pane narrative POSTs use distinct `…__main` / `…__spawn-xxx` URLs. `browser_console_messages` → no errors.

- [ ] **Step 5: Finish** — invoke `superpowers:finishing-a-development-branch` to decide merge/PR for `feature/logical-steps-narrative` (this branch now carries the whole narrative/inspector UI stack).

---

## Self-Review

- **Spec coverage:** remove global LIVE dock → Task 5; per-pane Details+Logical Steps → Task 3; per-pane narrative key (no server change) → Task 1; opt-in per pane → inherent in `NarrativeTab`'s `enabled` gate (Task 3 mounts it, no auto-enable); pin start node on click in LIVE → Task 3 (`onSelectNode={setPinnedId}`); pin in playback → Task 5; tests → Tasks 1,2,3,6; preserve fixes/no-server-change → Global Constraints + Task 5 keeps `gutterReserve`.
- **Type consistency:** `safePaneId`/`narrativeScopeId` (Task 1) used in Task 3; `onSelectNode?: (milestoneId: string) => void` defined in Task 2, consumed in Task 3 (`(id) => setPinnedId(id)`) and Task 5; `LivePane` new required props `projectId`/`sessionId` defined in Task 3, supplied in Task 4; `onControlBarHeight` removed in Task 4 (Props) and Task 5 (caller) together.
- **Ordering caveat:** Task 4's standalone typecheck fails until Task 5 removes App's `onControlBarHeight` usage — do Tasks 4+5 before the first green typecheck (noted in Task 4 Step 3).
- **Fragile spot:** the scroll bound inside the margined aside (Task 3 (c)+(f)) — verified by the e2e `withinAside` assertion (Task 6) and the manual narrow-column resize (Task 7).
- **Camera note:** in LIVE, pinning highlights the node (the pane is fit-to-view so it's visible) but does not re-center the camera (`onScrubToIndex` is a no-op in LIVE); playback does re-center via `scrubTo`. If users later want LIVE camera focus-on-pin, that's a follow-up (would need a camera focus-by-id API on `CameraApi`).
