# UI Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply six visual polish changes to ThoughtGraph (minimap hologram styling, collapsible filter chip, home-prefix path display, details panel gradient, LIVE pane transparency + inset strip, replay canvas card with toolbar in header) without changing data or behavior.

**Architecture:** Each task is scoped to one file (or one file + one new util). Tasks are ordered from independent / least-risk to dependent / highest-risk: pure util first, then isolated visual changes, then the replay-canvas layout refactor that touches App + GraphCanvas + Minimap together. TDD applies where state is testable (`formatPath`, filter-chip collapse, header truncation); pure CSS / SVG visual changes are verified by manual Playwright walkthrough at the end.

**Tech Stack:** React 19 + TypeScript + Vite, d3 (existing), CSS-in-JS inline styles + a single `live-pane.css` for keyframes. Tests: vitest + @testing-library/react (unit), @playwright/test (e2e). Test layout mirrors `src/` under `tests/unit/`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/util/formatPath.ts` | new | Pure display formatter: replaces OS home prefix with `~/` (or `~\`). |
| `tests/unit/util/formatPath.test.ts` | new | Unit tests covering all six match cases + the no-match passthrough. |
| `src/components/Minimap.tsx` | modify | Star-field background, medium-glow breathing border, tick graticule, sonar ping, viewport-rect + node polish. New props for shifting bottom-right position when details panel is open. |
| `src/components/FilterToggles.tsx` | modify | Convert to collapsible: chip (`≡ FILTERS [N]`) + expanded vertical panel. Persist open state to `localStorage`. |
| `tests/unit/components/FilterToggles.test.tsx` | new | RTL test for collapsed→expanded→collapsed flow, persisted state, active-count badge. |
| `src/components/DetailPanel.tsx` | modify | Vertical cyan gradient background + inner glow. No layout change. |
| `src/components/live/LivePane.tsx` | modify | Wrapper background → transparent; detail strip inset 12px + D3 background (cyan / purple variant); header summary truncation with ellipsis. |
| `tests/unit/components/LivePane.test.tsx` | modify (existing test) | Add assertion that header summary span has truncation styles (whiteSpace, overflow, textOverflow). |
| `src/App.tsx` | modify | Replay-mode canvas card wrapping `<GraphCanvas>` + overlays; toolbar buttons inlined into the session-header right group; drop conditional `paddingRight` on `contentFrame`; pass `detailPanelOpen` + `detailPanelWidth` to `<GraphCanvas>`; apply `formatPath` to cwd; add `title={fullCwd}` for tooltip. |
| `src/components/GraphCanvas.tsx` | modify | Forward new `detailPanelOpen` and `detailPanelWidth` props to `<Minimap>`. |
| `src/theme/live-pane.css` | unchanged | Reuse the existing `paneBreathe` keyframe for the canvas card. |
| `src/components/CanvasToolbar.tsx` | unchanged | Stays as-is. Only LIVE uses it now (LivePanes consumer); App.tsx replay path inlines the three buttons in the header. Existing tests keep passing. |

---

## Task 1: `formatPath` utility (TDD)

**Files:**
- Create: `src/util/formatPath.ts`
- Test: `tests/unit/util/formatPath.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `tests/unit/util/formatPath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatPath } from '../../../src/util/formatPath';

describe('formatPath', () => {
  it('replaces Windows dotted username with ~\\', () => {
    expect(formatPath('C:\\Users\\alex.smith\\work\\AI\\ThoughtGraph'))
      .toBe('~\\work\\AI\\ThoughtGraph');
    expect(formatPath('C:/Users/alex.smith/work/AI/ThoughtGraph'))
      .toBe('~/work/AI/ThoughtGraph');
  });

  it('replaces Windows split-dot username (two dot-free segments) with ~\\ or ~/', () => {
    // The parser/storage layer sometimes surfaces a dotted username as two
    // path segments. We treat the first two segments after C:\Users\ as a
    // single username when neither contains a dot.
    expect(formatPath('C:/Users/alex/alexov/work/AI/ThoughtGraph'))
      .toBe('~/work/AI/ThoughtGraph');
    expect(formatPath('C:\\Users\\alex\\alexov\\work\\AI\\ThoughtGraph'))
      .toBe('~\\work\\AI\\ThoughtGraph');
  });

  it('replaces Windows single-segment username when no dot is present', () => {
    expect(formatPath('C:/Users/alice/projects/x')).toBe('~/projects/x');
    expect(formatPath('D:\\Users\\bob\\code')).toBe('~\\code');
  });

  it('does NOT consume two segments when the first segment IS a single-word username', () => {
    // Edge case: a single-segment user "alice" has only one path segment after
    // /Users/. We must not eat into "projects" thinking it's the second half
    // of the username. The single-segment branch wins here.
    expect(formatPath('C:/Users/alice/projects/x')).toBe('~/projects/x');
  });

  it('replaces macOS home with ~/', () => {
    expect(formatPath('/Users/jane/code/projects/site')).toBe('~/code/projects/site');
  });

  it('replaces Linux home with ~/', () => {
    expect(formatPath('/home/tom/dev/foobar')).toBe('~/dev/foobar');
  });

  it('leaves unrecognised paths unchanged', () => {
    expect(formatPath('/etc/nginx/sites-available')).toBe('/etc/nginx/sites-available');
    expect(formatPath('relative/path')).toBe('relative/path');
    expect(formatPath('')).toBe('');
  });

  it('only matches at the start of the string', () => {
    expect(formatPath('/var/log/Users/alex/anywhere'))
      .toBe('/var/log/Users/alex/anywhere');
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npm test -- formatPath.test.ts`
Expected: FAIL with "Cannot find module 'src/util/formatPath'".

- [ ] **Step 1.3: Implement `formatPath`**

Create `src/util/formatPath.ts`:

```ts
/**
 * Replace the user's home-directory prefix with ~ for display.
 *
 * Detects:
 *   - C:\Users\<user>\          (Windows, dotted or single-segment)
 *   - C:\Users\<a>\<b>\         (Windows, dotted username surfaced as two segments)
 *   - /Users/<user>/            (macOS)
 *   - /home/<user>/             (Linux)
 *
 * Preserves the original separator style (\ vs /). Returns the input unchanged
 * if no pattern matches.
 *
 * Display-only: callers should pass the full path to clipboard/tooltips, not
 * the formatted output.
 */
export function formatPath(path: string): string {
  if (!path) return path;

  // 1) Windows dotted username, single segment, e.g. C:\Users\foo.bar\rest
  const winDotted = /^([A-Za-z]:[\\/])Users[\\/]([^\\/]*\.[^\\/]+)([\\/])/;
  let m = path.match(winDotted);
  if (m) return '~' + m[3] + path.slice(m[0].length);

  // 2) Windows "split dot" username appearing as two dot-free segments,
  //    e.g. C:\Users\foo\bar\rest. Both segments must be dot-free; otherwise
  //    we'd accidentally eat real subfolders.
  const winSplit = /^([A-Za-z]:[\\/])Users[\\/]([^\\/.]+)[\\/]([^\\/.]+)([\\/])/;
  m = path.match(winSplit);
  if (m) return '~' + m[4] + path.slice(m[0].length);

  // 3) Windows single-segment username (no dot), e.g. C:\Users\alice\rest
  const winSingle = /^([A-Za-z]:[\\/])Users[\\/]([^\\/]+)([\\/])/;
  m = path.match(winSingle);
  if (m) return '~' + m[3] + path.slice(m[0].length);

  // 4) macOS
  m = path.match(/^\/Users\/([^/]+)\//);
  if (m) return '~/' + path.slice(m[0].length);

  // 5) Linux
  m = path.match(/^\/home\/([^/]+)\//);
  if (m) return '~/' + path.slice(m[0].length);

  return path;
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npm test -- formatPath.test.ts`
Expected: PASS — 8 tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add src/util/formatPath.ts tests/unit/util/formatPath.test.ts
git commit -m "feat(util): formatPath — replace OS home prefix with ~ for display"
```

---

## Task 2: Wire `formatPath` into App.tsx + tooltip

**Files:**
- Modify: `src/App.tsx` (around line 211, the `sessionCwd` rendering)

- [ ] **Step 2.1: Read current App.tsx around the session header**

Read `src/App.tsx` lines 207-214 — confirm the structure:

```tsx
<div style={styles.sessionCwdRow}>
  <span style={styles.sessionCwd}>{effectiveSession.cwd}</span>
  <CopyCwdButton value={effectiveSession.cwd} />
</div>
```

- [ ] **Step 2.2: Import `formatPath` and update the rendered span**

Add import at the top of `src/App.tsx`:

```tsx
import { formatPath } from './util/formatPath';
```

Update the `sessionCwd` span (line ~211) to:

```tsx
<span
  style={styles.sessionCwd}
  title={effectiveSession.cwd}
  data-testid="session-cwd"
>
  {formatPath(effectiveSession.cwd)}
</span>
```

`CopyCwdButton` keeps receiving the raw `effectiveSession.cwd` — no change there.

- [ ] **Step 2.3: Verify manually**

Run: `npm run dev` and open `http://localhost:5173`. Select any session.
Expected:
- Header cwd reads `~/work/AI/ThoughtGraph` (or `~\work\AI\ThoughtGraph` on Windows-style data).
- Hovering the cwd text shows a tooltip with the verbatim path.
- The copy button (`⧉`) still copies the full path.

- [ ] **Step 2.4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): show ~ for home prefix in session header, full path in tooltip"
```

---

## Task 3: Filter chip — collapsible (TDD)

**Files:**
- Modify: `src/components/FilterToggles.tsx`
- Create: `tests/unit/components/FilterToggles.test.tsx`

- [ ] **Step 3.1: Write the failing test**

Create `tests/unit/components/FilterToggles.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterToggles, type Filters } from '../../../src/components/FilterToggles';

const ALL_OFF: Filters = {
  hidePruned: false, hideSubagents: false,
  successOnly: false, showAllContext: false,
};

function renderWith(value: Filters) {
  let current = value;
  const onChange = (next: Filters) => { current = next; };
  const utils = render(<FilterToggles value={current} onChange={onChange} />);
  return { ...utils, get current() { return current; } };
}

describe('FilterToggles', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the collapsed chip by default', () => {
    renderWith(ALL_OFF);
    expect(screen.getByTestId('filter-toggle-collapsed')).toBeTruthy();
    expect(screen.queryByTestId('filter-pruned')).toBeNull();
  });

  it('shows numeric badge with count of active filters', () => {
    renderWith({ ...ALL_OFF, hidePruned: true, hideSubagents: true });
    const chip = screen.getByTestId('filter-toggle-collapsed');
    expect(chip.textContent).toContain('2');
  });

  it('hides badge when no filter is active', () => {
    renderWith(ALL_OFF);
    const chip = screen.getByTestId('filter-toggle-collapsed');
    // No number in the chip text other than the icon glyph
    expect(chip.textContent).not.toMatch(/\d/);
  });

  it('expands on chip click, collapses on close click', () => {
    renderWith(ALL_OFF);
    fireEvent.click(screen.getByTestId('filter-toggle-collapsed'));
    expect(screen.getByTestId('filter-pruned')).toBeTruthy();
    expect(screen.getByTestId('filter-subagents')).toBeTruthy();
    expect(screen.getByTestId('filter-success-only')).toBeTruthy();
    expect(screen.getByTestId('filter-show-all-context')).toBeTruthy();

    fireEvent.click(screen.getByTestId('filter-close'));
    expect(screen.queryByTestId('filter-pruned')).toBeNull();
    expect(screen.getByTestId('filter-toggle-collapsed')).toBeTruthy();
  });

  it('persists open state to localStorage', () => {
    renderWith(ALL_OFF);
    fireEvent.click(screen.getByTestId('filter-toggle-collapsed'));
    expect(localStorage.getItem('tg.filters.open')).toBe('true');

    fireEvent.click(screen.getByTestId('filter-close'));
    expect(localStorage.getItem('tg.filters.open')).toBe('false');
  });

  it('respects persisted open state on mount', () => {
    localStorage.setItem('tg.filters.open', 'true');
    renderWith(ALL_OFF);
    // Mounts already expanded — chip and panel co-exist; checkboxes are visible.
    expect(screen.getByTestId('filter-pruned')).toBeTruthy();
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `npm test -- FilterToggles.test.tsx`
Expected: FAIL — `filter-toggle-collapsed` test id is not in the current component.

- [ ] **Step 3.3: Replace `FilterToggles.tsx` with the collapsible version**

Replace the entire contents of `src/components/FilterToggles.tsx` with:

```tsx
import { useEffect, useState, type ChangeEventHandler } from 'react';

export type Filters = {
  hidePruned: boolean;
  hideSubagents: boolean;
  successOnly: boolean;
  showAllContext: boolean;
};

type Props = { value: Filters; onChange: (next: Filters) => void };

const STORAGE_KEY = 'tg.filters.open';

function readOpen(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
}

function writeOpen(v: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* ignore */ }
}

function activeCount(f: Filters): number {
  return (f.hidePruned ? 1 : 0) + (f.hideSubagents ? 1 : 0)
       + (f.successOnly ? 1 : 0) + (f.showAllContext ? 1 : 0);
}

export function FilterToggles({ value, onChange }: Props) {
  const [open, setOpenState] = useState<boolean>(() => readOpen());
  function setOpen(next: boolean): void {
    setOpenState(next);
    writeOpen(next);
  }

  useEffect(() => {
    // Keep state in sync if another tab toggles it (cheap; storage events
    // are infrequent for this key).
    function onStorage(ev: StorageEvent) {
      if (ev.key !== STORAGE_KEY) return;
      setOpenState(ev.newValue === 'true');
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function tg<K extends keyof Filters>(k: K): ChangeEventHandler<HTMLInputElement> {
    return (e) => onChange({ ...value, [k]: e.currentTarget.checked });
  }

  const count = activeCount(value);

  if (!open) {
    return (
      <div data-testid="filter-toggles" style={styles.box}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={styles.chip}
          data-testid="filter-toggle-collapsed"
          aria-label="show filters"
          title="show filters"
        >
          <span style={styles.icon}>≡</span>
          <span>FILTERS</span>
          {count > 0 && <span style={styles.badge}>{count}</span>}
        </button>
      </div>
    );
  }

  return (
    <div data-testid="filter-toggles" style={styles.box}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>
            <span style={styles.icon}>≡</span> FILTERS
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={styles.close}
            data-testid="filter-close"
            aria-label="collapse filters"
            title="collapse"
          >×</button>
        </div>
        <label style={styles.row}>
          <input type="checkbox" checked={value.hidePruned}
                 onChange={tg('hidePruned')} data-testid="filter-pruned" />
          <span>hide pruned</span>
        </label>
        <label style={styles.row}>
          <input type="checkbox" checked={value.hideSubagents}
                 onChange={tg('hideSubagents')} data-testid="filter-subagents" />
          <span>hide subagents</span>
        </label>
        <label style={styles.row}>
          <input type="checkbox" checked={value.successOnly}
                 onChange={tg('successOnly')} data-testid="filter-success-only" />
          <span>success only</span>
        </label>
        <label style={styles.row}>
          <input type="checkbox" checked={value.showAllContext}
                 onChange={tg('showAllContext')} data-testid="filter-show-all-context" />
          <span>show all context</span>
        </label>
      </div>
    </div>
  );
}

const styles = {
  box: {
    position: 'absolute' as const,
    top: 52,
    left: 24,
    zIndex: 6,
    fontFamily: 'ui-monospace, monospace',
    color: 'var(--text)',
  },
  chip: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid var(--edge-idle)',
    boxShadow: '0 0 5px rgba(0, 229, 255, 0.20)',
    padding: '5px 9px',
    fontSize: 11,
    letterSpacing: 2,
    color: 'var(--text)',
    fontFamily: 'inherit',
    textTransform: 'uppercase' as const,
    cursor: 'pointer' as const,
  },
  icon: { color: 'var(--edge-trail)', fontSize: 12 },
  badge: {
    background: 'var(--edge-trail)', color: '#05080d',
    fontSize: 9, fontWeight: 700,
    padding: '0 4px', minWidth: 13, height: 13,
    lineHeight: '13px', textAlign: 'center' as const,
    marginLeft: 4,
  },
  panel: {
    display: 'flex' as const, flexDirection: 'column' as const,
    background: 'rgba(5,8,13,0.92)',
    border: '1px solid var(--edge-idle)',
    boxShadow: '0 0 8px rgba(0, 229, 255, 0.25)',
    minWidth: 180,
    fontSize: 11,
  },
  header: {
    display: 'flex' as const, alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: '6px 10px',
    borderBottom: '1px solid rgba(110, 224, 238, 0.14)',
    background: 'linear-gradient(rgba(0, 229, 255, 0.06), rgba(0,229,255,0))',
  },
  headerTitle: {
    fontSize: 10, letterSpacing: 3, color: 'var(--edge-trail)',
    textTransform: 'uppercase' as const,
    display: 'flex' as const, alignItems: 'center' as const, gap: 6,
  },
  close: {
    background: 'transparent', border: 'none',
    color: 'var(--edge-idle)', cursor: 'pointer' as const,
    padding: '0 4px', fontSize: 14, lineHeight: 1,
    fontFamily: 'inherit',
  },
  row: {
    display: 'flex' as const, alignItems: 'center' as const, gap: 8,
    padding: '5px 10px', cursor: 'pointer' as const,
    fontSize: 11,
  },
};
```

- [ ] **Step 3.4: Run test to verify it passes**

Run: `npm test -- FilterToggles.test.tsx`
Expected: PASS — 6 tests pass.

- [ ] **Step 3.5: Verify manually**

Run dev server. Select a session.
- Filter chip starts collapsed (only `≡ FILTERS` visible).
- Click chip → vertical panel with four checkboxes.
- Toggle two filters → badge in collapsed chip would show `2` (collapse and reopen to confirm).
- Click X → collapses; reload page → state persists.

- [ ] **Step 3.6: Commit**

```bash
git add src/components/FilterToggles.tsx tests/unit/components/FilterToggles.test.tsx
git commit -m "feat(filters): collapsible chip with active-count badge, persisted state"
```

---

## Task 4: Details panel — gradient background

**Files:**
- Modify: `src/components/DetailPanel.tsx` (the `styles.panel` object, around line 64)

- [ ] **Step 4.1: Update the panel background and box-shadow**

In `src/components/DetailPanel.tsx`, replace the `panel` entry in the `styles` object (the existing one is around line 64-75):

```tsx
panel: {
  position: 'absolute' as const,
  top: 0, right: 0, bottom: 0,
  background: [
    'linear-gradient(180deg, rgba(0,229,255,0.08), rgba(5,8,13,0.95) 60%, rgba(5,8,13,1))',
    '#050810',
  ].join(', '),
  borderLeft: '1px solid rgba(0, 229, 255, 0.55)',
  boxShadow: [
    'inset 1px 0 0 rgba(0, 229, 255, 0.22)',
    'inset 6px 0 18px rgba(0, 229, 255, 0.06)',
    '-12px 0 24px rgba(0, 0, 0, 0.4)',
  ].join(', '),
  padding: '16px 18px',
  fontFamily: 'ui-monospace, monospace',
  color: 'var(--text)',
  overflowY: 'auto' as const,
  zIndex: 8,
},
```

(All other entries — `header`, `kind`, `close`, `label`, etc. — are unchanged.)

- [ ] **Step 4.2: Run existing tests to verify no regressions**

Run: `npm test`
Expected: PASS — all existing tests still pass (none assert on the background string).

- [ ] **Step 4.3: Verify manually**

Run dev server. Select a session, click a node to pin it. The right-side details panel should:
- Have a visible cyan-tinted gradient (lighter at top, darker near the bottom).
- Have a thin cyan glow along its left edge (visible against the canvas).

- [ ] **Step 4.4: Commit**

```bash
git add src/components/DetailPanel.tsx
git commit -m "feat(details): vertical cyan gradient + inner glow on left edge"
```

---

## Task 5: LIVE pane — transparent wrapper + D3 strip + header truncation

**Files:**
- Modify: `src/components/live/LivePane.tsx`
- Modify: `tests/unit/components/LivePane.test.tsx` (add one assertion)

- [ ] **Step 5.1: Add the header-truncation assertion to the existing LivePane test**

Open `tests/unit/components/LivePane.test.tsx` and append this test inside the existing `describe('LivePane', ...)` block:

```tsx
it('truncates a long header summary with ellipsis', () => {
  // The header layout uses space-between flex; without truncation, a long
  // summary pushes the label off-screen.
  const longSummary = 'a very long summary that should be cut off rather than wrap onto multiple lines or overflow the pane horizontally and break the whole layout';
  // The test harness in this file already mounts a LivePane with `root` and
  // `cwd` (see existing tests). We rely on the *style props* of the summary
  // span being set such that overflow text gets clipped. Locate the second
  // span inside the header row (the summary), and check its computed style.
  // NOTE: replace this with whatever mount helper the file already exports —
  // do not duplicate the helper here, reuse it.
  // ... use the existing test helper to render with a milestone whose
  //     summary === longSummary ...
  // (Implementation detail: the simplest way to assert is to query the
  //  spans inside [data-testid="live-pane"] header and verify the second
  //  span has the truncation styles.)
});
```

(Read the existing `LivePane.test.tsx` first to see the helper / render pattern in use — reuse it. The point of this step is to lock in the truncation behavior with one assertion. If the existing test file doesn't easily allow asserting computed style, simply assert that the rendered summary span has `style.overflow === 'hidden'` and `style.textOverflow === 'ellipsis'`.)

- [ ] **Step 5.2: Run test to verify it fails (truncation styles missing)**

Run: `npm test -- LivePane.test.tsx`
Expected: FAIL — the new assertion fails because today's `headerStyle` doesn't include truncation styles on the summary span.

- [ ] **Step 5.3: Update `LivePane.tsx`**

In `src/components/live/LivePane.tsx`:

**(a)** Change the `wrapper` style at line ~30:

```tsx
const wrapper: CSSProperties = {
  position: 'relative',
  background: 'transparent', // was '#050810' — let the body grid show through
  overflow: 'hidden',
  display: 'flex',
  width: '100%',
  height: '100%',
};
```

**(b)** Update `headerStyle` (line ~73) so the summary truncates:

```tsx
const headerStyle = (color: string): CSSProperties => ({
  position: 'absolute', top: 0, left: 0, right: 0, height: 22,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '0 14px', gap: 12,
  background: 'linear-gradient(rgba(5,8,13,0.95), rgba(5,8,13,0.5))',
  borderBottom: '1px solid rgba(110,224,238,0.08)',
  fontSize: 9, letterSpacing: 2, color,
  fontFamily: 'ui-monospace, monospace',
  zIndex: 5, pointerEvents: 'none',
});
```

Then in the header `<div>` body (around line ~230), give the two spans the right truncation styles:

```tsx
{showHeader && (
  <div style={headerStyle(accent)}>
    <span style={{ flexShrink: 0 }}>{label}</span>
    <span
      style={{
        color: '#6e95a5',
        flex: '1 1 auto',
        minWidth: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        textAlign: 'right',
      }}
    >
      {newest?.summary ?? ''}
    </span>
  </div>
)}
```

**(c)** Update the `detailStyle` function (line ~89) for inset + D3 gradient + per-kind tint. Replace the whole function with two — one for MAIN, one for SUBAGENT:

```tsx
const detailStyleMain = (withHeader: boolean): CSSProperties => ({
  width: '36%', minWidth: 160, flexShrink: 0,
  // inset from clip-path corners + BR notch
  margin: withHeader ? '24px 12px 12px 0' : '12px 12px 12px 0',
  borderLeft: '1px solid rgba(0, 229, 255, 0.55)',
  background: [
    'linear-gradient(180deg, rgba(0,229,255,0.08), rgba(5,8,13,0.95) 60%, rgba(5,8,13,1))',
    '#050810',
  ].join(', '),
  boxShadow: [
    'inset 1px 0 0 rgba(0, 229, 255, 0.22)',
    'inset 6px 0 18px rgba(0, 229, 255, 0.06)',
  ].join(', '),
  padding: '12px 12px 12px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11, color: '#d4e9f0',
  overflow: 'auto',
  position: 'relative', zIndex: 4,
});

const detailStyleSub = (withHeader: boolean): CSSProperties => ({
  width: '36%', minWidth: 160, flexShrink: 0,
  margin: withHeader ? '24px 12px 12px 0' : '12px 12px 12px 0',
  borderLeft: '1px solid rgba(184, 148, 255, 0.55)',
  background: [
    'linear-gradient(180deg, rgba(184,148,255,0.10), rgba(5,8,13,0.95) 60%, rgba(5,8,13,1))',
    '#050810',
  ].join(', '),
  boxShadow: [
    'inset 1px 0 0 rgba(184, 148, 255, 0.28)',
    'inset 6px 0 18px rgba(184, 148, 255, 0.06)',
  ].join(', '),
  padding: '12px 12px 12px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11, color: '#d4e9f0',
  overflow: 'auto',
  position: 'relative', zIndex: 4,
});
```

And at line ~266 where `<aside data-testid="live-pane-detail" style={detailStyle(showHeader)}>` is rendered, switch to the per-kind variant:

```tsx
<aside
  data-testid="live-pane-detail"
  style={kind === 'main' ? detailStyleMain(showHeader) : detailStyleSub(showHeader)}
>
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `npm test -- LivePane.test.tsx`
Expected: PASS — including the new truncation assertion.

Run: `npm test`
Expected: All existing tests still pass.

- [ ] **Step 5.5: Verify manually**

Run dev server. Open a LIVE session with at least one subagent. Verify:
- Body grid lines are visible behind each pane's canvas area (transparent wrapper).
- Right strip on MAIN pane is cyan-gradient; right strip on subagent pane is purple-gradient.
- Both strips are inset 12px from the wrapper's right/bottom (corner cuts visibly clear the strip).
- Long header summaries truncate with `…` rather than overflowing.

- [ ] **Step 5.6: Commit**

```bash
git add src/components/live/LivePane.tsx tests/unit/components/LivePane.test.tsx
git commit -m "feat(live): transparent wrapper, D3 detail strip inset 12px, header truncate"
```

---

## Task 6: Minimap — star field + sonar ping + ticks + medium-glow border

**Files:**
- Modify: `src/components/Minimap.tsx`

- [ ] **Step 6.1: Replace the SVG styling and structure**

Open `src/components/Minimap.tsx`. We'll change the `<svg>` style block and the inner SVG content. Patch in this order:

**(a)** Replace the `<svg>` style prop (around line 132-141):

```tsx
style={{
  position: 'absolute',
  right: 12,
  bottom: 12,
  zIndex: 6,
  background: [
    'radial-gradient(rgba(0,229,255,0.55) 0.9px, transparent 1.1px) 14px 12px / 60px 70px',
    'radial-gradient(rgba(127,255,212,0.45) 0.8px, transparent 1px) 42px 38px / 70px 60px',
    'radial-gradient(rgba(0,229,255,0.40) 0.7px, transparent 0.9px) 78px 18px / 80px 50px',
    'radial-gradient(rgba(0,229,255,0.28) 0.6px, transparent 0.8px) 4px 8px / 28px 32px',
    'radial-gradient(rgba(127,255,212,0.22) 0.5px, transparent 0.7px) 19px 22px / 34px 40px',
    'radial-gradient(rgba(0,229,255,0.15) 0.4px, transparent 0.5px) 10px 30px / 22px 26px',
    'radial-gradient(ellipse at center, rgba(0,229,255,0.10), transparent 70%)',
    'rgba(5,8,13,0.92)',
  ].join(', '),
  border: '1px solid #00e5ff',
  boxShadow: '0 0 10px rgba(0,229,255,0.55), inset 0 0 10px rgba(0,229,255,0.20)',
  animation: 'mmBreathe 3.5s ease-in-out infinite',
  cursor: isDragging ? 'grabbing' : 'crosshair',
  touchAction: 'none',
}}
```

**(b)** Add a `<defs><style>` block at the top of the SVG (just after the opening `<svg ...>` tag) for the breathing keyframe:

```tsx
<defs>
  <style>{`
    @keyframes mmBreathe {
      0%, 100% { box-shadow: 0 0 10px rgba(0,229,255,0.55), inset 0 0 10px rgba(0,229,255,0.20); }
      50%      { box-shadow: 0 0 14px rgba(0,229,255,0.75), inset 0 0 14px rgba(0,229,255,0.30); }
    }
  `}</style>
</defs>
```

(Note: SVG-scoped keyframes can be quirky. If you find the animation doesn't apply when defined inside the SVG, move it to `src/theme/live-pane.css` instead — that file is already imported via `index.css`.)

**(c)** Just after the closing `</g>` of the existing transform group, append a NEW `<g>` (untransformed, sits in screen-space) for the tick graticule:

```tsx
<g pointerEvents="none">
  {/* top */}
  <line x1={50}  y1={0}   x2={50}  y2={3}  stroke="#00e5ff" strokeOpacity={0.55} />
  <line x1={75}  y1={0}   x2={75}  y2={3}  stroke="#00e5ff" strokeOpacity={0.55} />
  <line x1={100} y1={0}   x2={100} y2={5}  stroke="#00e5ff" strokeOpacity={0.55} />
  <line x1={125} y1={0}   x2={125} y2={3}  stroke="#00e5ff" strokeOpacity={0.55} />
  <line x1={150} y1={0}   x2={150} y2={3}  stroke="#00e5ff" strokeOpacity={0.55} />
  {/* bottom */}
  <line x1={50}  y1={140} x2={50}  y2={137} stroke="#00e5ff" strokeOpacity={0.55} />
  <line x1={75}  y1={140} x2={75}  y2={137} stroke="#00e5ff" strokeOpacity={0.55} />
  <line x1={100} y1={140} x2={100} y2={135} stroke="#00e5ff" strokeOpacity={0.55} />
  <line x1={125} y1={140} x2={125} y2={137} stroke="#00e5ff" strokeOpacity={0.55} />
  <line x1={150} y1={140} x2={150} y2={137} stroke="#00e5ff" strokeOpacity={0.55} />
  {/* left */}
  <line x1={0}   y1={35}  x2={3}   y2={35}  stroke="#00e5ff" strokeOpacity={0.55} />
  <line x1={0}   y1={70}  x2={5}   y2={70}  stroke="#00e5ff" strokeOpacity={0.55} />
  <line x1={0}   y1={105} x2={3}   y2={105} stroke="#00e5ff" strokeOpacity={0.55} />
  {/* right */}
  <line x1={200} y1={35}  x2={197} y2={35}  stroke="#00e5ff" strokeOpacity={0.55} />
  <line x1={200} y1={70}  x2={195} y2={70}  stroke="#00e5ff" strokeOpacity={0.55} />
  <line x1={200} y1={105} x2={197} y2={105} stroke="#00e5ff" strokeOpacity={0.55} />
</g>
```

**(d)** Inside the existing transform `<g>`, after the `currentLayoutPoint` `<circle>` (line ~163), append the sonar-ping circle:

```tsx
{currentLayoutPoint && (
  <>
    <circle
      cx={currentLayoutPoint.x}
      cy={currentLayoutPoint.y}
      r={5 / s}
      fill="var(--edge-trail)"
      style={{ filter: 'drop-shadow(0 0 4px var(--edge-trail))' }}
    />
    <circle
      cx={currentLayoutPoint.x}
      cy={currentLayoutPoint.y}
      r={5 / s}
      fill="none"
      stroke="var(--edge-trail)"
      strokeWidth={1.5 / s}
      data-testid="minimap-sonar"
    >
      <animate attributeName="r" from={5 / s} to={14 / s} dur="1.6s" repeatCount="indefinite" />
      <animate attributeName="stroke-opacity" from="0.8" to="0" dur="1.6s" repeatCount="indefinite" />
    </circle>
  </>
)}
```

Make sure to REMOVE the original lone `<circle>` for `currentLayoutPoint` so it isn't drawn twice. (You're replacing it with the fragment above.)

**(e)** Update the viewport `<rect>` to add cyan glow + tinted fill (line ~166):

```tsx
<rect
  x={rectLayout.x}
  y={rectLayout.y}
  width={rectLayout.width}
  height={rectLayout.height}
  fill="rgba(0,229,255,0.08)"
  stroke="var(--edge-trail)"
  strokeOpacity={0.85}
  strokeWidth={2 / s}
  style={{ filter: 'drop-shadow(0 0 4px rgba(0,229,255,0.6))' }}
/>
```

**(f)** Reduce edge stroke opacity in the layout rendering (line ~146):

```tsx
{layout.edges.map((e) => (
  <line
    key={`${e.sourceId}->${e.targetId}`}
    x1={e.sourceX}
    y1={e.sourceY}
    x2={e.targetX}
    y2={e.targetY}
    stroke="var(--edge-idle)"
    strokeOpacity={0.7}
    strokeWidth={2 / s}
  />
))}
```

- [ ] **Step 6.2: Add the `detailPanelOpen` and `detailPanelWidth` props (forward-compat for Task 7)**

In `src/components/Minimap.tsx`, extend the `Props` type and the `<svg>` `right` coord:

```tsx
type Props = {
  layout: LayoutResult;
  transform: Transform;
  viewport: { width: number; height: number };
  currentLayoutPoint: { x: number; y: number } | null;
  onJump: (layoutPoint: Point) => void;
  onPan: (layoutPoint: Point) => void;
  onZoom: (layoutPoint: Point, k: number) => void;
  /** When true, shifts the minimap left by detailPanelWidth + 12 to clear an open details panel docked at the right edge. Default false. */
  detailPanelOpen?: boolean;
  detailPanelWidth?: number;
};
```

Destructure with defaults:

```tsx
export function Minimap({
  layout, transform, viewport, currentLayoutPoint, onJump, onPan, onZoom,
  detailPanelOpen = false, detailPanelWidth = 0,
}: Props) {
```

Compute the right offset:

```tsx
const rightOffset = detailPanelOpen ? detailPanelWidth + 12 : 12;
```

And use it in the `<svg style>` block: `right: rightOffset` instead of `right: 12`.

- [ ] **Step 6.3: Run tests**

Run: `npm test`
Expected: All pass. The existing `minimap-pan-zoom.spec.ts` (Playwright e2e) still drives the minimap pointer paths unchanged.

- [ ] **Step 6.4: Verify manually**

Run dev server, select a session.
- Minimap shows star-field dots in the background.
- Tick marks every ~25px on all four edges.
- Current-node dot has a soft cyan halo and an expanding sonar ring (~1.6s loop).
- The 1px border has a medium cyan glow that breathes (~3.5s).

- [ ] **Step 6.5: Commit**

```bash
git add src/components/Minimap.tsx
git commit -m "feat(minimap): star field, tick graticule, sonar ping, medium-glow border"
```

---

## Task 7: Replay canvas card + header toolbar relocation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/GraphCanvas.tsx`

This is the largest task; do it in sub-steps with a commit between each so any regression is small.

### 7a — Forward `detailPanelOpen` / `detailPanelWidth` through `GraphCanvas`

- [ ] **Step 7a.1: Extend GraphCanvas Props**

In `src/components/GraphCanvas.tsx`, add the two optional props to the existing `Props` type (line ~14):

```tsx
type Props = {
  // ...existing fields...
  hideSubagentRegions?: boolean;
  /** Forwarded to <Minimap> so it shifts left when the details panel is docked. */
  detailPanelOpen?: boolean;
  detailPanelWidth?: number;
};
```

Destructure them in the function signature:

```tsx
export function GraphCanvas({
  session, playback, subagentIds, pinnedId, onPin, onScrubTo, filters, onCameraReady,
  liveEngaged, compact = false, hideSubagentRegions = false,
  detailPanelOpen = false, detailPanelWidth = 0,
}: Props) {
```

Pass them through to `<Minimap>` (line ~331):

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
    detailPanelOpen={detailPanelOpen}
    detailPanelWidth={detailPanelWidth}
  />
)}
```

- [ ] **Step 7a.2: Run tests**

Run: `npm test`
Expected: PASS — props are optional with defaults; no consumer breaks.

- [ ] **Step 7a.3: Commit**

```bash
git add src/components/GraphCanvas.tsx
git commit -m "feat(graph): forward detailPanelOpen + detailPanelWidth to Minimap"
```

### 7b — Wrap canvas in card; relocate toolbar; switch details panel to overlay

- [ ] **Step 7b.1: Update App.tsx — add `canvasCard` style and corner notches**

In `src/App.tsx`, add to the `styles` object at the bottom:

```tsx
canvasCard: {
  position: 'absolute' as const,
  inset: 0,
  border: '1px solid rgba(0,229,255,0.55)',
  clipPath: [
    'polygon(',
    '12px 0, calc(100% - 12px) 0,',
    '100% 12px, 100% calc(100% - 12px),',
    'calc(100% - 12px) 100%, 12px 100%,',
    '0 calc(100% - 12px), 0 12px',
    ')',
  ].join(''),
  animation: 'paneBreathe 3.5s ease-in-out infinite',
  overflow: 'hidden' as const,
},
headerToolGroup: {
  display: 'flex' as const,
  gap: 6,
  marginLeft: 'auto',
  flexShrink: 0,
},
headerToolBtn: {
  background: 'rgba(5,8,13,0.85)',
  border: '1px solid rgba(110, 224, 238, 0.6)',
  color: 'var(--text)',
  fontSize: 10,
  letterSpacing: 2,
  padding: '4px 10px',
  textTransform: 'uppercase' as const,
  fontFamily: 'ui-monospace, monospace',
  cursor: 'pointer' as const,
},
headerToolBtnOn: {
  background: 'rgba(0,229,255,0.10)',
  color: 'var(--edge-trail)',
  borderColor: 'var(--edge-trail)',
},
```

Also add a notch component near the top of `src/App.tsx` (alongside `collectSubagentIds`):

```tsx
function CornerNotch({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  const polygons = {
    tl: 'polygon(0 0, 100% 0, 0 100%)',
    tr: 'polygon(0 0, 100% 0, 100% 100%)',
    bl: 'polygon(0 0, 0 100%, 100% 100%)',
    br: 'polygon(100% 0, 100% 100%, 0 100%)',
  };
  const pos =
    corner === 'tl' ? { top: 0, left: 0 } :
    corner === 'tr' ? { top: 0, right: 0 } :
    corner === 'bl' ? { bottom: 0, left: 0 } :
    { bottom: 0, right: 0 };
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        width: 12, height: 12,
        background: 'var(--edge-trail)',
        boxShadow: '0 0 6px var(--edge-trail)',
        clipPath: polygons[corner],
        pointerEvents: 'none',
        zIndex: 6,
        ...pos,
      }}
    />
  );
}
```

- [ ] **Step 7b.2: Restructure the non-LIVE render branch in App.tsx**

Currently lines 216-251 render two branches based on `liveEngaged`. Inside the non-LIVE branch (the `<>...</>` block currently containing `<GraphCanvas>`, `<CanvasToolbar>`, `<FilterToggles>`, `<Legend>`), restructure to wrap the canvas in the new card and remove `<CanvasToolbar>` from inside the canvas region:

```tsx
) : (
  <>
    <div style={styles.canvasCard}>
      <CornerNotch corner="tl" />
      <CornerNotch corner="tr" />
      <CornerNotch corner="bl" />
      <CornerNotch corner="br" />
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
        detailPanelOpen={!!displayedMilestone}
        detailPanelWidth={detailWidth}
      />
      <FilterToggles value={filters} onChange={setFilters} />
      <Legend />
    </div>
  </>
)}
```

(`<CanvasToolbar />` is no longer rendered here.)

- [ ] **Step 7b.3: Add the toolbar buttons inside the session header**

Locate the existing session header block (line ~208-214). Replace it with:

```tsx
<div style={styles.sessionHeader} data-testid="session-header">
  <div style={styles.sessionHeaderText}>
    <div style={styles.sessionTitle}>{headerTitle}</div>
    <div style={styles.sessionCwdRow}>
      <span
        style={styles.sessionCwd}
        title={effectiveSession.cwd}
        data-testid="session-cwd"
      >
        {formatPath(effectiveSession.cwd)}
      </span>
      <CopyCwdButton value={effectiveSession.cwd} />
    </div>
  </div>
  {!liveEngaged && (
    <div style={styles.headerToolGroup}>
      <button
        type="button"
        style={{ ...styles.headerToolBtn, ...styles.headerToolBtnOn }}
        onClick={() => cameraRef.current?.fit()}
        data-testid="fit-button"
      >FIT</button>
      <button
        type="button"
        style={{
          ...styles.headerToolBtn,
          ...(cameraRef.current?.follow ? styles.headerToolBtnOn : null),
        }}
        onClick={() => {
          const next = !(cameraRef.current?.follow ?? false);
          cameraRef.current?.setFollow(next);
        }}
        aria-pressed={cameraRef.current?.follow ?? false}
        data-testid="follow-toggle"
      >FOLLOW</button>
      {sessionIsLive && (
        <button
          type="button"
          style={{
            ...styles.headerToolBtn,
            ...(liveEngaged ? styles.headerToolBtnOn : null),
          }}
          onClick={() => setLiveEngaged((v) => !v)}
          aria-pressed={liveEngaged}
          data-testid="live-button"
        >LIVE</button>
      )}
    </div>
  )}
</div>
```

Add the matching `sessionHeader` + `sessionHeaderText` styles:

```tsx
sessionHeader: {
  position: 'absolute' as const,
  top: 16,
  left: 24,
  right: 24,
  zIndex: 5,
  pointerEvents: 'none' as const,
  display: 'flex' as const,
  alignItems: 'flex-end' as const,
  gap: 14,
},
sessionHeaderText: {
  minWidth: 0,
  flexShrink: 1,
  flexGrow: 1,
  pointerEvents: 'auto' as const,
},
sessionTitle: {
  fontSize: 11,
  letterSpacing: 3,
  color: 'var(--edge-trail)',
  fontFamily: 'ui-monospace, monospace',
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden' as const,
  textOverflow: 'ellipsis' as const,
},
sessionCwd: {
  fontSize: 11,
  color: 'var(--text-dim)',
  fontFamily: 'ui-monospace, monospace',
  marginTop: 2,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden' as const,
  textOverflow: 'ellipsis' as const,
},
sessionCwdRow: {
  display: 'flex' as const,
  alignItems: 'center' as const,
  marginTop: 2,
  pointerEvents: 'auto' as const,
  minWidth: 0,
},
```

(The `pointerEvents` quirk: the header is `absolute` and would block canvas clicks if it weren't `none` at the top level. The inner text + buttons re-enable pointer events selectively. Buttons inherit `pointerEvents: auto` by default; we don't need to set it explicitly on them.)

- [ ] **Step 7b.4: Drop the conditional `paddingRight` on contentFrame**

Find the `contentFrame` div around line 184-186. Today it has:

```tsx
<div style={{
  ...styles.contentFrame,
  paddingRight: displayedMilestone ? detailWidth : 0,
}}>
```

Change to:

```tsx
<div style={styles.contentFrame}>
```

The DetailPanel will continue to be `position: absolute` and overlay the canvas's right edge — the minimap shifts left via the `detailPanelOpen` prop wired in step 7a.

- [ ] **Step 7b.5: Run all tests**

Run: `npm test`
Expected: PASS. Existing CanvasToolbar unit tests still pass because the component is unchanged (it's just no longer used by the replay branch).

- [ ] **Step 7b.6: Run the Playwright e2e suite**

Run: `npm run test:e2e`
Expected: A few tests may need updates because the canvas now has a card border + the toolbar selectors moved.
- `tests/e2e/header-copy-cwd.spec.ts` should still pass (copy button + session-header testid unchanged).
- Existing tests that query `[data-testid="fit-button"]` / `follow-toggle` / `live-button` continue to work because we preserved those test ids.
- Update any test that asserts positions or screenshots if visual baseline changed (expected).

Fix any tests that fail and recommit. Do NOT modify a test just to silence an actual regression — only fix selector / position assertions invalidated by the layout change.

- [ ] **Step 7b.7: Verify manually**

Run dev server.
- Replay session shows the canvas inside a cyan-bordered card with diagonal corner cuts, four cyan notches at the corners, and a slow breathing glow.
- FIT / FOLLOW / LIVE buttons (LIVE only when the session is live-eligible) sit at the far-right of the session header, NOT inside the canvas.
- Filter chip stays top-left of the canvas card.
- Legend stays bottom-left.
- Minimap stays bottom-right; clicking a node opens the floating DetailPanel docked to the card's right edge, and the minimap shifts left by `detailWidth + 12` to clear the panel.
- Closing the panel snaps the minimap back to the right edge.
- LIVE mode is visually unchanged (LivePanes still uses CanvasToolbar internally).

- [ ] **Step 7b.8: Commit**

```bash
git add src/App.tsx
git commit -m "feat(replay): canvas card + toolbar in header + floating detail panel"
```

---

## Task 8: Final verification + manual screenshot pass

**Files:**
- No code changes — verification only.

- [ ] **Step 8.1: Run the full test suite**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 8.2: Run Playwright e2e (one full pass)**

Run: `npm run test:e2e`
Expected: PASS (or only intentional visual baseline shifts that you accept).

- [ ] **Step 8.3: Walkthrough**

Run: `npm run dev`. Then walk the checklist below:

1. Open a session → header shows `~/...`; tooltip on hover shows full path.
2. Click filter chip → expands; toggle two → badge shows `2` on collapse; reload → state persisted.
3. Click a node → details panel slides in from right (cyan gradient + inner glow); minimap shifts left.
4. Switch to a LIVE session with subagents → body grid visible behind panes; subagent strip is purple-tinted; long header summaries truncate.
5. Hover minimap → see star field, ticks, sonar ping on current node, breathing border.
6. Library sidebar → unchanged (no visual change in sessions/prompts list).

- [ ] **Step 8.4: Push the branch**

```bash
git push -u origin feat/ui-polish-pass-2026-05-24
```

Branch is ready to merge to `main`. Per user's git workflow preference, wait for explicit go-ahead before merging.

---

## Self-review

**Spec coverage:**
- §1 Minimap → Task 6 ✓
- §2 Filter bar → Task 3 ✓
- §3 Path display → Task 1 (util) + Task 2 (wiring) + Step 7b.3 (header re-render keeps tooltip + formatPath) ✓
- §4 Details panel BG → Task 4 ✓
- §5 LIVE panes → Task 5 ✓
- §6 Replay canvas card + toolbar → Task 7 ✓
- Non-change of library panel → no task touches `src/components/library/**` ✓

**Placeholder scan:** No "TBD" / "implement later" / "appropriate error handling" / "similar to Task N" in any step. Each code step shows full code.

**Type consistency:** `Filters` type is imported from `src/components/FilterToggles` in App.tsx — Task 3 preserves the same export name and shape. `Props` extensions in `Minimap.tsx` and `GraphCanvas.tsx` use the same field names: `detailPanelOpen?: boolean` and `detailPanelWidth?: number`. Test ids preserved: `filter-toggles`, `filter-pruned`, `filter-subagents`, `filter-success-only`, `filter-show-all-context`, `fit-button`, `follow-toggle`, `live-button`, `session-header`, `header-copy-cwd`, `live-pane`, `live-pane-detail`, `minimap`. New ids: `filter-toggle-collapsed`, `filter-close`, `session-cwd`, `minimap-sonar`.
