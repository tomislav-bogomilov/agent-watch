# Live Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-pane "hologram" live-session view: ongoing sessions are tagged in the sidebar; opening one auto-switches into a packed-grid view with one pane per active stream (MAIN + sub-agents), each with its own canvas + detail panel; sub-agent panes auto-close 30s after a 60s mtime-stable detection, with a hover-to-freeze countdown.

**Architecture:** Additive. Server adds `lastUpdatedAt` (mtime) to session and sub-agent metadata. Client polls every 7s (TanStack Query `refetchInterval`) and derives liveness from `(now - lastUpdatedAt) < 180s`. New `live/` component tree replaces the single-canvas view when LIVE mode is engaged. Per-pane status state machine (`active → closing → frozen ↔ closed`) ticked by a 1s `setInterval`, separate from the 7s data refetch. The existing single-canvas playback view is unchanged.

**Tech Stack:** React 19, TypeScript, TanStack Query, D3 (existing). Vitest + Testing Library for unit tests, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-05-24-live-sessions-design.md`.

**Commit cadence:** one commit per task minimum; smaller commits welcome. All commits direct to `main` (no PR, per project convention).

---

## File map

**New files:**

| File | Responsibility |
|---|---|
| `src/components/live/liveness.ts` | `isLiveMeta()` predicate; constants (`LIVE_THRESHOLD_MS=180_000`, `SUBAGENT_STABLE_MS=60_000`, `CLOSING_MS=30_000`, `POLL_MS=7_000`, `TICK_MS=1_000`) |
| `src/components/live/extractMainTrail.ts` | DFS over MAIN agent excluding sub-agent inner content; each `subagent_spawn` is one node |
| `src/components/live/subagentLabel.ts` | `subagentLabel(fileId) = "SUBAGENT " + bareAgentId(fileId).slice(0,8)` |
| `src/components/live/paneStatus.ts` | Pure state-machine helper: given prev status + clocks, return next status |
| `src/components/library/LiveTag.tsx` | Cyan bracket-tag with pulsing dot (session cards) |
| `src/components/live/LiveButton.tsx` | Cyan toggle button with pulsing dot (canvas header) |
| `src/components/live/CountdownChip.tsx` | Three-state chip (counting / hover / frozen) |
| `src/components/live/LivePane.tsx` | One pane: cut-corner border + canvas + detail + optional countdown |
| `src/components/live/LivePanes.tsx` | Grid container; owns per-sub-agent status map; 1s tick |
| `src/theme/live-pane.css` | The `@keyframes paneBreathe`, `@keyframes livePulse`, and `@keyframes cdPulse` rules (cleaner than inline style strings for animations) |
| `tests/unit/components/LiveTag.test.tsx` | LiveTag renders dot + label |
| `tests/unit/components/LiveButton.test.tsx` | LiveButton renders, click toggles |
| `tests/unit/components/CountdownChip.test.tsx` | Counting/hover/frozen states |
| `tests/unit/components/LivePane.test.tsx` | Structure + pin behavior |
| `tests/unit/components/LivePanes.test.tsx` | State transitions over fake timers; grid class per N |
| `tests/unit/live/liveness.test.ts` | `isLiveMeta()` predicate |
| `tests/unit/live/extractMainTrail.test.ts` | Excludes sub-agent inner content; keeps `subagent_spawn` |
| `tests/unit/live/subagentLabel.test.ts` | `agent-XYZ.jsonl` → `SUBAGENT XYZ12345` |
| `tests/unit/live/paneStatus.test.ts` | All transitions in the state machine |
| `tests/e2e/live-session-tag.spec.ts` | LIVE tag appears for a touched-mtime session |
| `tests/fixtures/claude-projects/C--demo-live/<sessionId>.jsonl` | Live-session fixture (mtime touched in the test setup) |

**Modified files:**

| File | Change |
|---|---|
| `server/vite-plugin-sessions.ts` | Add `lastUpdatedAt` to `SessionMeta`; add `lastUpdatedAt` to each subagent entry in `readSessionPayload` |
| `src/parse/types.ts` | Extend `SessionMeta` and `SessionPayload.subagents[i]` |
| `src/api/hooks.ts` | `refetchInterval: 7_000` on `useSessionList`; conditional on `useSession`; re-export `isLiveMeta` |
| `src/components/library/itemStyle.ts` | `inner.padding: '8px 10px'` |
| `src/components/library/SessionsList.tsx` | Render `<LiveTag />` in meta row when live; new `itemTitle` style |
| `src/components/library/PromptsList.tsx` | New `itemTitle` style (no LiveTag) |
| `src/components/GraphCanvas.tsx` | Shrink FIT/FOLLOW buttons; add `<LiveButton />` prop+render; hide FOLLOW when `liveEngaged` |
| `src/App.tsx` | Add `liveEngaged` state; auto-engage on opening live; pass `live` to `useSession`; render `<LivePanes />` instead of `<GraphCanvas />` when `liveEngaged` |
| `src/index.css` | Import `theme/live-pane.css` |

---

## Task 1: Add `lastUpdatedAt` to server `SessionMeta`

**Files:**
- Modify: `server/vite-plugin-sessions.ts:6-13` (`SessionMeta` type), `server/vite-plugin-sessions.ts:128-135` (push in `listSessions`)

- [ ] **Step 1: Extend the `SessionMeta` type**

In `server/vite-plugin-sessions.ts`, replace:

```ts
type SessionMeta = {
  projectId: string;
  sessionId: string;
  cwd: string;
  startedAt: string;
  sizeBytes: number;
  title?: string;
};
```

with:

```ts
type SessionMeta = {
  projectId: string;
  sessionId: string;
  cwd: string;
  startedAt: string;
  lastUpdatedAt: string;
  sizeBytes: number;
  title?: string;
};
```

- [ ] **Step 2: Populate `lastUpdatedAt` in `listSessions`**

In the same file, replace the existing `out.push({...})` block in `listSessions` (around lines 128–135) with:

```ts
out.push({
  projectId,
  sessionId,
  cwd: decodeProjectId(projectId),
  startedAt: stat.mtime.toISOString(),
  lastUpdatedAt: stat.mtime.toISOString(),
  sizeBytes: stat.size,
  title,
});
```

(Both `startedAt` and `lastUpdatedAt` use `stat.mtime` for now — see spec §3.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors. The new field is internal to the plugin so far; the client type will be updated in Task 3.

- [ ] **Step 4: Commit**

```bash
git add server/vite-plugin-sessions.ts
git commit -m "feat(server): add lastUpdatedAt to SessionMeta"
```

---

## Task 2: Add `lastUpdatedAt` to subagent entries in session payload

**Files:**
- Modify: `server/vite-plugin-sessions.ts:142-165` (`readSessionPayload`)

- [ ] **Step 1: Read subagent file mtime and include it**

In `server/vite-plugin-sessions.ts`, replace the `readSessionPayload` function body (lines ~142–165) with:

```ts
async function readSessionPayload(root: string, projectId: string, sessionId: string) {
  const projectDir = path.join(root, projectId);
  const sessionPath = path.join(projectDir, `${sessionId}.jsonl`);
  const jsonl = await fs.readFile(sessionPath, 'utf8');
  const subagents: { id: string; jsonl: string; lastUpdatedAt: string }[] = [];
  const subagentDir = path.join(projectDir, sessionId, 'subagents');
  try {
    const files = await fs.readdir(subagentDir);
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const full = path.join(subagentDir, f);
      const stat = await fs.stat(full);
      const content = await fs.readFile(full, 'utf8');
      subagents.push({
        id: f.replace(/\.jsonl$/, ''),
        jsonl: content,
        lastUpdatedAt: stat.mtime.toISOString(),
      });
    }
  } catch {
    // no subagent dir -> empty list
  }
  return {
    projectId,
    sessionId,
    cwd: decodeProjectId(projectId),
    jsonl,
    subagents,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add server/vite-plugin-sessions.ts
git commit -m "feat(server): add lastUpdatedAt to subagent payload entries"
```

---

## Task 3: Extend client types

**Files:**
- Modify: `src/parse/types.ts:62-77`

- [ ] **Step 1: Update `SessionPayload.subagents` and `SessionMeta`**

In `src/parse/types.ts`, replace:

```ts
export type SessionPayload = {
  projectId: string;
  sessionId: string;
  cwd: string;
  jsonl: string;
  subagents: { id: string; jsonl: string }[];
};

export type SessionMeta = {
  projectId: string;
  sessionId: string;
  cwd: string;
  startedAt: string;
  sizeBytes: number;
  title?: string;
};
```

with:

```ts
export type SessionPayload = {
  projectId: string;
  sessionId: string;
  cwd: string;
  jsonl: string;
  subagents: { id: string; jsonl: string; lastUpdatedAt: string }[];
};

export type SessionMeta = {
  projectId: string;
  sessionId: string;
  cwd: string;
  startedAt: string;
  lastUpdatedAt: string;
  sizeBytes: number;
  title?: string;
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes. (Existing callers don't reference `lastUpdatedAt` yet; adding a required field is safe because the server now provides it.)

- [ ] **Step 3: Commit**

```bash
git add src/parse/types.ts
git commit -m "feat(types): add lastUpdatedAt to SessionMeta and SessionPayload"
```

---

## Task 4: `isLiveMeta` helper + constants module

**Files:**
- Create: `src/components/live/liveness.ts`
- Create: `tests/unit/live/liveness.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/live/liveness.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isLiveMeta, LIVE_THRESHOLD_MS, SUBAGENT_STABLE_MS, CLOSING_MS, POLL_MS, TICK_MS } from '../../../src/components/live/liveness';
import type { SessionMeta } from '../../../src/parse/types';

function meta(lastUpdatedAt: string): SessionMeta {
  return {
    projectId: 'p', sessionId: 's', cwd: '/c',
    startedAt: lastUpdatedAt, lastUpdatedAt,
    sizeBytes: 0,
  };
}

describe('liveness constants', () => {
  it('declares constants used across the live feature', () => {
    expect(LIVE_THRESHOLD_MS).toBe(180_000);
    expect(SUBAGENT_STABLE_MS).toBe(60_000);
    expect(CLOSING_MS).toBe(30_000);
    expect(POLL_MS).toBe(7_000);
    expect(TICK_MS).toBe(1_000);
  });
});

describe('isLiveMeta', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-05-24T12:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns true when lastUpdatedAt is just now', () => {
    expect(isLiveMeta(meta('2026-05-24T12:00:00Z'))).toBe(true);
  });

  it('returns true 179s after lastUpdatedAt', () => {
    expect(isLiveMeta(meta('2026-05-24T11:57:01Z'))).toBe(true);
  });

  it('returns false 181s after lastUpdatedAt', () => {
    expect(isLiveMeta(meta('2026-05-24T11:56:59Z'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- liveness`
Expected: FAIL — module `src/components/live/liveness` does not exist.

- [ ] **Step 3: Create the module**

Create `src/components/live/liveness.ts`:

```ts
import type { SessionMeta } from '../../parse/types';

export const LIVE_THRESHOLD_MS = 180_000;
export const SUBAGENT_STABLE_MS = 60_000;
export const CLOSING_MS = 30_000;
export const POLL_MS = 7_000;
export const TICK_MS = 1_000;

export function isLiveMeta(meta: SessionMeta): boolean {
  return Date.now() - new Date(meta.lastUpdatedAt).getTime() < LIVE_THRESHOLD_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- liveness`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/live/liveness.ts tests/unit/live/liveness.test.ts
git commit -m "feat(live): isLiveMeta predicate and liveness constants"
```

---

## Task 5: Add `refetchInterval` to `useSessionList`

**Files:**
- Modify: `src/api/hooks.ts:6-11`

- [ ] **Step 1: Update `useSessionList`**

In `src/api/hooks.ts`, replace:

```ts
export function useSessionList() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessionList,
  });
}
```

with:

```ts
import { POLL_MS } from '../components/live/liveness';

// ... (keep other imports above) ...

export function useSessionList() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessionList,
    refetchInterval: POLL_MS,
  });
}
```

(Add the `import { POLL_MS } ...` line near the top with the other imports.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Smoke check**

Run: `npm test`
Expected: existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/api/hooks.ts
git commit -m "feat(hooks): poll session list every 7s"
```

---

## Task 6: Add conditional `refetchInterval` to `useSession`

**Files:**
- Modify: `src/api/hooks.ts:20-29`

- [ ] **Step 1: Update `useSession` signature and refetch behavior**

In `src/api/hooks.ts`, replace:

```ts
export function useSession(projectId: string | null, sessionId: string | null) {
  return useQuery<Session>({
    queryKey: ['session', projectId, sessionId],
    queryFn: async () => {
      const payload = await fetchSessionPayload(projectId!, sessionId!);
      return parseSession(payload);
    },
    enabled: !!projectId && !!sessionId,
  });
}
```

with:

```ts
export function useSession(projectId: string | null, sessionId: string | null, live: boolean = false) {
  return useQuery<Session>({
    queryKey: ['session', projectId, sessionId],
    queryFn: async () => {
      const payload = await fetchSessionPayload(projectId!, sessionId!);
      return parseSession(payload);
    },
    enabled: !!projectId && !!sessionId,
    refetchInterval: live ? POLL_MS : false,
  });
}
```

- [ ] **Step 2: Re-export `isLiveMeta` from `api/hooks.ts` for convenience**

Add to the export list at the bottom of `src/api/hooks.ts`:

```ts
export { isLiveMeta } from '../components/live/liveness';
```

- [ ] **Step 3: Typecheck + test**

Run: `npm run typecheck && npm test`
Expected: passes. (Existing `useSession` callers in `App.tsx` will keep working because the new `live` param defaults to `false`.)

- [ ] **Step 4: Commit**

```bash
git add src/api/hooks.ts
git commit -m "feat(hooks): conditional 7s refetch for live sessions"
```

---

## Task 7: `LiveTag` component (session card meta)

**Files:**
- Create: `src/components/library/LiveTag.tsx`
- Create: `tests/unit/components/LiveTag.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/LiveTag.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveTag } from '../../../src/components/library/LiveTag';

describe('LiveTag', () => {
  it('renders the LIVE label', () => {
    render(<LiveTag />);
    expect(screen.getByTestId('live-tag').textContent).toContain('LIVE');
  });

  it('renders a pulsing dot inside the tag, left of the label', () => {
    render(<LiveTag />);
    const tag = screen.getByTestId('live-tag');
    const dot = tag.querySelector('[data-testid="live-tag-dot"]');
    expect(dot).not.toBeNull();
    // Dot is the first child of the tag.
    expect(tag.firstElementChild).toBe(dot);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- LiveTag`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/library/LiveTag.tsx`:

```tsx
import type { CSSProperties } from 'react';

const styles: Record<string, CSSProperties> = {
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: '1px solid rgba(0,229,255,0.45)',
    padding: '1px 6px 1px 5px',
    color: '#00e5ff',
    letterSpacing: 2,
    fontSize: 9,
    fontFamily: 'ui-monospace, monospace',
    textShadow: '0 0 6px rgba(0,229,255,0.6)',
    boxShadow: '0 0 6px rgba(0,229,255,0.18) inset',
    lineHeight: 1,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: '#00e5ff',
    boxShadow: '0 0 6px #00e5ff, 0 0 10px #00e5ff',
    animation: 'livePulse 1.4s ease-in-out infinite',
  },
};

export function LiveTag() {
  return (
    <span data-testid="live-tag" style={styles.tag}>
      <span data-testid="live-tag-dot" style={styles.dot} />
      LIVE
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- LiveTag`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/library/LiveTag.tsx tests/unit/components/LiveTag.test.tsx
git commit -m "feat(live): LiveTag component for session card meta"
```

---

## Task 8: Add the `@keyframes livePulse` rule

**Files:**
- Create: `src/theme/live-pane.css`
- Modify: `src/index.css`

- [ ] **Step 1: Create the stylesheet**

Create `src/theme/live-pane.css`:

```css
@keyframes livePulse {
  0%, 100% { opacity: 0.45; transform: scale(0.85); }
  50%      { opacity: 1.0;  transform: scale(1.0); }
}
@keyframes paneBreathe {
  0%, 100% { box-shadow: 0 0 0 1px rgba(0,229,255,0.55) inset,
                         0 0 0 5px rgba(0,229,255,0.18) inset,
                         0 0 10px rgba(0,229,255,0.10); }
  50%      { box-shadow: 0 0 0 1px rgba(0,229,255,0.70) inset,
                         0 0 0 5px rgba(0,229,255,0.28) inset,
                         0 0 22px rgba(0,229,255,0.32); }
}
@keyframes subBreathe {
  0%, 100% { box-shadow: 0 0 0 1px rgba(184,148,255,0.55) inset,
                         0 0 0 5px rgba(184,148,255,0.18) inset,
                         0 0 10px rgba(184,148,255,0.10); }
  50%      { box-shadow: 0 0 0 1px rgba(184,148,255,0.70) inset,
                         0 0 0 5px rgba(184,148,255,0.28) inset,
                         0 0 22px rgba(184,148,255,0.32); }
}
@keyframes cdPulse {
  0%, 100% { box-shadow: 0 0 10px rgba(255,90,90,0.18), inset 0 0 6px rgba(255,90,90,0.08); }
  50%      { box-shadow: 0 0 22px rgba(255,90,90,0.50), inset 0 0 12px rgba(255,90,90,0.20); }
}
```

- [ ] **Step 2: Import the stylesheet**

In `src/index.css`, add a line at the top:

```css
@import './theme/live-pane.css';
```

- [ ] **Step 3: Smoke-test manually**

Run: `npm run dev`
Open the app and verify the existing UI still loads (the new keyframes are inert until used).
Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/theme/live-pane.css src/index.css
git commit -m "feat(live): add live keyframes (pulse, paneBreathe, subBreathe, cdPulse)"
```

---

## Task 9: Render `<LiveTag />` in `SessionsList` when session is live

**Files:**
- Modify: `src/components/library/SessionsList.tsx`

- [ ] **Step 1: Update imports + meta row**

In `src/components/library/SessionsList.tsx`, add the import:

```tsx
import { LiveTag } from './LiveTag';
import { isLiveMeta } from '../../api/hooks';
```

Replace the existing meta `<div>`:

```tsx
<div style={styles.itemMeta}>
  {new Date(s.startedAt).toLocaleString()} · {Math.round(s.sizeBytes / 1024)}KB
</div>
```

with:

```tsx
<div style={styles.itemMeta}>
  <span>{new Date(s.startedAt).toLocaleString()} · {Math.round(s.sizeBytes / 1024)}KB</span>
  {isLiveMeta(s) && <LiveTag />}
</div>
```

Update the `itemMeta` style block (in the `styles` object at the bottom of the file) to use flex layout:

```tsx
itemMeta: {
  fontSize: 10,
  color: 'var(--text-dim)',
  marginTop: 2,
  fontFamily: 'ui-monospace, monospace',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
},
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`
Touch a session jsonl to make it live:
```bash
touch ~/.claude/projects/<some-project-id>/<some-session-id>.jsonl
```
Open the app, find the session in the sidebar. Verify the `[● LIVE]` tag is visible on its card, with the pulsing dot to the left of "LIVE".
Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/components/library/SessionsList.tsx
git commit -m "feat(sidebar): show LIVE tag on session cards that are currently live"
```

---

## Task 10: Card title — 10px / 3-line clamp in `SessionsList`

**Files:**
- Modify: `src/components/library/SessionsList.tsx` (`styles.itemTitle`)

- [ ] **Step 1: Update the title style**

In `src/components/library/SessionsList.tsx`, replace `styles.itemTitle`:

```tsx
itemTitle: {
  fontSize: 12,
  color: 'var(--text)',
  overflow: 'hidden' as const,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
  fontFamily: 'ui-monospace, monospace',
},
```

with:

```tsx
itemTitle: {
  fontSize: 10,
  color: 'var(--text)',
  display: '-webkit-box' as const,
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden' as const,
  whiteSpace: 'normal' as const,
  lineHeight: 1.35,
  wordBreak: 'break-word' as const,
  fontFamily: 'ui-monospace, monospace',
},
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`. Find a session whose title would previously have been truncated; verify it now wraps to up to 3 lines.
Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/components/library/SessionsList.tsx
git commit -m "feat(sidebar): wrap session titles up to 3 lines at 10px"
```

---

## Task 11: Card title — 10px / 3-line clamp in `PromptsList`

**Files:**
- Modify: `src/components/library/PromptsList.tsx` (`styles.itemTitle`)

- [ ] **Step 1: Update the title style**

In `src/components/library/PromptsList.tsx`, replace `styles.itemTitle`:

```tsx
itemTitle: {
  fontSize: 12,
  color: 'var(--text)',
  overflow: 'hidden' as const,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
  fontFamily: 'ui-monospace, monospace',
},
```

with:

```tsx
itemTitle: {
  fontSize: 10,
  color: 'var(--text)',
  display: '-webkit-box' as const,
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden' as const,
  whiteSpace: 'normal' as const,
  lineHeight: 1.35,
  wordBreak: 'break-word' as const,
  fontFamily: 'ui-monospace, monospace',
},
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`. Switch the library to PROMPTS mode; verify long prompts wrap up to 3 lines.
Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/components/library/PromptsList.tsx
git commit -m "feat(sidebar): wrap prompt titles up to 3 lines at 10px"
```

---

## Task 12: Tighten ItemShell inner horizontal padding

**Files:**
- Modify: `src/components/library/itemStyle.ts:13-31`

- [ ] **Step 1: Update `ITEM_STYLE.inner.padding`**

In `src/components/library/itemStyle.ts`, replace:

```ts
inner: {
  position: 'relative',
  padding: '8px 12px',
  ...
```

with:

```ts
inner: {
  position: 'relative',
  padding: '8px 10px',
  ...
```

(Leave the rest of the `inner` object unchanged.)

- [ ] **Step 2: Smoke-check existing tests**

Run: `npm test`
Expected: existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/library/itemStyle.ts
git commit -m "feat(sidebar): tighten card horizontal padding to give titles more room"
```

---

## Task 13: `LiveButton` component (canvas header)

**Files:**
- Create: `src/components/live/LiveButton.tsx`
- Create: `tests/unit/components/LiveButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/LiveButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LiveButton } from '../../../src/components/live/LiveButton';

describe('LiveButton', () => {
  it('renders a LIVE label and a pulsing dot', () => {
    render(<LiveButton engaged={false} onToggle={() => {}} />);
    const btn = screen.getByTestId('live-button');
    expect(btn.textContent).toContain('LIVE');
    expect(btn.querySelector('[data-testid="live-button-dot"]')).not.toBeNull();
  });

  it('reflects engaged state via aria-pressed', () => {
    const { rerender } = render(<LiveButton engaged={false} onToggle={() => {}} />);
    expect(screen.getByTestId('live-button').getAttribute('aria-pressed')).toBe('false');
    rerender(<LiveButton engaged={true} onToggle={() => {}} />);
    expect(screen.getByTestId('live-button').getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<LiveButton engaged={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('live-button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- LiveButton`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/live/LiveButton.tsx`:

```tsx
import type { CSSProperties } from 'react';

type Props = {
  engaged: boolean;
  onToggle: () => void;
};

const baseBtn: CSSProperties = {
  background: 'rgba(5,8,13,0.85)',
  border: '1px solid rgba(0,229,255,0.55)',
  color: '#00e5ff',
  padding: '2px 8px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 9,
  letterSpacing: 2,
  cursor: 'pointer',
  height: 20,
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  textShadow: '0 0 6px rgba(0,229,255,0.55)',
  boxShadow: '0 0 8px rgba(0,229,255,0.18), inset 0 0 8px rgba(0,229,255,0.08)',
};

const dot: CSSProperties = {
  width: 4,
  height: 4,
  borderRadius: '50%',
  background: '#00e5ff',
  boxShadow: '0 0 5px #00e5ff',
  animation: 'livePulse 1.4s ease-in-out infinite',
};

export function LiveButton({ engaged, onToggle }: Props) {
  return (
    <button
      data-testid="live-button"
      aria-pressed={engaged}
      onClick={onToggle}
      title={engaged ? 'exit live mode' : 'enter live mode'}
      style={baseBtn}
    >
      <span data-testid="live-button-dot" style={dot} />
      LIVE
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- LiveButton`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/live/LiveButton.tsx tests/unit/components/LiveButton.test.tsx
git commit -m "feat(live): LiveButton component for canvas header"
```

---

## Task 14: Shrink existing FIT and FOLLOW buttons

**Files:**
- Modify: `src/components/GraphCanvas.tsx:250-273`

- [ ] **Step 1: Update both buttons' inline style**

In `src/components/GraphCanvas.tsx`, replace the FIT button:

```tsx
<button
  data-testid="fit-button"
  onClick={() => fit()}
  style={{
    position: 'absolute', top: 12, right: 12, zIndex: 6,
    background: 'rgba(5,8,13,0.85)', border: '1px solid var(--edge-idle)',
    color: 'var(--text)', padding: '4px 10px', cursor: 'pointer',
    fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: 2,
  }}
  title="fit (F)"
>FIT</button>
```

with:

```tsx
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
```

Replace the FOLLOW button:

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
  title="follow playhead (L)"
>FOLLOW</button>
```

with:

```tsx
<button
  data-testid="follow-toggle"
  onClick={() => setFollow(!follow)}
  style={{
    position: 'absolute', top: 12, right: 50, zIndex: 6,
    background: 'rgba(5,8,13,0.85)',
    border: `1px solid ${follow ? 'var(--edge-trail)' : 'var(--edge-idle)'}`,
    color: follow ? 'var(--edge-trail)' : 'var(--text)',
    padding: '2px 8px', cursor: 'pointer',
    fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: 2,
    height: 20, boxSizing: 'border-box',
  }}
  title="follow playhead (L)"
>FOLLOW</button>
```

(`right: 64` becomes `right: 50` because FIT is now narrower — FIT is ~30px wide at 9px font with `padding: 2px 8px`. The LIVE button added in Task 17 will sit further left still.)

- [ ] **Step 2: E2E test smoke**

Run: `npm run test:e2e`
Expected: tests still pass. The button selectors (`[data-testid="fit-button"]`, `[data-testid="follow-toggle"]`) don't change.

- [ ] **Step 3: Commit**

```bash
git add src/components/GraphCanvas.tsx
git commit -m "feat(canvas): shrink FIT and FOLLOW header buttons to 9px"
```

---

## Task 15: `liveEngaged` state in `App.tsx` + auto-engage on open

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Wire `liveEngaged` into `App.tsx`**

Add this import near the top of `src/App.tsx`:

```tsx
import { useSessionList, isLiveMeta } from './api/hooks';
```

(Replace the existing `import { usePromptList, useSession } from './api/hooks';` with the version above plus the other named imports it already needs:)

```tsx
import { usePromptList, useSession, useSessionList, isLiveMeta } from './api/hooks';
```

Inside the `App` component, add the state and derived values **just below** the `const [selected, setSelected] = useState<Selection | null>(null);` line:

```tsx
const sessionsQuery = useSessionList();
const selectedMeta = useMemo(() => {
  if (!selected || !sessionsQuery.data) return null;
  return sessionsQuery.data.find(
    (s) => s.projectId === selected.projectId && s.sessionId === selected.sessionId
  ) ?? null;
}, [selected, sessionsQuery.data]);
const sessionIsLive = selectedMeta ? isLiveMeta(selectedMeta) : false;
const [liveEngaged, setLiveEngaged] = useState(false);
```

Add an effect to auto-engage when the user selects a session that is currently live:

```tsx
const lastAutoEngagedRef = useRef<string | null>(null);
useEffect(() => {
  if (!selected || !selectedMeta) {
    lastAutoEngagedRef.current = null;
    return;
  }
  const key = `${selected.projectId}/${selected.sessionId}`;
  if (lastAutoEngagedRef.current === key) return;
  lastAutoEngagedRef.current = key;
  setLiveEngaged(isLiveMeta(selectedMeta));
}, [selected, selectedMeta]);
```

(Place after the existing `useEffect(() => { setPinnedId(null); setPanelDismissed(false); }, [selected]);` line at lines ~77–78.)

Update the `useSession` call to pass the live flag:

```tsx
const { data: rawSession, isLoading, error } = useSession(
  selected?.projectId ?? null,
  selected?.sessionId ?? null,
  sessionIsLive || liveEngaged,
);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Smoke-check existing e2e**

Run: `npm run test:e2e`
Expected: tests pass — auto-engage does not fire for fixture sessions whose mtime is hours/days old.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): track liveEngaged; auto-engage when opening a live session"
```

---

## Task 16: Render `LiveButton` in the canvas header

**Files:**
- Modify: `src/components/GraphCanvas.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add `liveEngaged` and `sessionIsLive` props to `GraphCanvas`**

In `src/components/GraphCanvas.tsx`, update the `Props` type and the function signature:

```tsx
type Props = {
  session: Session;
  playback: PlaybackState;
  subagentIds: Set<string>;
  pinnedId: string | null;
  onPin: (id: string | null) => void;
  onScrubTo: (index: number) => void;
  filters: Filters;
  onCameraReady?: (api: CameraApi) => void;
  liveEngaged: boolean;
  sessionIsLive: boolean;
  onToggleLive: () => void;
};
```

```tsx
export function GraphCanvas({
  session, playback, subagentIds, pinnedId, onPin, onScrubTo, filters, onCameraReady,
  liveEngaged, sessionIsLive, onToggleLive,
}: Props) {
```

- [ ] **Step 2: Import the LiveButton**

Add to the top imports of `GraphCanvas.tsx`:

```tsx
import { LiveButton } from './live/LiveButton';
```

- [ ] **Step 3: Render the LiveButton + hide FOLLOW when liveEngaged**

In the JSX, find the FIT/FOLLOW button block (lines ~250–273 from Task 14). Wrap them so FOLLOW is conditional:

Replace the FOLLOW button block with this gated version:

```tsx
{!liveEngaged && (
  <button
    data-testid="follow-toggle"
    onClick={() => setFollow(!follow)}
    style={{
      position: 'absolute', top: 12, right: 50, zIndex: 6,
      background: 'rgba(5,8,13,0.85)',
      border: `1px solid ${follow ? 'var(--edge-trail)' : 'var(--edge-idle)'}`,
      color: follow ? 'var(--edge-trail)' : 'var(--text)',
      padding: '2px 8px', cursor: 'pointer',
      fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: 2,
      height: 20, boxSizing: 'border-box',
    }}
    title="follow playhead (L)"
  >FOLLOW</button>
)}
```

Add the LIVE button right after the FOLLOW block, before the `<Minimap …/>`:

```tsx
{sessionIsLive && (
  <div style={{ position: 'absolute', top: 12, right: liveEngaged ? 50 : 88, zIndex: 6 }}>
    <LiveButton engaged={liveEngaged} onToggle={onToggleLive} />
  </div>
)}
```

(When LIVE is engaged FOLLOW is hidden, so LIVE moves left to take FOLLOW's slot at `right: 50`. Otherwise it sits to the left of FOLLOW at `right: 88`.)

- [ ] **Step 4: Pass the new props from `App.tsx`**

In `src/App.tsx`, find the `<GraphCanvas .../>` invocation and add three props:

```tsx
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
  sessionIsLive={sessionIsLive}
  onToggleLive={() => setLiveEngaged((v) => !v)}
/>
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Touch a session jsonl to make it live, open the session in the app. Verify:
- `[● LIVE]` button appears at top-right of the canvas, to the left of FOLLOW.
- Clicking LIVE toggles `aria-pressed` and (visually only — `LivePanes` is wired later) hides FOLLOW when engaged.
Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/GraphCanvas.tsx src/App.tsx
git commit -m "feat(canvas): render LIVE button when session is live; hide FOLLOW when engaged"
```

---

## Task 17: `extractMainTrail` helper

**Files:**
- Create: `src/components/live/extractMainTrail.ts`
- Create: `tests/unit/live/extractMainTrail.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/live/extractMainTrail.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractMainTrail } from '../../../src/components/live/extractMainTrail';
import type { Milestone } from '../../../src/parse/types';

function m(id: string, kind: Milestone['kind'], children: Milestone[] = []): Milestone {
  return {
    id, kind,
    label: id, summary: '', timestamp: '', failed: false, raw: null,
    children,
  };
}

describe('extractMainTrail', () => {
  it('returns root + descendants for a simple chain', () => {
    const root = m('a', 'root_prompt', [m('b', 'assistant_turn', [m('c', 'tool_call')])]);
    expect(extractMainTrail(root).map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the subagent_spawn node but excludes its inner content', () => {
    // subagent_spawn's children[0] is the sub-agent root (inner); children[1+] is the rest of the main trail.
    const subAgentInner = m('s1', 'assistant_turn', [m('s2', 'tool_call')]);
    const root = m('a', 'root_prompt', [
      m('spawn', 'subagent_spawn', [
        subAgentInner,
        m('after', 'assistant_turn'),
      ]),
    ]);
    expect(extractMainTrail(root).map((n) => n.id)).toEqual(['a', 'spawn', 'after']);
  });

  it('handles a subagent_spawn with no main continuation', () => {
    const root = m('a', 'root_prompt', [
      m('spawn', 'subagent_spawn', [m('s1', 'assistant_turn')]),
    ]);
    expect(extractMainTrail(root).map((n) => n.id)).toEqual(['a', 'spawn']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- extractMainTrail`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/components/live/extractMainTrail.ts`:

```ts
import type { Milestone } from '../../parse/types';

/**
 * DFS the main agent's trail, excluding the inner content of any sub-agent.
 *
 * Per the existing convention in `src/App.tsx` (`collectSubagentIds`) and
 * `src/parse/subagents.ts:attachSubagents`, a `subagent_spawn` milestone has:
 *   - children[0]  → the sub-agent's inner root (skip this whole subtree)
 *   - children[1+] → the main agent's continuation
 *
 * The `subagent_spawn` itself stays in the main trail as a single node.
 */
export function extractMainTrail(root: Milestone): Milestone[] {
  const out: Milestone[] = [];
  function walk(node: Milestone): void {
    out.push(node);
    if (node.kind === 'subagent_spawn') {
      for (let i = 1; i < node.children.length; i++) walk(node.children[i]);
    } else {
      for (const c of node.children) walk(c);
    }
  }
  walk(root);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- extractMainTrail`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/live/extractMainTrail.ts tests/unit/live/extractMainTrail.test.ts
git commit -m "feat(live): extractMainTrail — DFS main agent, exclude sub-agent inner content"
```

---

## Task 18: `subagentLabel` helper

**Files:**
- Create: `src/components/live/subagentLabel.ts`
- Create: `tests/unit/live/subagentLabel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/live/subagentLabel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { subagentLabel } from '../../../src/components/live/subagentLabel';

describe('subagentLabel', () => {
  it('strips the agent- prefix and truncates to 8 characters', () => {
    expect(subagentLabel('agent-a0c55d88c829c7399')).toBe('SUBAGENT a0c55d88');
  });

  it('handles ids without the agent- prefix', () => {
    expect(subagentLabel('4e2af9zzzz')).toBe('SUBAGENT 4e2af9zz');
  });

  it('handles ids shorter than 8 chars without throwing', () => {
    expect(subagentLabel('agent-abc')).toBe('SUBAGENT abc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- subagentLabel`
Expected: FAIL.

- [ ] **Step 3: Implement the helper**

Create `src/components/live/subagentLabel.ts`:

```ts
const PREFIX = 'agent-';

function bareAgentId(fileId: string): string {
  return fileId.startsWith(PREFIX) ? fileId.slice(PREFIX.length) : fileId;
}

export function subagentLabel(fileId: string): string {
  return `SUBAGENT ${bareAgentId(fileId).slice(0, 8)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- subagentLabel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/live/subagentLabel.ts tests/unit/live/subagentLabel.test.ts
git commit -m "feat(live): subagentLabel helper"
```

---

## Task 19: `paneStatus` state machine

**Files:**
- Create: `src/components/live/paneStatus.ts`
- Create: `tests/unit/live/paneStatus.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/live/paneStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextPaneStatus, type PaneState } from '../../../src/components/live/paneStatus';

function s(partial: Partial<PaneState>): PaneState {
  return {
    status: 'active',
    closingStartedAt: null,
    frozenAt: null,
    frozenRemainingMs: null,
    ...partial,
  };
}

describe('nextPaneStatus', () => {
  const lastUpdated = new Date('2026-05-24T12:00:00Z').getTime();

  it('keeps status=active when mtime is recent', () => {
    const now = lastUpdated + 30_000;
    expect(nextPaneStatus(s({ status: 'active' }), lastUpdated, now)).toEqual({
      status: 'active', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null,
    });
  });

  it('transitions active → closing when mtime is stable past SUBAGENT_STABLE_MS', () => {
    const now = lastUpdated + 60_001;
    const next = nextPaneStatus(s({ status: 'active' }), lastUpdated, now);
    expect(next.status).toBe('closing');
    expect(next.closingStartedAt).toBe(now);
  });

  it('keeps status=closing during CLOSING_MS window', () => {
    const closingStartedAt = lastUpdated + 60_001;
    const now = closingStartedAt + 10_000;
    const next = nextPaneStatus(s({ status: 'closing', closingStartedAt }), lastUpdated, now);
    expect(next.status).toBe('closing');
  });

  it('transitions closing → closed after CLOSING_MS', () => {
    const closingStartedAt = lastUpdated + 60_001;
    const now = closingStartedAt + 30_001;
    expect(nextPaneStatus(s({ status: 'closing', closingStartedAt }), lastUpdated, now).status).toBe('closed');
  });

  it('returns to active when frozen and mtime changes again (sub-agent woke up)', () => {
    const frozenAt = lastUpdated + 70_000;
    const newerUpdate = frozenAt + 5_000;
    const now = newerUpdate + 1_000;
    const next = nextPaneStatus(
      s({ status: 'frozen', frozenAt, frozenRemainingMs: 20_000, closingStartedAt: lastUpdated + 60_001 }),
      newerUpdate, now,
    );
    expect(next.status).toBe('active');
    expect(next.frozenAt).toBeNull();
    expect(next.frozenRemainingMs).toBeNull();
    expect(next.closingStartedAt).toBeNull();
  });

  it('stays frozen otherwise', () => {
    const frozenAt = lastUpdated + 70_000;
    const next = nextPaneStatus(
      s({ status: 'frozen', frozenAt, frozenRemainingMs: 20_000, closingStartedAt: lastUpdated + 60_001 }),
      lastUpdated, frozenAt + 100_000,
    );
    expect(next.status).toBe('frozen');
    expect(next.frozenRemainingMs).toBe(20_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- paneStatus`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the state machine**

Create `src/components/live/paneStatus.ts`:

```ts
import { SUBAGENT_STABLE_MS, CLOSING_MS } from './liveness';

export type PaneStatus = 'active' | 'closing' | 'frozen' | 'closed';

export type PaneState = {
  status: PaneStatus;
  closingStartedAt: number | null;     // ms epoch when status moved active → closing
  frozenAt: number | null;             // ms epoch when user clicked freeze
  frozenRemainingMs: number | null;    // remaining closing time at the moment of freeze
};

export function nextPaneStatus(
  prev: PaneState,
  lastUpdatedMs: number,
  nowMs: number,
): PaneState {
  // Sub-agent activity resumed: reset to active no matter the previous status.
  if (lastUpdatedMs > (prev.closingStartedAt ?? 0) && nowMs - lastUpdatedMs < SUBAGENT_STABLE_MS) {
    return { status: 'active', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null };
  }
  if (prev.status === 'active') {
    if (nowMs - lastUpdatedMs > SUBAGENT_STABLE_MS) {
      return { status: 'closing', closingStartedAt: nowMs, frozenAt: null, frozenRemainingMs: null };
    }
    return prev;
  }
  if (prev.status === 'closing') {
    const elapsed = nowMs - (prev.closingStartedAt ?? nowMs);
    if (elapsed > CLOSING_MS) {
      return { ...prev, status: 'closed' };
    }
    return prev;
  }
  // frozen / closed: pure functions only flip when activity resumes (handled above).
  return prev;
}

/**
 * Returns seconds remaining on the closing countdown, or null if not closing/frozen.
 */
export function remainingSeconds(state: PaneState, nowMs: number): number | null {
  if (state.status === 'frozen' && state.frozenRemainingMs != null) {
    return Math.max(0, Math.ceil(state.frozenRemainingMs / 1000));
  }
  if (state.status === 'closing' && state.closingStartedAt != null) {
    const remainingMs = CLOSING_MS - (nowMs - state.closingStartedAt);
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- paneStatus`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/live/paneStatus.ts tests/unit/live/paneStatus.test.ts
git commit -m "feat(live): paneStatus state machine (active/closing/frozen/closed)"
```

---

## Task 20: `CountdownChip` component

**Files:**
- Create: `src/components/live/CountdownChip.tsx`
- Create: `tests/unit/components/CountdownChip.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/CountdownChip.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CountdownChip } from '../../../src/components/live/CountdownChip';

describe('CountdownChip', () => {
  it('renders CLOSING IN <n>s when not frozen', () => {
    render(<CountdownChip seconds={24} frozen={false} onToggleFreeze={() => {}} />);
    expect(screen.getByTestId('countdown-chip').textContent).toContain('CLOSING IN');
    expect(screen.getByTestId('countdown-chip').textContent).toContain('24');
  });

  it('renders FROZEN · <n>s when frozen', () => {
    render(<CountdownChip seconds={18} frozen={true} onToggleFreeze={() => {}} />);
    expect(screen.getByTestId('countdown-chip').textContent).toContain('FROZEN');
    expect(screen.getByTestId('countdown-chip').textContent).toContain('18');
  });

  it('invokes onToggleFreeze when clicked', () => {
    const fn = vi.fn();
    render(<CountdownChip seconds={10} frozen={false} onToggleFreeze={fn} />);
    fireEvent.click(screen.getByTestId('countdown-chip'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CountdownChip`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

Create `src/components/live/CountdownChip.tsx`:

```tsx
import { useState, type CSSProperties } from 'react';

type Props = {
  seconds: number;
  frozen: boolean;
  onToggleFreeze: () => void;
};

const base: CSSProperties = {
  position: 'absolute',
  bottom: 14,
  left: 22,
  padding: '4px 8px',
  fontSize: 8,
  letterSpacing: 2,
  fontFamily: 'ui-monospace, monospace',
  cursor: 'pointer',
  userSelect: 'none',
  zIndex: 6,
  textAlign: 'center',
  lineHeight: 1.4,
};

const countingPalette: CSSProperties = {
  border: '1px solid rgba(255,90,90,0.7)',
  background: 'rgba(20,5,5,0.85)',
  color: '#ff7c7c',
  textShadow: '0 0 6px rgba(255,90,90,0.7)',
  animation: 'cdPulse 2.4s ease-in-out infinite',
};

const hoverPalette: CSSProperties = {
  border: '1px solid rgba(255,200,90,0.85)',
  background: 'rgba(20,14,5,0.85)',
  color: '#ffd86b',
  textShadow: '0 0 7px rgba(255,210,90,0.8)',
};

const frozenPalette: CSSProperties = {
  border: '1px solid rgba(255,176,102,0.7)',
  background: 'rgba(20,14,5,0.85)',
  color: '#ffb066',
  textShadow: '0 0 7px rgba(255,176,102,0.6)',
};

const subStyle: CSSProperties = {
  display: 'block',
  fontSize: 7,
  marginTop: 2,
  letterSpacing: 1.5,
  opacity: 0.65,
};

export function CountdownChip({ seconds, frozen, onToggleFreeze }: Props) {
  const [hover, setHover] = useState(false);
  const palette = frozen ? frozenPalette : hover ? hoverPalette : countingPalette;
  const main = frozen ? `FROZEN · ${seconds}s` : hover ? 'STOP CLOSING' : `CLOSING IN ${seconds}s`;
  const sub = frozen ? 'click to resume' : hover ? `click to freeze · ${seconds}s left` : 'hover to abort';
  return (
    <button
      type="button"
      data-testid="countdown-chip"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onToggleFreeze}
      style={{ ...base, ...palette }}
    >
      <span>{main}</span>
      <span style={subStyle}>{sub}</span>
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CountdownChip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/live/CountdownChip.tsx tests/unit/components/CountdownChip.test.tsx
git commit -m "feat(live): CountdownChip with counting/hover/frozen states"
```

---

## Task 21: `LivePane` component

**Files:**
- Create: `src/components/live/LivePane.tsx`
- Create: `tests/unit/components/LivePane.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/LivePane.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LivePane } from '../../../src/components/live/LivePane';
import type { Milestone } from '../../../src/parse/types';

function m(id: string, label: string, summary = ''): Milestone {
  return {
    id, kind: 'tool_call', label, summary,
    timestamp: '2026-05-24T12:00:00Z', failed: false, raw: null, children: [],
  };
}

describe('LivePane', () => {
  it('renders the pane header label', () => {
    render(<LivePane kind="main" label="MAIN" milestones={[m('a', 'Read App.tsx')]} />);
    expect(screen.getByTestId('live-pane').textContent).toContain('MAIN');
  });

  it('shows the newest milestone in the detail panel by default', () => {
    const ms = [m('a', 'Read App.tsx', 'first'), m('b', 'Grep node', 'newest')];
    render(<LivePane kind="main" label="MAIN" milestones={ms} />);
    expect(screen.getByTestId('live-pane-detail').textContent).toContain('newest');
  });

  it('pins a clicked node, holding even when new milestones arrive', () => {
    const ms = [m('a', 'Read App.tsx', 'first'), m('b', 'Grep node', 'second')];
    const { rerender } = render(<LivePane kind="main" label="MAIN" milestones={ms} />);
    // Click the first node to pin it
    fireEvent.click(screen.getByTestId('live-pane-node-a'));
    expect(screen.getByTestId('live-pane-detail').textContent).toContain('first');
    // Add a newer milestone — pin should still hold
    rerender(
      <LivePane kind="main" label="MAIN" milestones={[...ms, m('c', 'Edit App.tsx', 'newest')]} />
    );
    expect(screen.getByTestId('live-pane-detail').textContent).toContain('first');
  });

  it('renders the countdown chip when status indicates closing', () => {
    const onFreeze = vi.fn();
    render(
      <LivePane
        kind="subagent" label="SUBAGENT abc12345"
        milestones={[m('a', 'x')]}
        closingSeconds={24}
        frozen={false}
        onToggleFreeze={onFreeze}
      />
    );
    expect(screen.getByTestId('countdown-chip')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- LivePane`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/live/LivePane.tsx`:

```tsx
import { useState, type CSSProperties } from 'react';
import type { Milestone } from '../../parse/types';
import { CountdownChip } from './CountdownChip';

type Props = {
  kind: 'main' | 'subagent';
  label: string;
  milestones: Milestone[];
  closingSeconds?: number | null;
  frozen?: boolean;
  onToggleFreeze?: () => void;
};

const wrapper: CSSProperties = {
  position: 'relative',
  background: '#050810',
  overflow: 'hidden',
  display: 'flex',
};

const clip: CSSProperties = {
  position: 'absolute',
  inset: 0,
  clipPath: 'polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px)',
  pointerEvents: 'none',
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
    position: 'absolute',
    width: 12,
    height: 12,
    background: color,
    boxShadow: `0 0 6px ${color}`,
    clipPath: polygons[corner],
    pointerEvents: 'none',
    zIndex: 3,
    ...pos,
  };
}

const canvasArea: CSSProperties = {
  flex: 1,
  minWidth: 0,
  position: 'relative',
  background:
    'radial-gradient(ellipse 60% 80% at 50% 40%, rgba(0,229,255,0.04), transparent 70%),'
    + ' linear-gradient(transparent 49.5px, rgba(110,224,238,0.04) 50px),'
    + ' linear-gradient(90deg, transparent 49.5px, rgba(110,224,238,0.04) 50px)',
  backgroundSize: 'auto, 50px 50px, 50px 50px',
};

const headerStyle = (color: string): CSSProperties => ({
  position: 'absolute',
  top: 0, left: 0, right: 0,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 14px',
  background: 'linear-gradient(rgba(5,8,13,0.95), rgba(5,8,13,0.5))',
  borderBottom: '1px solid rgba(110,224,238,0.08)',
  fontSize: 9,
  letterSpacing: 2,
  color,
  fontFamily: 'ui-monospace, monospace',
  zIndex: 5,
  pointerEvents: 'none',
});

const detailStyle: CSSProperties = {
  width: '36%',
  minWidth: 160,
  flexShrink: 0,
  borderLeft: '1px solid rgba(110,224,238,0.18)',
  background: 'rgba(5,8,13,0.92)',
  padding: '24px 12px 12px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11,
  color: '#d4e9f0',
  overflow: 'auto',
  position: 'relative',
  zIndex: 4,
};

const nodeStyle: CSSProperties = {
  position: 'absolute',
  width: 18,
  height: 18,
  borderRadius: '50%',
  border: '1px solid rgba(110,224,238,0.6)',
  background: 'rgba(5,8,13,0.6)',
  cursor: 'pointer',
};

const activeNodeStyle: CSSProperties = {
  background: '#00e5ff',
  boxShadow: '0 0 10px #00e5ff, 0 0 18px #00e5ff',
  borderColor: 'transparent',
};

export function LivePane({ kind, label, milestones, closingSeconds, frozen, onToggleFreeze }: Props) {
  const accent = kind === 'main' ? '#00e5ff' : '#b894ff';
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const newest = milestones[milestones.length - 1] ?? null;
  const selected = (pinnedId ? milestones.find((m) => m.id === pinnedId) : null) ?? newest;

  return (
    <div
      data-testid="live-pane"
      style={{
        ...wrapper,
        animation: `${kind === 'main' ? 'paneBreathe' : 'subBreathe'} 3.5s ease-in-out infinite`,
        clipPath: clip.clipPath,
      }}
    >
      <span style={notchStyle('tl', accent)} />
      <span style={notchStyle('tr', accent)} />
      <span style={notchStyle('bl', accent)} />
      <span style={notchStyle('br', accent)} />

      <div style={canvasArea}>
        <div style={headerStyle(accent)}>
          <span>{label}</span>
          <span style={{ color: '#6e95a5' }}>{newest?.summary ?? ''}</span>
        </div>

        {/* Simple linear node row — real layout uses NodeShape/EdgePath in a follow-up. */}
        <div style={{ position: 'absolute', top: 30, left: 12, right: 12, bottom: 12 }}>
          {milestones.map((m, idx) => (
            <button
              key={m.id}
              data-testid={`live-pane-node-${m.id}`}
              onClick={() => setPinnedId(m.id)}
              style={{
                ...nodeStyle,
                ...(m === newest ? activeNodeStyle : {}),
                left: idx * 26,
                top: 30,
              }}
              title={m.label}
            />
          ))}
        </div>

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
          </>
        )}
      </aside>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- LivePane`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/live/LivePane.tsx tests/unit/components/LivePane.test.tsx
git commit -m "feat(live): LivePane component (border, canvas, detail, countdown)"
```

---

## Task 22: `LivePanes` container — grid + per-subagent status state

**Files:**
- Create: `src/components/live/LivePanes.tsx`
- Create: `tests/unit/components/LivePanes.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/LivePanes.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LivePanes } from '../../../src/components/live/LivePanes';
import type { Session, Milestone } from '../../../src/parse/types';

function m(id: string, kind: Milestone['kind'] = 'tool_call', children: Milestone[] = []): Milestone {
  return { id, kind, label: id, summary: '', timestamp: '', failed: false, raw: null, children };
}

function makeSession(mainTrail: Milestone[], subagentTrails: { id: string; lastUpdatedAt: string; root: Milestone }[]): Session {
  // Splice each sub-agent as a subagent_spawn off the last main node, with its root as children[0].
  let main: Milestone;
  if (mainTrail.length === 1) main = mainTrail[0];
  else {
    const reversed = [...mainTrail].reverse();
    main = reversed.reduce((acc, node, i) => {
      if (i === 0) return node;
      acc.children = [];
      const wrap: Milestone = { ...node, children: [acc] };
      return wrap;
    }, reversed[0]);
  }
  // Attach sub-agents as spawn nodes off the leaf
  let leaf = main;
  while (leaf.children.length > 0) leaf = leaf.children[0];
  for (const sa of subagentTrails) {
    leaf.children.push({ id: `spawn-${sa.id}`, kind: 'subagent_spawn', label: 'spawn',
      summary: '', timestamp: '', failed: false, raw: null,
      children: [sa.root] });
  }
  return {
    id: 'test-session', cwd: '/c',
    startedAt: '2026-05-24T12:00:00Z',
    root: main,
    successPath: new Set(),
    totalMilestones: 0,
  };
}

describe('LivePanes', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-05-24T12:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders just MAIN when there are no sub-agents (N=1)', () => {
    const session = makeSession([m('a')], []);
    render(<LivePanes session={session} subagentMtimes={{}} />);
    const panes = screen.getAllByTestId('live-pane');
    expect(panes).toHaveLength(1);
  });

  it('renders MAIN + 2 subagents in 2-col grid (N=3, last spans)', () => {
    const session = makeSession([m('a')], [
      { id: 'agent-aaaa1111', lastUpdatedAt: '2026-05-24T12:00:00Z', root: m('s1') },
      { id: 'agent-bbbb2222', lastUpdatedAt: '2026-05-24T12:00:00Z', root: m('s2') },
    ]);
    render(<LivePanes session={session} subagentMtimes={{
      'agent-aaaa1111': '2026-05-24T12:00:00Z',
      'agent-bbbb2222': '2026-05-24T12:00:00Z',
    }} />);
    expect(screen.getAllByTestId('live-pane')).toHaveLength(3);
    const grid = screen.getByTestId('live-panes-grid');
    expect(grid.getAttribute('data-n')).toBe('3');
  });

  it('transitions sub-agent pane to closing after 60s of stable mtime, then closed after 30s more', () => {
    const session = makeSession([m('a')], [
      { id: 'agent-aaaa1111', lastUpdatedAt: '2026-05-24T12:00:00Z', root: m('s1') },
    ]);
    const { rerender } = render(
      <LivePanes session={session} subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }} />
    );
    expect(screen.queryByTestId('countdown-chip')).toBeNull();

    // Advance 61s — should enter closing
    act(() => { vi.advanceTimersByTime(61_000); });
    rerender(<LivePanes session={session} subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }} />);
    expect(screen.getByTestId('countdown-chip')).toBeTruthy();

    // Advance another 31s — pane should be gone (only MAIN left)
    act(() => { vi.advanceTimersByTime(31_000); });
    rerender(<LivePanes session={session} subagentMtimes={{ 'agent-aaaa1111': '2026-05-24T12:00:00Z' }} />);
    expect(screen.getAllByTestId('live-pane')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- LivePanes`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the container**

Create `src/components/live/LivePanes.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Session, Milestone } from '../../parse/types';
import { LivePane } from './LivePane';
import { extractMainTrail } from './extractMainTrail';
import { subagentLabel } from './subagentLabel';
import { nextPaneStatus, remainingSeconds, type PaneState } from './paneStatus';
import { TICK_MS, CLOSING_MS } from './liveness';

type Props = {
  session: Session;
  /** Map of subagent file id → lastUpdatedAt ISO. The caller (App) feeds this from the SessionPayload subagents array. */
  subagentMtimes: Record<string, string>;
};

const containerStyle = (n: number): CSSProperties => ({
  flex: 1,
  display: 'grid',
  gridTemplateColumns: n === 1 ? '1fr' : '1fr 1fr',
  gap: 1,
  background: 'rgba(110,224,238,0.10)',
  minHeight: 0,
});

const lastSpanStyle: CSSProperties = { gridColumn: 'span 2' };

function collectSubagentTrails(root: Milestone): Map<string, Milestone[]> {
  // Each subagent_spawn's children[0] is the sub-agent's inner root.
  // The "id" we key by is matched to the subagent file id elsewhere; for now,
  // use the spawn node's id since attachSubagents already paired them.
  // We return id (spawn-node-derived) → trail (DFS of the inner subtree).
  const out = new Map<string, Milestone[]>();
  function walk(node: Milestone): void {
    if (node.kind === 'subagent_spawn' && node.children[0]) {
      const trail: Milestone[] = [];
      function inner(n: Milestone): void {
        trail.push(n);
        for (const c of n.children) inner(c);
      }
      inner(node.children[0]);
      // The id we use to look up mtime is the spawn's raw toolResult content's agentId.
      // attachSubagents has already attached by that match; here we just key by spawn id
      // and let the parent map the spawn id to a file id via session payload data.
      // For the v1 cut, we approximate: key by the first child id since spawn nodes are unique.
      const key = `spawn:${node.id}`;
      out.set(key, trail);
    }
    for (const c of node.children) walk(c);
  }
  walk(root);
  return out;
}

export function LivePanes({ session, subagentMtimes }: Props) {
  const mainTrail = useMemo(() => extractMainTrail(session.root), [session]);
  const subagentTrails = useMemo(() => collectSubagentTrails(session.root), [session]);
  const subagentKeys = useMemo(() => Array.from(subagentTrails.keys()), [subagentTrails]);

  // subagentMtimes is keyed by the on-disk file id (`agent-xxxx`). Since we
  // don't have a direct mapping from spawn-node → file id here in v1, we fall
  // back to alphabetical pairing of spawn keys with file ids. This works for
  // the common case (1 sub-agent at a time) and is correct enough until the
  // parser exposes a stable spawn→file linkage.
  const fileIds = useMemo(() => Object.keys(subagentMtimes).sort(), [subagentMtimes]);
  const keyToFileId = useMemo(() => {
    const map = new Map<string, string>();
    subagentKeys.forEach((k, i) => { if (fileIds[i]) map.set(k, fileIds[i]); });
    return map;
  }, [subagentKeys, fileIds]);

  const [statusMap, setStatusMap] = useState<Record<string, PaneState>>({});
  const [nowMs, setNowMs] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // Tick the status map whenever nowMs or subagentMtimes change.
  useEffect(() => {
    setStatusMap((prev) => {
      const next: Record<string, PaneState> = {};
      for (const key of subagentKeys) {
        const fileId = keyToFileId.get(key);
        const mtimeIso = fileId ? subagentMtimes[fileId] : undefined;
        const lastUpdatedMs = mtimeIso ? new Date(mtimeIso).getTime() : nowMs;
        const prevState: PaneState = prev[key] ?? {
          status: 'active', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null,
        };
        next[key] = nextPaneStatus(prevState, lastUpdatedMs, nowMs);
      }
      return next;
    });
  }, [nowMs, subagentKeys, keyToFileId, subagentMtimes]);

  // Build the displayable pane list: MAIN always; sub-agents whose status is not 'closed'.
  const displayableKeys = subagentKeys.filter((k) => statusMap[k]?.status !== 'closed');
  const total = 1 + displayableKeys.length;

  function freezeToggle(key: string): void {
    setStatusMap((prev) => {
      const s = prev[key];
      if (!s) return prev;
      if (s.status === 'frozen') {
        // resume: convert frozenRemainingMs back into a new closingStartedAt anchored at now.
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

  return (
    <div data-testid="live-panes-grid" data-n={total} style={containerStyle(total)}>
      <LivePane kind="main" label="MAIN" milestones={mainTrail} />
      {displayableKeys.map((key, idx) => {
        const isLastOdd = total % 2 === 1 && idx === displayableKeys.length - 1;
        const trail = subagentTrails.get(key) ?? [];
        const fileId = keyToFileId.get(key) ?? key;
        const status = statusMap[key];
        const closingSeconds = status ? remainingSeconds(status, nowMs) : null;
        const frozen = status?.status === 'frozen';
        return (
          <div key={key} style={isLastOdd ? lastSpanStyle : undefined}>
            <LivePane
              kind="subagent"
              label={subagentLabel(fileId)}
              milestones={trail}
              closingSeconds={status && (status.status === 'closing' || status.status === 'frozen') ? closingSeconds : null}
              frozen={frozen}
              onToggleFreeze={() => freezeToggle(key)}
            />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- LivePanes`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/live/LivePanes.tsx tests/unit/components/LivePanes.test.tsx
git commit -m "feat(live): LivePanes grid + per-sub-agent status state machine"
```

---

## Task 23: Wire `LivePanes` into the app

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/api/client.ts` (re-export the raw payload for `subagents` mtimes — see step below)

- [ ] **Step 1: Expose subagent mtimes from the session payload to `App.tsx`**

The current `useSession` parses the payload into a `Session` (which loses the per-subagent `lastUpdatedAt`). We need both. Two options; the simpler one — extend the parsed `Session` with a side-channel — is fine.

In `src/parse/index.ts`, replace the `parseSession` body to include the subagent mtimes:

Replace:

```ts
export function parseSession(payload: SessionPayload): Session {
  const events = parseJsonl(payload.jsonl);
  const clean = filterNoise(events);
  const chain = buildChain(clean);
  const root = buildMilestones(chain);
  attachSubagents(root, payload.subagents);
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
```

with:

```ts
export function parseSession(payload: SessionPayload): Session {
  const events = parseJsonl(payload.jsonl);
  const clean = filterNoise(events);
  const chain = buildChain(clean);
  const root = buildMilestones(chain);
  attachSubagents(root, payload.subagents);
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
  };
}
```

Add `subagentMtimes` to `Session` in `src/parse/types.ts`:

```ts
export type Session = {
  id: string;
  cwd: string;
  startedAt: string;
  root: Milestone;
  successPath: Set<string>;
  totalMilestones: number;
  subagentMtimes: Record<string, string>;
};
```

- [ ] **Step 2: Render `LivePanes` when `liveEngaged`**

In `src/App.tsx`, add the import:

```tsx
import { LivePanes } from './components/live/LivePanes';
```

Find the `<GraphCanvas ... />` block (within the `effectiveSession && !needsConfirm` branch around line 184). Replace it with a conditional:

```tsx
{liveEngaged ? (
  <LivePanes session={effectiveSession} subagentMtimes={effectiveSession.subagentMtimes} />
) : (
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
    sessionIsLive={sessionIsLive}
    onToggleLive={() => setLiveEngaged((v) => !v)}
  />
)}
```

Also: keep the `FilterToggles` / `Legend` / `gutter` (now-playing + playback controls) **only when not liveEngaged**, since they don't apply in multi-pane:

Find the existing block:

```tsx
{effectiveSession && !needsConfirm && (
  <div data-testid="chrome-gutter" style={styles.gutter}>
    <NowPlaying current={currentMilestone} edgeProgress={playback.edgeProgress} inSubagent={inSubagent} speed={playback.speed} />
    <PlaybackControls state={playback} controls={followingControls} />
  </div>
)}
```

Wrap with `{!liveEngaged && (...)}`:

```tsx
{effectiveSession && !needsConfirm && !liveEngaged && (
  <div data-testid="chrome-gutter" style={styles.gutter}>
    <NowPlaying current={currentMilestone} edgeProgress={playback.edgeProgress} inSubagent={inSubagent} speed={playback.speed} />
    <PlaybackControls state={playback} controls={followingControls} />
  </div>
)}
```

Do the same with the FilterToggles + Legend block (in the same area; they're sibling JSX in the canvasSlot — wrap or guard with `{!liveEngaged && ...}`).

- [ ] **Step 3: Typecheck + test**

Run: `npm run typecheck && npm test`
Expected: passes.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Touch a fixture jsonl to make it live, open it. Expected:
- Auto-engages LIVE mode → multi-pane view appears.
- Toggle LIVE off → single-canvas view returns.
Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/parse/index.ts src/parse/types.ts src/App.tsx src/api/client.ts
git commit -m "feat(app): render LivePanes when LIVE engaged; carry subagent mtimes through"
```

---

## Task 24: E2E — LIVE tag appears for a touched session

**Files:**
- Create: `tests/fixtures/claude-projects/C--demo-live/2026-05-24-live-fixture.jsonl`
- Create: `tests/e2e/live-session-tag.spec.ts`

- [ ] **Step 1: Add the fixture**

Create `tests/fixtures/claude-projects/C--demo-live/2026-05-24-live-fixture.jsonl` with content matching the existing simple session shape. The simplest content:

```jsonl
{"uuid":"u1","parentUuid":null,"timestamp":"2026-05-24T12:00:00Z","type":"user","sessionId":"2026-05-24-live-fixture","cwd":"/c/live","message":{"role":"user","content":"watch me run live"}}
{"uuid":"u2","parentUuid":"u1","timestamp":"2026-05-24T12:00:01Z","type":"assistant","sessionId":"2026-05-24-live-fixture","cwd":"/c/live","message":{"role":"assistant","content":[{"type":"text","text":"running"}]}}
```

- [ ] **Step 2: Write the e2e test**

Create `tests/e2e/live-session-tag.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { utimes } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('live tag: card shows [● LIVE] for a session with a recent mtime', async ({ page }) => {
  // Touch the fixture so its mtime is now (the e2e webServer is using
  // tests/fixtures/claude-projects as CLAUDE_HOME).
  const fixture = path.resolve(__dirname, '../fixtures/claude-projects/C--demo-live/2026-05-24-live-fixture.jsonl');
  const now = new Date();
  await utimes(fixture, now, now);

  await page.goto('/');
  // Expand the demo-live project (it auto-expands when first encountered) and
  // confirm the LIVE tag is visible on the live fixture's card.
  const card = page.locator('[data-testid="session-item-2026-05-24-live-fixture"]');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-testid="live-tag"]')).toBeVisible();
  await expect(card.locator('[data-testid="live-tag"]')).toHaveText(/LIVE/);
});
```

- [ ] **Step 3: Run the e2e test**

Run: `npm run test:e2e -- live-session-tag`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/claude-projects/C--demo-live tests/e2e/live-session-tag.spec.ts
git commit -m "test(e2e): LIVE tag appears on a session with recent mtime"
```

---

## Task 25: E2E — auto-engage LIVE on opening a live session

**Files:**
- Modify: `tests/e2e/live-session-tag.spec.ts` (add a second test)

- [ ] **Step 1: Add a second e2e test**

Append to `tests/e2e/live-session-tag.spec.ts`:

```ts
test('live mode: auto-engages when opening a live session, renders multi-pane', async ({ page }) => {
  const fixture = path.resolve(__dirname, '../fixtures/claude-projects/C--demo-live/2026-05-24-live-fixture.jsonl');
  const now = new Date();
  await utimes(fixture, now, now);

  await page.goto('/');
  await page.locator('[data-testid="session-item-2026-05-24-live-fixture"]').click();

  // Multi-pane grid should appear; LIVE button should show aria-pressed=true.
  await expect(page.locator('[data-testid="live-panes-grid"]')).toBeVisible();
  await expect(page.locator('[data-testid="live-button"]')).toHaveAttribute('aria-pressed', 'true');
});
```

- [ ] **Step 2: Run the e2e test**

Run: `npm run test:e2e -- live-session-tag`
Expected: both tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/live-session-tag.spec.ts
git commit -m "test(e2e): LIVE auto-engages and multi-pane renders on opening live session"
```

---

## Task 26: Final verification pass

- [ ] **Step 1: Full test sweep**

Run: `npm run typecheck && npm test && npm run test:e2e`
Expected: all green.

- [ ] **Step 2: Manual dev verification**

Run: `npm run dev`. Manually verify the spec's Verification section #1 through #9 (live tag on cards; card text wrap; canvas header sizing; auto-engage; multi-pane layout law; border decoration; sub-agent finish flow; per-pane detail; polling cadence in DevTools network tab).
Stop the dev server.

- [ ] **Step 3: Commit only if changes were needed**

If you needed to fix anything to make verification pass, commit those fixes with descriptive messages.

---

## Self-review notes

- **Spec coverage:** Every numbered section of the spec maps to at least one task:
  - §1 Liveness detection → Tasks 1, 4, 5
  - §2 Polling open session → Task 6
  - §3 Session card → Tasks 7, 9, 10, 11, 12
  - §4 Canvas header → Tasks 13, 14, 15, 16
  - §5 Multi-pane layout → Task 22
  - §6 Per-pane structure → Task 21
  - §7 Border treatment → Task 21 (notch + clip-path), Task 8 (keyframes)
  - §8 MAIN pane content → Task 17 (`extractMainTrail`)
  - §9 Sub-agent pane lifecycle → Tasks 19 (state machine), 22 (lifecycle wiring)
  - §10 Countdown chip → Task 20
  - §11 Per-pane detail panel → Task 21 (pin behavior tested)
  - App wiring edge cases (auto-engage at selection time only) → Task 15

- **Open follow-ups in the code (intentional):**
  - `LivePanes.collectSubagentTrails` uses alphabetical pairing between spawn nodes and file ids. The proper mapping is via the `agentId` parsed from spawn `tool_result` content (already done in `src/parse/subagents.ts:extractAgentIdFromMilestone`). Surface that id on the `Milestone` or in a side-channel as a follow-up — for v1 the alphabetical pairing covers the common 1-subagent-at-a-time case.
  - `LivePane`'s in-canvas node row is a simplified linear layout. Real D3 layout via `layoutTree` + `NodeShape` + `EdgePath` is the natural next iteration once the multi-pane plumbing is shipped.

- **Type consistency check:** `PaneState`, `PaneStatus`, `nextPaneStatus`, `remainingSeconds`, `subagentLabel`, `extractMainTrail`, `isLiveMeta` — all consistently named across tasks 17–22.

- **No placeholders found.** All code blocks contain executable content.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-24-live-sessions-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
