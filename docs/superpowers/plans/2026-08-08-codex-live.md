# Codex Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recently updated Codex sessions use ClaudeWatch's existing read-only Live replay, including directly matched recursive subagent panes, while preserving Claude Live controls and behavior.

**Architecture:** Generalize the existing liveness and App routing rather than adding a second Live path. Keep pane rendering and lifecycle provider-neutral, select provider-specific subagent association in a small pure helper, and move Claude control hooks behind a Claude-only component boundary so Codex never instantiates them.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest, Testing Library, Playwright, Vite session provider adapters.

## Global Constraints

- Codex Live is read-only; it must perform no pause, resume, steer, hook-install, or other write operation.
- Keep the existing 180-second session liveness threshold, seven-second polling interval, 30-second subagent freshness threshold, and 30-second closing countdown.
- Keep the existing greater-than-1,000-milestone `LOAD ANYWAY` safeguard.
- Preserve Claude liveness, alphabetical subagent-file association, controls, replay, and all other Claude-only product areas.
- Use Codex `spawnThreadId` to match child rollout `threadId`; use nickname/path-derived spawn labels for Codex panes.
- A failed refresh must retain the last successful TanStack Query data.
- Add no npm or host dependency and write nothing under `CLAUDE_HOME` or `CODEX_HOME`.
- Remove only `Codex live monitoring` from `future_developments.md`; keep Codex pause/steer deferred.

---

## File Structure

- Modify `src/components/live/liveness.ts`: classify both supported providers with the shared freshness predicate.
- Modify `src/parse/types.ts`: expose the parser's existing `spawnThreadId` on normalized milestones.
- Create `src/components/live/subagentAssociation.ts`: pure provider-specific spawn-to-rollout mapping and pane-label logic.
- Create `src/components/live/ClaudeLiveControls.tsx`: own every Claude control hook and render the existing control bar around a render-prop child.
- Modify `src/components/live/LivePanes.tsx`: consume the association helper, render Codex with an empty control snapshot, and render Claude through `ClaudeLiveControls`.
- Modify `src/App.tsx`: allow an engaged Codex session to enter the existing Live path.
- Modify `tests/unit/live/liveness.test.ts`: lock provider-neutral liveness.
- Create `tests/unit/live/subagentAssociation.test.ts`: lock direct Codex matching, labels, and unchanged Claude ordering.
- Modify `tests/unit/components/LivePanes.test.tsx`: cover Codex panes, recursion inputs, and absence of control calls/UI.
- Modify `tests/e2e/codex-provider.spec.ts`: retain historical replay coverage while making its fixture timestamp deterministic.
- Create `tests/e2e/codex-live.spec.ts`: exercise automatic Live entry, refresh, nested panes, reactivation, controls absence, and replay exit against safely restored fixtures.
- Modify `future_developments.md`: mark only Codex monitoring as delivered.

---

### Task 1: Provider-neutral session liveness

**Files:**
- Modify: `tests/unit/live/liveness.test.ts`
- Modify: `src/components/live/liveness.ts`

**Interfaces:**
- Consumes: `SessionMeta.provider: 'claude' | 'codex'` and `SessionMeta.lastUpdatedAt: string`.
- Produces: `isLiveMeta(meta: SessionMeta): boolean`, shared unchanged by session cards, App selection, and polling.

- [ ] **Step 1: Change the Codex liveness test to express the new contract**

Replace the old negative Codex assertion with:

```ts
it('treats a recent Codex rollout as live', () => {
  expect(isLiveMeta({ ...meta('2026-05-24T12:00:00Z'), provider: 'codex' })).toBe(true);
});

it('treats a stale Codex rollout as not live', () => {
  expect(isLiveMeta({ ...meta('2026-05-24T11:56:59Z'), provider: 'codex' })).toBe(false);
});
```

- [ ] **Step 2: Run the focused test and verify the new assertion fails**

Run: `npm.cmd test -- tests/unit/live/liveness.test.ts`

Expected: FAIL because `isLiveMeta` still rejects every `provider: 'codex'` value.

- [ ] **Step 3: Remove the Claude-only guard**

Implement the provider-neutral predicate in `src/components/live/liveness.ts`:

```ts
export function isLiveMeta(meta: SessionMeta): boolean {
  return Date.now() - new Date(meta.lastUpdatedAt).getTime() < LIVE_THRESHOLD_MS;
}
```

Do not change any exported timing constant.

- [ ] **Step 4: Run the focused test and typecheck**

Run: `npm.cmd test -- tests/unit/live/liveness.test.ts`

Expected: PASS.

Run: `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit provider-neutral liveness**

```powershell
git add src/components/live/liveness.ts tests/unit/live/liveness.test.ts
git commit -m "feat: classify recent Codex sessions as live"
```

---

### Task 2: Deterministic provider-specific subagent association

**Files:**
- Modify: `src/parse/types.ts`
- Create: `src/components/live/subagentAssociation.ts`
- Create: `tests/unit/live/subagentAssociation.test.ts`

**Interfaces:**
- Consumes: `ProviderId`, spawn entry `{ key, spawnThreadId, spawnLabel }`, and `Record<string, string>` keyed by Claude file ID or Codex thread ID.
- Produces: `associateSubagentFiles(provider, entries, subagentMtimes): Map<string, string>` and `liveSubagentLabel(provider, fileId, spawnLabel): string`.

- [ ] **Step 1: Write failing association and label tests**

Create `tests/unit/live/subagentAssociation.test.ts` with these cases:

```ts
import { describe, expect, it } from 'vitest';
import { associateSubagentFiles, liveSubagentLabel } from '../../../src/components/live/subagentAssociation';

const entries = [
  { key: 'spawn:second', spawnThreadId: 'thread-b', spawnLabel: '→ Auditor' },
  { key: 'spawn:first', spawnThreadId: 'thread-a', spawnLabel: '→ Scout' },
];

describe('associateSubagentFiles', () => {
  it('preserves Claude alphabetical positional pairing', () => {
    const result = associateSubagentFiles('claude', entries, {
      'agent-bbbb': 'b',
      'agent-aaaa': 'a',
    });
    expect([...result.entries()]).toEqual([
      ['spawn:second', 'agent-aaaa'],
      ['spawn:first', 'agent-bbbb'],
    ]);
  });

  it('matches Codex entries directly by spawn thread id regardless of order', () => {
    const result = associateSubagentFiles('codex', entries, {
      'thread-a': 'a',
      'thread-b': 'b',
    });
    expect(result.get('spawn:second')).toBe('thread-b');
    expect(result.get('spawn:first')).toBe('thread-a');
  });

  it('does not invent a Codex mapping for a missing rollout', () => {
    const result = associateSubagentFiles('codex', entries, { 'thread-a': 'a' });
    expect(result.has('spawn:second')).toBe(false);
  });
});

describe('liveSubagentLabel', () => {
  it('keeps the existing Claude file-id label', () => {
    expect(liveSubagentLabel('claude', 'agent-aaaa1111', '→ ignored')).toBe('SUBAGENT aaaa1111');
  });

  it('uses the Codex nickname or path embedded in the normalized spawn label', () => {
    expect(liveSubagentLabel('codex', 'thread-b', '→ Auditor')).toBe('Auditor');
  });

  it('falls back to a short thread label when the Codex spawn label is empty', () => {
    expect(liveSubagentLabel('codex', 'thread-b', '')).toBe('SUBAGENT thread-b');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm.cmd test -- tests/unit/live/subagentAssociation.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Expose the existing parser field on `Milestone`**

Add this optional normalized property in `src/parse/types.ts`:

```ts
export type Milestone = {
  // existing fields
  spawnThreadId?: string;
  children: Milestone[];
};
```

Keep the parser's local `FlatMilestone` extension if it still carries `assistantOutput`; remove only its duplicate `spawnThreadId` declaration if TypeScript no longer needs it.

- [ ] **Step 4: Implement the pure association helpers**

Create `src/components/live/subagentAssociation.ts`:

```ts
import type { ProviderId } from '../../parse/types';
import { subagentLabel } from './subagentLabel';

export type AssociableSubagentEntry = {
  key: string;
  spawnThreadId?: string;
  spawnLabel: string;
};

export function associateSubagentFiles(
  provider: ProviderId,
  entries: AssociableSubagentEntry[],
  subagentMtimes: Record<string, string>,
): Map<string, string> {
  const map = new Map<string, string>();
  if (provider === 'codex') {
    for (const entry of entries) {
      const threadId = entry.spawnThreadId;
      if (threadId && Object.prototype.hasOwnProperty.call(subagentMtimes, threadId)) {
        map.set(entry.key, threadId);
      }
    }
    return map;
  }

  const fileIds = Object.keys(subagentMtimes).sort();
  entries.forEach((entry, index) => {
    const fileId = fileIds[index];
    if (fileId) map.set(entry.key, fileId);
  });
  return map;
}

export function liveSubagentLabel(
  provider: ProviderId,
  fileId: string,
  spawnLabel: string,
): string {
  if (provider === 'claude') return subagentLabel(fileId);
  const normalized = spawnLabel.replace(/^→\s*/, '').trim();
  return normalized || subagentLabel(fileId);
}
```

- [ ] **Step 5: Run the focused tests and typecheck**

Run: `npm.cmd test -- tests/unit/live/subagentAssociation.test.ts tests/unit/parse/codex.test.ts`

Expected: PASS, including recursive and guardian-style parser tests.

Run: `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the association contract**

```powershell
git add src/parse/types.ts src/components/live/subagentAssociation.ts tests/unit/live/subagentAssociation.test.ts
git commit -m "feat: map Codex live subagents by thread id"
```

---

### Task 3: Provider-neutral panes with Claude-only controls

**Files:**
- Create: `src/components/live/ClaudeLiveControls.tsx`
- Modify: `src/components/live/LivePanes.tsx`
- Modify: `tests/unit/components/LivePanes.test.tsx`

**Interfaces:**
- Consumes: `Session.provider`, provider-aware `keyToFileId`, pane entry summaries, and existing Claude control hooks.
- Produces: Codex Live panes that never mount control hooks, plus unchanged Claude control rows and pause indicators.

- [ ] **Step 1: Extend the LivePanes test fixture for Codex thread identity**

Update `makeSession` so each synthetic spawn carries its child identifier and useful label:

```ts
leaf.children.push({
  id: `spawn-${sa.id}`,
  kind: 'subagent_spawn',
  label: `→ ${sa.label ?? sa.id}`,
  summary: '',
  timestamp: '',
  failed: false,
  raw: null,
  spawnThreadId: sa.id,
  children: [sa.root],
});
```

Allow the helper to accept `provider: 'claude' | 'codex' = 'claude'` and return that provider on the session.

- [ ] **Step 2: Add failing Codex pane and control-isolation tests**

Add tests equivalent to:

```ts
it('matches and labels Codex child panes by thread id', () => {
  const session = makeSession([m('main')], [
    { id: 'thread-b', label: 'Auditor', root: m('b') },
    { id: 'thread-a', label: 'Scout', root: m('a') },
  ], 'codex');

  renderWithClient(<LivePanes
    session={session}
    projectId="codex-project"
    subagentMtimes={{ 'thread-a': '2026-05-24T12:00:00Z', 'thread-b': '2026-05-24T12:00:00Z' }}
    onToggleLive={() => {}}
  />);

  expect(screen.getByText('Auditor')).toBeTruthy();
  expect(screen.getByText('Scout')).toBeTruthy();
  expect(screen.getAllByTestId('live-pane')).toHaveLength(3);
});

it('does not render or request Claude controls for Codex', () => {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockClear();
  const session = makeSession([m('main')], [], 'codex');
  renderWithClient(<LivePanes session={session} projectId="codex-project" subagentMtimes={{}} onToggleLive={() => {}} />);
  expect(screen.queryByTestId('control-bar')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/control/'), expect.anything());
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/control/'));
});
```

Keep one existing Claude assertion that the control bar renders and the control-state GET is issued.

- [ ] **Step 3: Run the component test and verify the Codex cases fail**

Run: `npm.cmd test -- tests/unit/components/LivePanes.test.tsx`

Expected: FAIL because LivePanes still pairs alphabetically, labels from the thread ID, and mounts Claude control hooks for Codex.

- [ ] **Step 4: Extract every control hook into a Claude-only child component**

Create `src/components/live/ClaudeLiveControls.tsx` with this boundary:

```tsx
import type { ReactNode } from 'react';
import type { ControlSnapshot } from '../../api/control';

export const EMPTY_CONTROL_SNAPSHOT: ControlSnapshot = {
  all: false,
  main: false,
  agents: {},
  held: [],
  pendingNotes: [],
};

type Props = {
  projectId: string;
  sessionId: string;
  mainSummary: string;
  subagentRows: { key: string; summary: string }[];
  keyToFileId: Map<string, string>;
  nowMs: number;
  children: (snapshot: ControlSnapshot) => ReactNode;
};
```

Inside this component, call `useControlState`, `usePauseTarget`, `useResumeTarget`, and `useInstallGateHook`; derive the snapshot and `buildControlRows`; render `children(snapshot)` followed by the existing `ControlBar` with the same mutation callbacks. This component must be the only Live-path module that imports those hooks.

- [ ] **Step 5: Make LivePanes provider-aware without changing lifecycle code**

In `LivePanes.tsx`:

1. Include `spawnThreadId: spawn.spawnThreadId` and `spawnLabel: spawn.label` in each `subagentEntry`.
2. Replace alphabetical pairing with:

```ts
const keyToFileId = useMemo(
  () => associateSubagentFiles(session.provider, subagentEntries, subagentMtimes),
  [session.provider, subagentEntries, subagentMtimes],
);
```

3. Use `liveSubagentLabel(session.provider, fileId, e.spawnLabel)` for each pane.
4. Move the current grid JSX into a local `renderGrid(snapshot: ControlSnapshot)` function or focused child component.
5. For Codex, return the grid with `EMPTY_CONTROL_SNAPSHOT` and no control wrapper.
6. For Claude, wrap the grid with `ClaudeLiveControls` and pass the received snapshot into it.

The final provider branch should have this shape:

```tsx
if (session.provider === 'codex') {
  return renderGrid(EMPTY_CONTROL_SNAPSHOT);
}

return (
  <ClaudeLiveControls
    projectId={projectId}
    sessionId={session.id}
    mainSummary={mainRoot.summary}
    subagentRows={displayable.map((entry) => ({ key: entry.key, summary: entry.root.summary }))}
    keyToFileId={keyToFileId}
    nowMs={nowMs}
  >
    {renderGrid}
  </ClaudeLiveControls>
);
```

Keep `useStatusMap`, `pickVisibleSubagentEntries`, countdown handling, main-pane identity, camera following, and user-closed state unchanged.

- [ ] **Step 6: Run Live component, lifecycle, and control tests**

Run: `npm.cmd test -- tests/unit/components/LivePanes.test.tsx tests/unit/components/ControlBar.test.tsx tests/unit/live/useStatusMap.test.ts tests/unit/live/visibleSubagents.test.ts`

Expected: PASS. Claude tests still observe the control bar; Codex observes no control UI or calls.

Run: `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit provider-aware panes and control isolation**

```powershell
git add src/components/live/ClaudeLiveControls.tsx src/components/live/LivePanes.tsx tests/unit/components/LivePanes.test.tsx
git commit -m "feat: render read-only Codex live panes"
```

---

### Task 4: App routing, mutable browser coverage, and deferred-work update

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/e2e/codex-provider.spec.ts`
- Create: `tests/e2e/codex-live.spec.ts`
- Modify: `future_developments.md`

**Interfaces:**
- Consumes: provider-neutral `isLiveMeta`, `Session.provider`, existing provider-qualified `useSession`, and `LivePanes`.
- Produces: automatic Codex Live entry and seven-second payload refresh through the existing query key `['session', provider, projectId, sessionId]`.

- [ ] **Step 1: Make the historical Codex replay fixture explicitly stale**

In `tests/e2e/codex-provider.spec.ts`, import `utimes`, `path`, and `fileURLToPath`. Before `page.goto('/')`, set the main Codex fixture mtime to a fixed old date so this replay test continues to assert no Live button regardless of other test execution:

```ts
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainRollout = path.resolve(__dirname, '../fixtures/codex-home/sessions/2026/08/08/rollout-main.jsonl');
await utimes(mainRollout, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
```

- [ ] **Step 2: Add a failing Codex auto-Live browser test**

Create `tests/e2e/codex-live.spec.ts`. Save the original contents and timestamps of all four Codex rollout fixtures, restore them in `finally`, and initially touch them to `new Date()`. The first assertions are:

```ts
await page.goto('/');
const group = page.locator('[data-project-key="demo/happy"]');
const codexRow = group.locator('li').filter({ hasText: 'CODEX' });
await expect(codexRow.getByTestId('live-tag')).toBeVisible({ timeout: 15_000 });
await codexRow.click();
await expect(page.getByTestId('live-panes-grid')).toBeVisible({ timeout: 15_000 });
await expect(page.getByTestId('live-button')).toHaveAttribute('aria-pressed', 'true');
await expect(page.getByTestId('control-bar')).toHaveCount(0);
await expect(page.getByText('Scout')).toBeVisible();
await expect(page.getByText('Auditor')).toBeVisible();
await expect(page.getByText('guardian')).toBeVisible();
```

Run: `npm.cmd run test:e2e -- tests/e2e/codex-live.spec.ts`

Expected: FAIL because App still restricts `liveActive` to Claude.

- [ ] **Step 3: Generalize App's engaged-Live predicate**

In `src/App.tsx`, replace:

```ts
const liveActive = selectedMeta?.provider === 'claude' && liveEngaged;
```

with:

```ts
const liveActive = selectedMeta !== null && liveEngaged;
```

Keep the existing selection-key auto-engagement effect, `sessionIsLive || liveActive` query polling, `needsConfirm` calculation, Live/replay toggle, and `showNarrative={effectiveSession?.provider !== 'codex'}` unchanged.

- [ ] **Step 4: Prove a failed refresh preserves the last good graph**

Before opening the page, register a route for `**/api/sessions/codex/**` that normally calls `route.continue()`, but fulfills exactly one request with status 500 when a closure flag is set:

```ts
let failNextCodexPayload = false;
const codexPayloadRequests: string[] = [];
await page.route('**/api/sessions/codex/**', async (route) => {
  codexPayloadRequests.push(route.request().url());
  if (failNextCodexPayload) {
    failNextCodexPayload = false;
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"temporary"}' });
    return;
  }
  await route.continue();
});
```

After Live has rendered, record the visible MAIN node count, set `failNextCodexPayload = true`, and wait until `codexPayloadRequests.length` increases. Assert the MAIN pane and its prior nodes remain visible. This locks in TanStack Query's last-successful-data behavior during a refetch error.

- [ ] **Step 5: Complete the mutable refresh, reactivation, and replay assertions**

While the Codex Live page is open, append a complete assistant record to the main rollout:

```ts
await appendFile(mainRollout, `${JSON.stringify({
  timestamp: new Date().toISOString(),
  type: 'response_item',
  payload: {
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text: 'Live refresh arrived' }],
  },
})}\n`);
```

Assert within two poll intervals that the main pane contains `Live refresh arrived`. Then make `rollout-child.jsonl` older than 30 seconds, wait for its closing chip, touch it to now, and assert the `Scout` pane returns to active state and its closing chip disappears. Finally click the Live button and assert `live-panes-grid` disappears, playback controls return, and no request whose URL contains `/api/control/` was recorded.

Use Playwright polling timeouts of at least 20 seconds for seven-second refresh assertions. Restore every fixture's exact original text and mtime in `finally`, even if an assertion fails.

- [ ] **Step 6: Run focused browser coverage**

Run: `npm.cmd run test:e2e -- tests/e2e/codex-live.spec.ts tests/e2e/codex-provider.spec.ts tests/e2e/live-session-tag.spec.ts tests/e2e/control-bar.spec.ts`

Expected: PASS. Codex auto-enters read-only Live and refreshes; the stale Codex fixture still replays; Claude auto-Live and controls remain available.

- [ ] **Step 7: Update deferred work**

Delete only this line from `future_developments.md`:

```md
- Codex live monitoring.
```

Confirm that `- Codex pause/steer controls.` remains.

- [ ] **Step 8: Run the complete unit suite and typecheck**

Run: `npm.cmd run typecheck`

Expected: PASS.

Run: `npm.cmd test`

Expected: all unit tests pass.

- [ ] **Step 9: Commit App, E2E, and documentation integration**

```powershell
git add src/App.tsx tests/e2e/codex-provider.spec.ts tests/e2e/codex-live.spec.ts future_developments.md
git commit -m "feat: enable Codex live monitoring"
```

---

## Code-review amendments applied during execution

- `subagentAssociation.ts` also exports `liveSubagentKey(provider, spawn)`. Claude retains `spawn.id` identity, while Codex uses `spawnThreadId` so a synthetic guardian spawn changing ordinal after a parent append cannot remount the pane or reset lifecycle, camera, close, freeze, or pin state.
- Unit coverage reparses/rerenders the same Codex child with changed synthetic spawn IDs and requires the pane DOM identity to remain stable.
- The Codex Live Playwright fixture removes the nested and guardian rollout files before opening Live, creates them while Live is active, and waits for both panes to be discovered through normal polling.
- Browser coverage lets the guardian pane complete the active-to-closing-to-removed lifecycle while refreshing the nested child and asserting it remains visible.

---

### Task 5: Final regression verification

**Files:**
- Verify only; modify files only if a failing test exposes a regression, and repeat that test's red-green cycle before committing the correction.

**Interfaces:**
- Consumes: the complete `codex/codex-live` branch.
- Produces: evidence that Codex Live and existing Claude behavior satisfy the approved design.

- [ ] **Step 1: Inspect the branch diff and repository state**

Run: `git status --short`

Expected: only the user's pre-existing untracked screenshots, if visible from this worktree; no implementation file remains unstaged.

Run: `git diff main...HEAD --check`

Expected: no whitespace errors.

Run: `git diff --stat main...HEAD`

Expected: only the design, plan, implementation, tests, and future-development files described above.

- [ ] **Step 2: Run full static and unit verification**

Run: `npm.cmd run typecheck`

Expected: PASS.

Run: `npm.cmd test`

Expected: PASS with no reduced test count from the established 103-file / 597-test baseline; new tests increase those counts.

- [ ] **Step 3: Run the full Playwright suite**

Run: `npm.cmd run test:e2e`

Expected: PASS across the complete Chromium suite, including Claude controls, replay, mixed providers, and Codex Live.

- [ ] **Step 4: Verify read-only and capability boundaries from the diff**

Run:

```powershell
git diff main...HEAD -- src server | Select-String -Pattern '/api/control/|writeFile|appendFile|unlink|rename|mkdir'
```

Expected: `/api/control/` references appear only inside the extracted Claude-only control component imports/calls inherited from existing behavior; no production Codex path adds filesystem writes or control requests. `appendFile` is allowed only in the Playwright test fixture logic and must not appear under `src` or `server`.

- [ ] **Step 5: Record final verification without adding a no-op commit**

Use the exact command results in the handoff. Do not create an empty verification commit. If a correction was required, commit only that correction with a focused message after its tests pass.
