# Sidebar / Canvas Header / Minimap UX Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved spec at `docs/superpowers/specs/2026-05-23-sidebar-canvas-minimap-polish-design.md` — a focused UX pass covering sidebar item card styling, a canvas-header copy-cwd button, and full minimap interaction (drag-to-pan + cursor-anchored wheel zoom). Spike scaffolding (A/B variants, A/B/C selector, localStorage/event plumbing) is removed in the same pass.

**Architecture:** Three orthogonal feature areas, sequenced as three phases that each leave the app in a working state:

1. **Card-style lock-in & spike cleanup** — collapse `itemStyle.ts`/`ItemShell` to a single style (the C variant), drop the variant prop from `SessionsList` / `PromptsList`, remove the STYLE strip from `LibraryPanel`, drop the `cwd` subtitle line from session items, and clear the spike's `localStorage` key on first load.
2. **Canvas-header copy button** — introduce a small `CopyCwdButton` component, host it next to the cwd line in `App.tsx`'s session header overlay with localized `pointer-events: auto`.
3. **Minimap drag + wheel zoom** — extend `useCamera.centerOn` with an `{ animate }` option; extract a small pixel↔layout helper module; add pointer-event-based drag and a non-passive wheel handler in `Minimap`; wire `onPan` / `onZoom` callbacks from `GraphCanvas`.

**Tech Stack:** React 19 + TypeScript, Vite dev server, d3-zoom for camera. Testing: Vitest (jsdom) for unit, Playwright (chromium) for e2e. Run with `npm run typecheck`, `npm run test`, `npm run test:e2e`.

---

## File Structure

**Existing files to modify:**

- `src/components/library/itemStyle.ts` — collapse to single exported `ITEM_STYLE` constant; remove variant union, storage helpers, event bus, hook.
- `src/components/library/ItemShell.tsx` — drop `variant` prop; use the single style; bracket size becomes an inline constant.
- `src/components/library/SessionsList.tsx` — drop `variant` prop; remove the `cwd` subtitle line and its style entry.
- `src/components/library/PromptsList.tsx` — drop `variant` prop.
- `src/components/library/LibraryPanel.tsx` — remove STYLE strip JSX + styles; remove `useItemVariant`/`setItemVariant`/`ItemVariant` imports; remove `variant` props; on mount, `localStorage.removeItem('tg.spike.itemStyle')`.
- `src/App.tsx` — re-shape `sessionHeader` overlay so the cwd row hosts a `CopyCwdButton`; set `pointer-events: auto` on the cwd row only.
- `src/graph/useCamera.ts` — extend `centerOn` signature with `{ animate?: boolean }`; thread through `applyTransform` (which already supports `animate`).
- `src/components/Minimap.tsx` — add `onPan`, `onZoom` props alongside existing `onJump`; pointer-event-based drag against the viewport rect; non-passive wheel handler via `useEffect` + `addEventListener`; consume the helper from the new `minimapCoords` module.
- `src/components/GraphCanvas.tsx` — wire `onPan` and `onZoom` to `centerOn(pt, k?, { animate: false })`.

**New files to create:**

- `src/components/CopyCwdButton.tsx` — small button: copies given text to clipboard, briefly shows ✓ glyph.
- `src/components/minimapCoords.ts` — pure helpers for pixel↔layout in the minimap's coordinate system.
- `tests/unit/components/CopyCwdButton.test.tsx` — unit test for clipboard + state flip.
- `tests/unit/components/minimapCoords.test.ts` — unit tests for the helpers.
- `tests/e2e/minimap-pan-zoom.spec.ts` — e2e covering drag-pan and wheel-zoom.
- `tests/e2e/header-copy-cwd.spec.ts` — e2e covering the copy button.

**Files unchanged:** all other components, parse code, playback, etc.

---

## Phase A — Lock the card style and clean up the spike

### Task A1: Collapse `itemStyle.ts` to a single `ITEM_STYLE` constant

**Files:**
- Modify: `src/components/library/itemStyle.ts` (entire file rewritten)

- [ ] **Step 1: Replace the entire contents of `src/components/library/itemStyle.ts` with the locked single-style module.**

```ts
import type { CSSProperties } from 'react';

export type ItemStyle = {
  outer: CSSProperties;
  inner: CSSProperties;
  hover: CSSProperties;
  selected: CSSProperties;
};

// The locked sidebar item style ("C" variant from the brainstorm spike):
// transparent base with a soft cyan radial halo anchored to the left edge,
// hairline border at rest, glowing corner brackets when selected.
export const ITEM_STYLE: ItemStyle = {
  outer: { listStyle: 'none', padding: '3px 8px' },
  inner: {
    position: 'relative',
    padding: '8px 12px',
    border: '1px solid rgba(110, 224, 238, 0.10)',
    background: 'radial-gradient(ellipse 75% 120% at 18% 50%, rgba(0, 229, 255, 0.085) 0%, rgba(0, 229, 255, 0.02) 55%, rgba(0, 229, 255, 0) 80%)',
    cursor: 'pointer',
    transition: 'border-color 220ms ease, background 220ms ease, box-shadow 220ms ease',
  },
  hover: {
    border: '1px solid rgba(110, 224, 238, 0.28)',
    background: 'radial-gradient(ellipse 85% 140% at 22% 50%, rgba(0, 229, 255, 0.13) 0%, rgba(0, 229, 255, 0.035) 60%, rgba(0, 229, 255, 0) 85%)',
  },
  selected: {
    border: '1px solid rgba(0, 229, 255, 0.0)',
    background: 'radial-gradient(ellipse 90% 150% at 22% 50%, rgba(0, 229, 255, 0.20) 0%, rgba(0, 229, 255, 0.06) 60%, rgba(0, 229, 255, 0.005) 90%)',
  },
};
```

- [ ] **Step 2: Verify the file compiles in isolation.**

Run: `npx tsc --noEmit src/components/library/itemStyle.ts`
Expected: no output, exit code 0. (The file is self-contained — only depends on React's `CSSProperties` type.)

- [ ] **Step 3: Commit (will fail typecheck for the rest of the tree until A2–A4 land — that's expected, do not push).**

```bash
git add src/components/library/itemStyle.ts
git commit -m "refactor(library): collapse itemStyle to single locked style"
```

---

### Task A2: Simplify `ItemShell` — drop the `variant` prop

**Files:**
- Modify: `src/components/library/ItemShell.tsx` (entire file rewritten)

- [ ] **Step 1: Replace the entire contents of `src/components/library/ItemShell.tsx` with the variant-free version.**

```tsx
import { useState } from 'react';
import type { CSSProperties, ReactNode, MouseEvent } from 'react';
import { ITEM_STYLE } from './itemStyle';

type Props = {
  selected: boolean;
  onClick?: (e: MouseEvent<HTMLLIElement>) => void;
  testId?: string;
  children: ReactNode;
};

const BRACKET_SIZE = 9;
const BRACKET_GLOW = '0 0 6px rgba(0,229,255,0.55)';
const BRACKET_COLOR = 'var(--edge-trail)';

function bracket(pos: 'tl' | 'tr' | 'bl' | 'br'): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute',
    width: BRACKET_SIZE,
    height: BRACKET_SIZE,
    pointerEvents: 'none',
    boxShadow: BRACKET_GLOW,
  };
  if (pos === 'tl') return { ...base, top: -1, left: -1, borderTop: `1px solid ${BRACKET_COLOR}`, borderLeft: `1px solid ${BRACKET_COLOR}` };
  if (pos === 'tr') return { ...base, top: -1, right: -1, borderTop: `1px solid ${BRACKET_COLOR}`, borderRight: `1px solid ${BRACKET_COLOR}` };
  if (pos === 'bl') return { ...base, bottom: -1, left: -1, borderBottom: `1px solid ${BRACKET_COLOR}`, borderLeft: `1px solid ${BRACKET_COLOR}` };
  return { ...base, bottom: -1, right: -1, borderBottom: `1px solid ${BRACKET_COLOR}`, borderRight: `1px solid ${BRACKET_COLOR}` };
}

export function ItemShell({ selected, onClick, testId, children }: Props) {
  const [hover, setHover] = useState(false);
  const inner: CSSProperties = {
    ...ITEM_STYLE.inner,
    ...(hover && !selected ? ITEM_STYLE.hover : {}),
    ...(selected ? ITEM_STYLE.selected : {}),
  };
  return (
    <li
      style={ITEM_STYLE.outer}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      data-testid={testId}
    >
      <div style={inner}>
        {children}
        {selected && (
          <>
            <span style={bracket('tl')} />
            <span style={bracket('tr')} />
            <span style={bracket('bl')} />
            <span style={bracket('br')} />
          </>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Commit.**

```bash
git add src/components/library/ItemShell.tsx
git commit -m "refactor(library): drop variant prop from ItemShell"
```

(Typecheck will still fail repo-wide until A3 + A4 + A5 update callers.)

---

### Task A3: Update `SessionsList` — drop `variant`, drop cwd subtitle

**Files:**
- Modify: `src/components/library/SessionsList.tsx` (entire file rewritten)

- [ ] **Step 1: Replace the entire contents of `src/components/library/SessionsList.tsx`.**

```tsx
import { useState } from 'react';
import type { SessionMeta } from '../../parse/types';
import { ItemShell } from './ItemShell';

type Props = {
  items: SessionMeta[];
  selectedSessionId: string | null;
  titles: Record<string, string>;
  onSelect: (s: SessionMeta) => void;
  onRename: (sessionId: string, title: string) => void;
};

function basename(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

export function SessionsList({ items, selectedSessionId, titles, onSelect, onRename }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  function startEdit(s: SessionMeta, e: React.MouseEvent): void {
    e.stopPropagation();
    setEditingId(s.sessionId);
    setDraftTitle(titles[s.sessionId] ?? s.title ?? basename(s.cwd));
  }

  function commitEdit(s: SessionMeta): void {
    onRename(s.sessionId, draftTitle.trim());
    setEditingId(null);
  }

  return (
    <ul style={styles.list}>
      {items.map((s) => {
        const isSelected = selectedSessionId === s.sessionId;
        const displayTitle = titles[s.sessionId] ?? s.title ?? basename(s.cwd);
        const isEditing = editingId === s.sessionId;
        return (
          <ItemShell
            key={`${s.projectId}/${s.sessionId}`}
            selected={isSelected}
            onClick={() => { if (!isEditing) onSelect(s); }}
            testId={`session-item-${s.sessionId}`}
          >
            {isEditing ? (
              <input
                autoFocus
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.currentTarget.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => commitEdit(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitEdit(s); }
                  else if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                }}
                style={styles.editInput}
                data-testid={`session-rename-${s.sessionId}`}
              />
            ) : (
              <div
                style={styles.itemTitle}
                onDoubleClick={(e) => startEdit(s, e)}
                title={displayTitle}
              >
                {displayTitle}
              </div>
            )}
            <div style={styles.itemMeta}>
              {new Date(s.startedAt).toLocaleString()} · {Math.round(s.sizeBytes / 1024)}KB
            </div>
          </ItemShell>
        );
      })}
    </ul>
  );
}

const styles = {
  list: { listStyle: 'none', padding: 0, margin: 0 },
  itemTitle: {
    fontSize: 12,
    color: 'var(--text)',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontFamily: 'ui-monospace, monospace',
  },
  itemMeta: {
    fontSize: 10,
    color: 'var(--text-dim)',
    marginTop: 2,
    fontFamily: 'ui-monospace, monospace',
  },
  editInput: {
    width: '100%',
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid var(--edge-trail)',
    color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12,
    padding: '2px 4px',
    boxSizing: 'border-box' as const,
  },
};
```

Notes:
- Removes the `variant` prop and the `ItemVariant` import.
- Removes the `itemCwd` JSX line (`<div style={styles.itemCwd} title={s.cwd}>{s.cwd}</div>`) and the matching `itemCwd` entry in the `styles` object.
- All other behavior (rename via double-click, click-to-select, testid scheme) is preserved.

- [ ] **Step 2: Commit.**

```bash
git add src/components/library/SessionsList.tsx
git commit -m "refactor(library): drop variant prop and cwd subtitle from SessionsList"
```

---

### Task A4: Update `PromptsList` — drop `variant`

**Files:**
- Modify: `src/components/library/PromptsList.tsx` (entire file rewritten)

- [ ] **Step 1: Replace the entire contents of `src/components/library/PromptsList.tsx`.**

```tsx
import type { PromptMeta } from '../../parse/types';
import { ItemShell } from './ItemShell';

type Props = {
  items: PromptMeta[];
  sessionTitles: Record<string, string>;
  selectedPromptId: string | null;
  onSelect: (p: PromptMeta) => void;
};

function sessionSubtitle(p: PromptMeta, titles: Record<string, string>): string {
  const renamed = titles[p.sessionId];
  if (renamed) return renamed;
  return `SESSION ${p.sessionId.slice(0, 8)}`;
}

export function PromptsList({ items, sessionTitles, selectedPromptId, onSelect }: Props) {
  return (
    <ul style={styles.list}>
      {items.map((p) => {
        const isSelected = selectedPromptId === p.promptId;
        return (
          <ItemShell
            key={p.promptId}
            selected={isSelected}
            onClick={() => onSelect(p)}
            testId={`prompt-item-${p.promptId}`}
          >
            <div style={styles.itemTitle} title={p.text}>{p.text}</div>
            <div style={styles.itemSub} title={p.sessionId}>{sessionSubtitle(p, sessionTitles)}</div>
            <div style={styles.itemMeta}>{new Date(p.timestamp).toLocaleString()}</div>
          </ItemShell>
        );
      })}
    </ul>
  );
}

const styles = {
  list: { listStyle: 'none', padding: 0, margin: 0 },
  itemTitle: {
    fontSize: 12,
    color: 'var(--text)',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontFamily: 'ui-monospace, monospace',
  },
  itemSub: {
    fontSize: 10,
    color: 'var(--edge-trail)',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontFamily: 'ui-monospace, monospace',
    letterSpacing: 1,
    marginTop: 2,
  },
  itemMeta: {
    fontSize: 10,
    color: 'var(--text-dim)',
    marginTop: 2,
    fontFamily: 'ui-monospace, monospace',
  },
};
```

- [ ] **Step 2: Commit.**

```bash
git add src/components/library/PromptsList.tsx
git commit -m "refactor(library): drop variant prop from PromptsList"
```

---

### Task A5: Remove STYLE strip and spike plumbing from `LibraryPanel`

**Files:**
- Modify: `src/components/library/LibraryPanel.tsx`

- [ ] **Step 1: Remove the spike import.**

Find the import line near the top of the file:
```ts
import { setItemVariant, useItemVariant, type ItemVariant } from './itemStyle';
```
Delete it entirely.

- [ ] **Step 2: Remove the `itemVariant` variable.**

Find this block at the top of the `LibraryPanel` function:
```ts
  const sessionsQuery = useSessionList();
  const promptsQuery = usePromptList();
  const itemVariant = useItemVariant();
```
Change it to:
```ts
  const sessionsQuery = useSessionList();
  const promptsQuery = usePromptList();
```

- [ ] **Step 3: Add the spike-localStorage cleanup effect.**

Locate the existing `useEffect` block in `LibraryPanel` that handles `expandedInit`. Add a new `useEffect` immediately above it (right after the `useState` block):

```ts
  // One-time cleanup: remove the spike's persisted variant key from any user
  // who tried the A/B/C selector during the brainstorm phase. Safe no-op once
  // the key is gone.
  useEffect(() => {
    try { localStorage.removeItem('tg.spike.itemStyle'); } catch { /* ignore */ }
  }, []);
```

- [ ] **Step 4: Remove the STYLE strip JSX.**

Find the block immediately after the filter `<input ... data-testid="session-filter" />`:

```tsx
      <div style={styles.spikeBar} data-testid="spike-bar" title="card-style spike">
        <span style={styles.spikeLabel}>STYLE</span>
        {(['A', 'B', 'C'] as ItemVariant[]).map((v) => {
          const active = itemVariant === v;
          return (
            <button
              key={v}
              onClick={() => setItemVariant(v)}
              style={{ ...styles.spikeBtn, ...(active ? styles.spikeBtnActive : {}) }}
              data-testid={`spike-${v}`}
              aria-pressed={active}
            >{v}</button>
          );
        })}
      </div>
```

Delete the whole block.

- [ ] **Step 5: Remove the `variant` prop from both list calls.**

Find each call site:
```tsx
              {isOpen && mode === 'sessions' && (
                <SessionsList
                  items={g.items as SessionMeta[]}
                  selectedSessionId={selectedSessionId}
                  titles={titles}
                  variant={itemVariant}
                  onSelect={(s) => onSelect({ kind: 'session', projectId: s.projectId, sessionId: s.sessionId })}
                  onRename={onRename}
                />
              )}
              {isOpen && mode === 'prompts' && (
                <PromptsList
                  items={g.items as unknown as PromptMeta[]}
                  sessionTitles={titles}
                  selectedPromptId={selectedPromptId}
                  variant={itemVariant}
                  onSelect={(p) => onSelect({ kind: 'prompt', projectId: p.projectId, sessionId: p.sessionId, promptId: p.promptId })}
                />
              )}
```

Remove only the `variant={itemVariant}` lines from both blocks. Leave everything else unchanged.

- [ ] **Step 6: Delete the spike style entries.**

Find these entries in the `styles` object at the bottom of the file:

```ts
  spikeBar: {
    display: 'flex' as const,
    alignItems: 'center',
    gap: 6,
    padding: '0 12px 8px',
  },
  spikeLabel: {
    fontSize: 9,
    letterSpacing: 2,
    color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
    marginRight: 2,
  },
  spikeBtn: {
    background: 'transparent',
    border: '1px solid var(--edge-idle)',
    color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 10,
    letterSpacing: 1,
    padding: '2px 8px',
    cursor: 'pointer',
  },
  spikeBtnActive: {
    borderColor: 'var(--edge-trail)',
    color: 'var(--edge-trail)',
    boxShadow: '0 0 8px rgba(0, 229, 255, 0.35)',
  },
```

Delete all four entries.

- [ ] **Step 7: Typecheck the repo.**

Run: `npm run typecheck`
Expected: exits 0 with no output. (Phase A files now all compile against each other.)

- [ ] **Step 8: Run the existing unit + e2e suites — they should pass without modification.**

Run: `npm run test`
Expected: all tests pass.

Run: `npm run test:e2e`
Expected: all tests pass. The `discovery-load`, `prompts-mode`, `sidebar-resize`, and other suites depend on `session-item-*` and `prompt-item-*` testids, which are preserved on the `<li>` via `ItemShell`.

- [ ] **Step 9: Commit.**

```bash
git add src/components/library/LibraryPanel.tsx
git commit -m "refactor(library): remove A/B/C spike from LibraryPanel"
```

---

## Phase B — Canvas-header copy button

### Task B1: Create `CopyCwdButton` with a unit test

**Files:**
- Create: `src/components/CopyCwdButton.tsx`
- Create: `tests/unit/components/CopyCwdButton.test.tsx`

- [ ] **Step 1: Write the failing unit test.**

```tsx
// tests/unit/components/CopyCwdButton.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CopyCwdButton } from '../../../src/components/CopyCwdButton';

describe('CopyCwdButton', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a button with the copy glyph at rest', () => {
    render(<CopyCwdButton value="C:/x/y" />);
    const btn = screen.getByTestId('header-copy-cwd');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe('⧉');
  });

  it('writes the value to the clipboard on click and flips to the copied glyph', async () => {
    render(<CopyCwdButton value="C:/x/y" />);
    const btn = screen.getByTestId('header-copy-cwd');

    fireEvent.click(btn);

    expect(writeText).toHaveBeenCalledWith('C:/x/y');
    await waitFor(() => expect(btn.textContent).toBe('✓'));
  });

  it('reverts to the copy glyph after the flash window', async () => {
    render(<CopyCwdButton value="C:/x/y" />);
    const btn = screen.getByTestId('header-copy-cwd');

    fireEvent.click(btn);
    await waitFor(() => expect(btn.textContent).toBe('✓'));

    vi.advanceTimersByTime(1200);
    await waitFor(() => expect(btn.textContent).toBe('⧉'));
  });
});
```

- [ ] **Step 2: Run it — confirm it fails because the component does not exist.**

Run: `npm run test -- CopyCwdButton`
Expected: FAIL — `Cannot find module '../../../src/components/CopyCwdButton'`.

- [ ] **Step 3: Implement the component.**

Create `src/components/CopyCwdButton.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

type Props = {
  value: string;
};

const FLASH_MS = 1200;

export function CopyCwdButton({ value }: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  async function onClick(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard may reject (no permission, no secure context). Treat as a
      // silent no-op — we don't surface failure for a polish affordance.
      return;
    }
    setCopied(true);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, FLASH_MS);
  }

  const style: CSSProperties = {
    background: 'transparent',
    border: `1px solid ${copied ? 'var(--edge-trail)' : 'var(--edge-idle)'}`,
    color: copied ? 'var(--edge-trail)' : 'var(--text-dim)',
    width: 18,
    height: 18,
    fontSize: 11,
    lineHeight: '16px',
    fontFamily: 'ui-monospace, monospace',
    cursor: 'pointer',
    padding: 0,
    marginLeft: 6,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'border-color 120ms ease, color 120ms ease',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="header-copy-cwd"
      title={copied ? 'copied' : 'copy path'}
      aria-label={copied ? 'copied' : 'copy path'}
      style={style}
    >{copied ? '✓' : '⧉'}</button>
  );
}
```

- [ ] **Step 4: Run the unit test — confirm it passes.**

Run: `npm run test -- CopyCwdButton`
Expected: 3 tests pass.

- [ ] **Step 5: Commit.**

```bash
git add src/components/CopyCwdButton.tsx tests/unit/components/CopyCwdButton.test.tsx
git commit -m "feat(header): add CopyCwdButton with copy + flash behavior"
```

---

### Task B2: Wire `CopyCwdButton` into the canvas session header

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import the new component.**

Add this import near the other component imports at the top of `src/App.tsx`:

```ts
import { CopyCwdButton } from './components/CopyCwdButton';
```

- [ ] **Step 2: Replace the cwd line in the session header.**

Locate the block at around line 184–187:

```tsx
              <div style={styles.sessionHeader} data-testid="session-header">
                <div style={styles.sessionTitle}>{headerTitle}</div>
                <div style={styles.sessionCwd}>{effectiveSession.cwd}</div>
              </div>
```

Replace with:

```tsx
              <div style={styles.sessionHeader} data-testid="session-header">
                <div style={styles.sessionTitle}>{headerTitle}</div>
                <div style={styles.sessionCwdRow}>
                  <span style={styles.sessionCwd}>{effectiveSession.cwd}</span>
                  <CopyCwdButton value={effectiveSession.cwd} />
                </div>
              </div>
```

- [ ] **Step 3: Add the row style; make the cwd row interactive while the overlay container stays non-interactive.**

Find the `sessionHeader` style entry in the `styles` object near the bottom of `src/App.tsx`:

```ts
  sessionHeader: {
    position: 'absolute' as const,
    top: 16,
    left: 24,
    zIndex: 5,
    pointerEvents: 'none' as const,
  },
```

Keep it as-is (overlay stays non-interactive by default), and add a `sessionCwdRow` entry right after the `sessionCwd` entry:

```ts
  sessionCwdRow: {
    display: 'flex' as const,
    alignItems: 'center',
    marginTop: 2,
    pointerEvents: 'auto' as const,
  },
```

The existing `sessionCwd` style still applies to the `<span>` wrapping the cwd text — it already sets the font and color and no longer needs to control layout, so no change is required to its definition.

- [ ] **Step 4: Run typecheck.**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 5: Write the e2e test.**

Create `tests/e2e/header-copy-cwd.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('header copy-cwd button copies the path and flashes the check glyph', async ({ page, context }) => {
  // Grant clipboard permission so the page can call writeText in Chromium.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();

  // Header overlay must be visible with the cwd row.
  const header = page.getByTestId('session-header');
  await expect(header).toBeVisible();

  const btn = page.getByTestId('header-copy-cwd');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('⧉');

  await btn.click();

  // Glyph flips to ✓ briefly, then reverts.
  await expect(btn).toHaveText('✓');
  await page.waitForTimeout(1400);
  await expect(btn).toHaveText('⧉');

  // The clipboard now holds the cwd text. Read it back from the page context.
  const clipped = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipped).toMatch(/demo\/happy/);
});
```

- [ ] **Step 6: Run e2e to confirm the new test passes and existing tests still pass.**

Run: `npm run test:e2e`
Expected: all tests pass, including the new `header-copy-cwd` spec.

- [ ] **Step 7: Commit.**

```bash
git add src/App.tsx tests/e2e/header-copy-cwd.spec.ts
git commit -m "feat(header): host CopyCwdButton next to cwd in session header"
```

---

## Phase C — Minimap drag and wheel zoom

### Task C1: Extend `centerOn` with an `{ animate }` option

**Files:**
- Modify: `src/graph/useCamera.ts`
- Modify: `tests/unit/camera.test.ts` (add coverage; existing assertions stay)

- [ ] **Step 1: Add a failing unit test for the new option.**

Append to `tests/unit/camera.test.ts`:

```ts
import { centerOnTransform } from '../../src/graph/useCamera';
// (no new import needed if already importing centerOnTransform above)

describe('centerOnTransform options', () => {
  it('keeps the same math regardless of animate (option only changes the apply path)', () => {
    // Helper is a pure function — adding the animate option to the wrapper
    // hook does not affect the math itself. This test pins that intent.
    const a = centerOnTransform({ x: 100, y: 200 }, { width: 800, height: 600 }, 1.5);
    const b = centerOnTransform({ x: 100, y: 200 }, { width: 800, height: 600 }, 1.5);
    expect(a).toEqual(b);
  });
});
```

This test is a documentation pin. (The behavioral change happens inside the hook's `applyTransform`, which already accepts an `animate` flag — the new code path is exercised by the minimap e2e tests added later.)

- [ ] **Step 2: Run tests to confirm baseline still green.**

Run: `npm run test -- camera`
Expected: all camera tests pass.

- [ ] **Step 3: Update the `centerOn` signature in the `CameraApi` and implementation.**

Find this in `src/graph/useCamera.ts` (around line 65–72):

```ts
export type CameraApi = {
  transform: Transform;
  follow: boolean;
  setFollow: (b: boolean) => void;
  fit: () => void;
  frameInitial: (rootPoint: { x: number; y: number }) => void;
  centerOn: (pt: { x: number; y: number }, k?: number) => void;
};
```

Change `centerOn`'s signature to accept the options object:

```ts
export type CameraApi = {
  transform: Transform;
  follow: boolean;
  setFollow: (b: boolean) => void;
  fit: () => void;
  frameInitial: (rootPoint: { x: number; y: number }) => void;
  centerOn: (pt: { x: number; y: number }, k?: number, opts?: { animate?: boolean }) => void;
};
```

Find the implementation around lines 126–129:

```ts
  const centerOn = useCallback((pt: { x: number; y: number }, k?: number) => {
    const targetK = k ?? Math.max(0.6, transform.k);
    applyTransform(centerOnTransform(pt, viewport, targetK));
  }, [applyTransform, viewport, transform.k]);
```

Replace with:

```ts
  const centerOn = useCallback((pt: { x: number; y: number }, k?: number, opts?: { animate?: boolean }) => {
    const targetK = k ?? Math.max(0.6, transform.k);
    const animate = opts?.animate ?? true;
    applyTransform(centerOnTransform(pt, viewport, targetK), animate);
  }, [applyTransform, viewport, transform.k]);
```

- [ ] **Step 4: Typecheck.**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Run tests.**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 6: Commit.**

```bash
git add src/graph/useCamera.ts tests/unit/camera.test.ts
git commit -m "feat(camera): centerOn accepts { animate } option"
```

---

### Task C2: Extract `minimapCoords` helper with unit tests

**Files:**
- Create: `src/components/minimapCoords.ts`
- Create: `tests/unit/components/minimapCoords.test.ts`

- [ ] **Step 1: Write failing unit tests.**

Create `tests/unit/components/minimapCoords.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { layoutFromMinimapPixel, viewportRectInLayout, isPointInRect } from '../../../src/components/minimapCoords';

describe('layoutFromMinimapPixel', () => {
  // Given a 200×140 minimap drawing a 1000×500 layout with uniform centering:
  // s = min(200/1000, 140/500) = 0.2; the y-axis fits exactly (500 * 0.2 = 100)
  // and the x-axis is fully used (1000 * 0.2 = 200).
  const W = 200;
  const H = 140;
  const s = Math.min(W / 1000, H / 500);
  const offX = (W - 1000 * s) / 2;
  const offY = (H - 500 * s) / 2;

  it('returns 0,0 for the top-left layout corner (after offset)', () => {
    const out = layoutFromMinimapPixel(offX, offY, offX, offY, s);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(0, 5);
  });

  it('returns 1000,500 for the bottom-right corner of the drawn layout', () => {
    const out = layoutFromMinimapPixel(offX + 1000 * s, offY + 500 * s, offX, offY, s);
    expect(out.x).toBeCloseTo(1000, 5);
    expect(out.y).toBeCloseTo(500, 5);
  });
});

describe('viewportRectInLayout', () => {
  it('returns the rect described by transform.k and the viewport size', () => {
    const r = viewportRectInLayout({ k: 2, x: -200, y: -100 }, { width: 800, height: 600 });
    // x = -tx/k = 100, y = -ty/k = 50, w = vw/k = 400, h = vh/k = 300
    expect(r.x).toBeCloseTo(100, 5);
    expect(r.y).toBeCloseTo(50, 5);
    expect(r.width).toBeCloseTo(400, 5);
    expect(r.height).toBeCloseTo(300, 5);
  });
});

describe('isPointInRect', () => {
  const rect = { x: 10, y: 20, width: 30, height: 40 };

  it('returns true for an interior point', () => {
    expect(isPointInRect({ x: 15, y: 25 }, rect)).toBe(true);
  });
  it('returns false for a point above the rect', () => {
    expect(isPointInRect({ x: 15, y: 5 }, rect)).toBe(false);
  });
  it('returns false for a point to the right of the rect', () => {
    expect(isPointInRect({ x: 100, y: 25 }, rect)).toBe(false);
  });
  it('treats the boundary as inside', () => {
    expect(isPointInRect({ x: 10, y: 20 }, rect)).toBe(true);
    expect(isPointInRect({ x: 40, y: 60 }, rect)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests — confirm they fail because the module does not exist.**

Run: `npm run test -- minimapCoords`
Expected: FAIL — `Cannot find module '../../../src/components/minimapCoords'`.

- [ ] **Step 3: Create the helper module.**

Create `src/components/minimapCoords.ts`:

```ts
import type { Transform } from '../graph/useCamera';

export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };

/**
 * Convert a pixel position inside the minimap SVG to a layout-space point.
 *
 * The minimap renders the layout uniformly scaled (factor `s`) with an offset
 * `(offX, offY)` to center it within the SVG. The inverse, given an event
 * coordinate already expressed relative to the SVG's top-left, is:
 *   layoutX = (pixelX - offX) / s
 *   layoutY = (pixelY - offY) / s
 */
export function layoutFromMinimapPixel(
  pixelX: number,
  pixelY: number,
  offX: number,
  offY: number,
  s: number,
): Point {
  return { x: (pixelX - offX) / s, y: (pixelY - offY) / s };
}

/**
 * Compute the camera's current visible rectangle in layout coordinates,
 * derived from the camera transform and the canvas viewport size.
 */
export function viewportRectInLayout(transform: Transform, viewport: { width: number; height: number }): Rect {
  return {
    x: -transform.x / transform.k,
    y: -transform.y / transform.k,
    width: viewport.width / transform.k,
    height: viewport.height / transform.k,
  };
}

/**
 * Inclusive boundary test: a point sitting exactly on the rect's edge is
 * considered inside. Avoids "dead" pixel rows along the rect's outline.
 */
export function isPointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}
```

- [ ] **Step 4: Run the tests — confirm they pass.**

Run: `npm run test -- minimapCoords`
Expected: all tests pass.

- [ ] **Step 5: Commit.**

```bash
git add src/components/minimapCoords.ts tests/unit/components/minimapCoords.test.ts
git commit -m "feat(minimap): extract pixel<->layout helpers"
```

---

### Task C3: Add drag + wheel handling to `Minimap`

**Files:**
- Modify: `src/components/Minimap.tsx` (entire file rewritten)

- [ ] **Step 1: Replace the entire contents of `src/components/Minimap.tsx`.**

```tsx
import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { LayoutResult } from '../graph/layout';
import type { Transform } from '../graph/useCamera';
import { layoutFromMinimapPixel, viewportRectInLayout, isPointInRect, type Point } from './minimapCoords';

type Props = {
  layout: LayoutResult;
  transform: Transform;
  viewport: { width: number; height: number };
  currentLayoutPoint: { x: number; y: number } | null;
  onJump: (layoutPoint: Point) => void;
  onPan: (layoutPoint: Point) => void;
  onZoom: (layoutPoint: Point, k: number) => void;
};

const W = 200;
const H = 140;
const SCALE_MIN = 0.2;
const SCALE_MAX = 8;
// Multiplicative wheel step. ~1.0015^120 ≈ 1.20 per detent on most mice.
const WHEEL_BASE = 1.0015;

export function Minimap({ layout, transform, viewport, currentLayoutPoint, onJump, onPan, onZoom }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<{
    rectOffsetInLayout: Point; // (cursorLayout - rectTopLeft) at drag start
  } | null>(null);
  const draggedRef = useRef(false);

  const sx = W / Math.max(1, layout.width);
  const sy = H / Math.max(1, layout.height);
  const s = Math.min(sx, sy);
  const offX = (W - layout.width * s) / 2;
  const offY = (H - layout.height * s) / 2;

  const rectLayout = viewportRectInLayout(transform, viewport);

  function eventToLayout(e: { clientX: number; clientY: number }): Point | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return layoutFromMinimapPixel(e.clientX - rect.x, e.clientY - rect.y, offX, offY, s);
  }

  function handleClick(e: ReactMouseEvent<SVGSVGElement>) {
    // A drag's pointerup synthesizes a click. Skip it.
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    const layoutPt = eventToLayout(e);
    if (!layoutPt) return;
    onJump(layoutPt);
  }

  function handlePointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    const layoutPt = eventToLayout(e);
    if (!layoutPt) return;
    if (!isPointInRect(layoutPt, rectLayout)) return; // click-to-jump path handles it
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      rectOffsetInLayout: { x: layoutPt.x - rectLayout.x, y: layoutPt.y - rectLayout.y },
    };
  }

  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!dragStateRef.current) return;
    const layoutPt = eventToLayout(e);
    if (!layoutPt) return;
    draggedRef.current = true;
    // New rect top-left in layout space, then center of rect = camera center.
    const nextTopLeft = {
      x: layoutPt.x - dragStateRef.current.rectOffsetInLayout.x,
      y: layoutPt.y - dragStateRef.current.rectOffsetInLayout.y,
    };
    const center = { x: nextTopLeft.x + rectLayout.width / 2, y: nextTopLeft.y + rectLayout.height / 2 };
    onPan(center);
  }

  function handlePointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    if (dragStateRef.current) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragStateRef.current = null;
    }
    // draggedRef stays true until the synthesized click clears it.
  }

  // Wheel handler attached non-passive so we can preventDefault and stop the
  // surrounding canvas from also wheeling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(ev: WheelEvent) {
      ev.preventDefault();
      const rect = svg!.getBoundingClientRect();
      const layoutPt = layoutFromMinimapPixel(ev.clientX - rect.x, ev.clientY - rect.y, offX, offY, s);
      const factor = Math.pow(WHEEL_BASE, -ev.deltaY);
      const nextK = Math.min(SCALE_MAX, Math.max(SCALE_MIN, transform.k * factor));
      onZoom(layoutPt, nextK);
    }
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => { svg.removeEventListener('wheel', onWheel); };
  }, [offX, offY, s, transform.k, onZoom]);

  // Cursor: grab when the cursor sits inside the viewport rect, crosshair
  // elsewhere. Cheap to recompute per render — there's no live mousemove
  // listener for hover; the cursor swaps via inline `style.cursor`. Browsers
  // refresh cursor as the pointer moves over the element so we only need to
  // set the right default; for an extra-correct version we'd track hover.
  const cursorStyle = 'crosshair';

  return (
    <svg
      ref={svgRef}
      data-testid="minimap"
      width={W}
      height={H}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        zIndex: 6,
        background: 'rgba(5,8,13,0.85)',
        border: '1px solid var(--edge-idle)',
        cursor: cursorStyle,
        touchAction: 'none',
      }}
    >
      <g transform={`translate(${offX}, ${offY}) scale(${s})`}>
        {layout.edges.map((e) => (
          <line
            key={`${e.sourceId}->${e.targetId}`}
            x1={e.sourceX}
            y1={e.sourceY}
            x2={e.targetX}
            y2={e.targetY}
            stroke="var(--edge-idle)"
            strokeWidth={2 / s}
          />
        ))}
        {layout.nodes.map((n) => (
          <circle key={n.id} cx={n.x} cy={n.y} r={3 / s} fill="var(--text-dim)" />
        ))}
        {currentLayoutPoint && (
          <circle
            cx={currentLayoutPoint.x}
            cy={currentLayoutPoint.y}
            r={5 / s}
            fill="var(--edge-trail)"
          />
        )}
        <rect
          x={rectLayout.x}
          y={rectLayout.y}
          width={rectLayout.width}
          height={rectLayout.height}
          fill="none"
          stroke="var(--edge-trail)"
          strokeOpacity={0.6}
          strokeWidth={2 / s}
        />
      </g>
    </svg>
  );
}
```

Notes:
- `onPan` and `onZoom` are required props; existing callers must pass them.
- The wheel handler is attached imperatively because React's synthetic `onWheel` cannot be non-passive in all browsers; we need `preventDefault()` to stop the page or canvas from scrolling.
- `draggedRef` suppresses the synthetic `click` that fires after pointer-up — the existing `onClick` would otherwise jump the camera back to the drag-release point.
- `touchAction: 'none'` keeps mobile/trackpad gestures from being interpreted as page scroll.

- [ ] **Step 2: Typecheck — this will fail because `GraphCanvas` does not yet pass `onPan` / `onZoom`. Confirm the failure message refers exactly to that.**

Run: `npm run typecheck`
Expected: FAIL with a TS2741 (or similar) at `src/components/GraphCanvas.tsx:274` saying `onPan` / `onZoom` are missing from the `<Minimap>` props.

- [ ] **Step 3: Commit (typecheck red; next task fixes it).**

```bash
git add src/components/Minimap.tsx
git commit -m "feat(minimap): add pointer-event drag and non-passive wheel handlers"
```

---

### Task C4: Wire `onPan` and `onZoom` from `GraphCanvas`

**Files:**
- Modify: `src/components/GraphCanvas.tsx`

- [ ] **Step 1: Update the `<Minimap>` JSX.**

Find the existing block at `src/components/GraphCanvas.tsx:274–280`:

```tsx
      <Minimap
        layout={layout}
        transform={transform}
        viewport={viewport}
        currentLayoutPoint={currentId ? layout.nodes.find((n) => n.id === currentId) ?? null : null}
        onJump={(pt) => centerOn(pt, transform.k)}
      />
```

Replace with:

```tsx
      <Minimap
        layout={layout}
        transform={transform}
        viewport={viewport}
        currentLayoutPoint={currentId ? layout.nodes.find((n) => n.id === currentId) ?? null : null}
        onJump={(pt) => centerOn(pt, transform.k)}
        onPan={(pt) => centerOn(pt, transform.k, { animate: false })}
        onZoom={(pt, k) => centerOn(pt, k, { animate: false })}
      />
```

- [ ] **Step 2: Typecheck.**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 3: Run unit tests.**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 4: Manually smoke-test in the dev server.**

Run: `npm run dev` and open `http://localhost:5173/`.
- Click outside the minimap viewport rect → camera jumps (existing behavior preserved).
- Click-and-drag inside the rect → camera follows the drag in real time, no animation lag.
- Scroll wheel over the minimap → camera zooms; the page doesn't scroll; the viewport rect grows when zooming in, shrinks when zooming out.
Stop the dev server.

- [ ] **Step 5: Commit.**

```bash
git add src/components/GraphCanvas.tsx
git commit -m "feat(minimap): wire onPan and onZoom to camera centerOn"
```

---

### Task C5: E2E coverage for minimap pan + wheel zoom

**Files:**
- Create: `tests/e2e/minimap-pan-zoom.spec.ts`

- [ ] **Step 1: Write the e2e test.**

Create `tests/e2e/minimap-pan-zoom.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

async function rectAttrs(page: import('@playwright/test').Page) {
  // The viewport indicator is the only <rect> with stroke=var(--edge-trail).
  return page.evaluate(() => {
    const svg = document.querySelector('[data-testid="minimap"]') as SVGSVGElement | null;
    if (!svg) throw new Error('no minimap');
    const r = svg.querySelector('rect[stroke="var(--edge-trail)"]') as SVGRectElement | null;
    if (!r) throw new Error('no viewport rect');
    const w = parseFloat(r.getAttribute('width') ?? '0');
    const h = parseFloat(r.getAttribute('height') ?? '0');
    const x = parseFloat(r.getAttribute('x') ?? '0');
    const y = parseFloat(r.getAttribute('y') ?? '0');
    return { x, y, w, h };
  });
}

test('minimap wheel zoom shrinks the viewport rect', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  const minimap = page.getByTestId('minimap');
  await expect(minimap).toBeVisible();

  const before = await rectAttrs(page);

  const box = await minimap.boundingBox();
  if (!box) throw new Error('no minimap bbox');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -600); // zoom in
  await page.waitForTimeout(150);

  const after = await rectAttrs(page);
  // Zooming in raises k; viewport rect (vw / k) shrinks.
  expect(after.w).toBeLessThan(before.w);
  expect(after.h).toBeLessThan(before.h);
});

test('minimap drag inside the viewport rect pans the camera', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  const minimap = page.getByTestId('minimap');
  await expect(minimap).toBeVisible();

  // Position cursor inside the viewport rect — at the rect's center on the
  // minimap. Compute that from current attrs.
  const start = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="minimap"]') as SVGSVGElement;
    const r = svg.querySelector('rect[stroke="var(--edge-trail)"]') as SVGRectElement;
    const g = svg.querySelector('g') as SVGGElement;
    const t = (g.getAttribute('transform') ?? '').match(/translate\(([-0-9.]+), ([-0-9.]+)\) scale\(([-0-9.]+)\)/);
    if (!t) throw new Error('no transform');
    const offX = parseFloat(t[1]); const offY = parseFloat(t[2]); const s = parseFloat(t[3]);
    const rx = parseFloat(r.getAttribute('x') ?? '0');
    const ry = parseFloat(r.getAttribute('y') ?? '0');
    const rw = parseFloat(r.getAttribute('width') ?? '0');
    const rh = parseFloat(r.getAttribute('height') ?? '0');
    const svgBox = svg.getBoundingClientRect();
    return {
      cx: svgBox.x + offX + (rx + rw / 2) * s,
      cy: svgBox.y + offY + (ry + rh / 2) * s,
    };
  });

  const rectBefore = await rectAttrs(page);

  await page.mouse.move(start.cx, start.cy);
  await page.mouse.down();
  await page.mouse.move(start.cx + 30, start.cy + 30, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  const rectAfter = await rectAttrs(page);
  // The rect's top-left position in layout space should have shifted.
  expect(Math.abs(rectAfter.x - rectBefore.x) + Math.abs(rectAfter.y - rectBefore.y)).toBeGreaterThan(1);
});

test('clicking outside the viewport rect still jumps the camera (preserved behavior)', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).click();
  const minimap = page.getByTestId('minimap');
  await expect(minimap).toBeVisible();

  const before = await rectAttrs(page);
  const box = await minimap.boundingBox();
  if (!box) throw new Error('no minimap bbox');
  // Top-left corner of the minimap is far outside the centered viewport rect.
  await page.mouse.click(box.x + 8, box.y + 8);
  await page.waitForTimeout(400);

  const after = await rectAttrs(page);
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(1);
});
```

- [ ] **Step 2: Run the e2e suite.**

Run: `npm run test:e2e`
Expected: all tests pass, including the three new `minimap-pan-zoom` cases.

- [ ] **Step 3: Commit.**

```bash
git add tests/e2e/minimap-pan-zoom.spec.ts
git commit -m "test(e2e): minimap drag pan + wheel zoom + click-to-jump"
```

---

## Final pass

### Task F1: Run the full suite and typecheck

- [ ] **Step 1: Typecheck.**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 2: Unit tests.**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 3: E2E tests.**

Run: `npm run test:e2e`
Expected: all pass.

- [ ] **Step 4: Manual smoke in the dev server.**

Run: `npm run dev`. Confirm:
1. Sidebar shows the new card style on both sessions and prompts — radial halo at rest, hover deepens border, selected shows corner brackets.
2. No `STYLE` A/B/C strip below the filter input.
3. Session items no longer show the cwd subtitle line.
4. Opening a session: top-left canvas overlay shows `SESSION xxxxxxxx` and the cwd line with a small ⧉ button. Clicking the button flashes ✓ for ~1.2s and copies the cwd.
5. Minimap: clicking outside the rect jumps the camera; click-and-drag inside the rect pans live; scroll wheel over the minimap zooms (page does not scroll).
6. `localStorage.getItem('tg.spike.itemStyle')` returns `null` after a reload (cleanup ran).

Stop the dev server.

- [ ] **Step 5: No new commit needed unless step 4 surfaced fixes. If it did, fix and amend the relevant earlier commit's follow-up — never `--amend` previous commits, always create new ones.**

---

## Self-Review Checklist (for the executing agent)

Before declaring the plan complete, confirm:

- [ ] All A/B/C / variant / STYLE strip references removed from `LibraryPanel`, `SessionsList`, `PromptsList`, `ItemShell`, `itemStyle.ts`.
- [ ] No remaining import of `setItemVariant`, `useItemVariant`, `ItemVariant`, or `readItemVariant`.
- [ ] `grep -r "tg.spike.itemStyle"` returns only the line inside `LibraryPanel.tsx` that performs the `removeItem` cleanup.
- [ ] `Minimap` no longer accepts `onJump` alone — the prop list is `onJump`, `onPan`, `onZoom` and `GraphCanvas` passes all three.
- [ ] `centerOn` callers that should remain animated (`GraphCanvas.tsx:117`, `tests/e2e/camera-preserve-on-click.spec.ts` expectations) are unchanged.
- [ ] The session header `pointerEvents: 'none'` wrapper is preserved; only the cwd row carries `pointerEvents: 'auto'`.

---

## Out-of-Scope Reminders

Per spec §non-goals: do **not** change keyboard shortcuts, the playback gutter, the detail panel, the SESSIONS/PROMPTS dropdown, filter input, or project grouping behavior. If implementing one of the tasks above tempts you to "while I'm in here, also clean up X" — resist; flag it for a follow-up plan instead.
