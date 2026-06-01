# Header Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `Sessions/Prompts/Usage/Memory` switcher out of the left sidebar `<select>` into four animated "chamfered-HUD" tabs centered in the app header.

**Architecture:** A new controlled `ModeSwitcher` component renders the tabs; `AppHeader` switches to a `1fr auto 1fr` grid and hosts it in the center cell (logo left, tagline right, both unchanged). Mode state stays in `App.tsx` — only the control surface moves. Tab visuals (chamfer, hover-sweep, breathing active fill) live in a new CSS file because inline style objects can't express `:hover`/`::before`/`@keyframes`.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + @testing-library/react (unit, jsdom), Playwright (e2e). Spec: `docs/superpowers/specs/2026-06-01-header-nav-design.md`.

---

## File Structure

- **Create** `src/components/ModeSwitcher.tsx` — the four tab buttons + their inline-SVG icons. One responsibility: render the mode tabs and emit `onModeChange`.
- **Create** `src/theme/header-nav.css` — `.tg-modetab` classes, keyframes, narrow-screen + reduced-motion rules.
- **Create** `tests/unit/components/ModeSwitcher.test.tsx` — unit tests for the new component.
- **Modify** `src/index.css` — `@import` the new stylesheet.
- **Modify** `src/components/AppHeader.tsx` — accept `mode`/`onModeChange`, grid layout, render `ModeSwitcher`.
- **Modify** `src/App.tsx` — pass `mode`/`onModeChange` to `AppHeader`; stop passing `onModeChange` to `LibraryPanel`.
- **Modify** `src/components/library/LibraryPanel.tsx` — remove the `<select>` and its `onModeChange` prop; right-align the collapse button.
- **Modify** `tests/unit/components/AppHeader.test.tsx` — pass the new props; assert the tabs render.
- **Modify** `tests/e2e/{prompts-mode,memory-page,memory-write,tokens-page}.spec.ts` — drive the new tabs instead of `selectOption`.

`tests/unit/App-mode-routing.test.tsx` needs **no change** (it seeds mode via `localStorage`, not the dropdown).

**Test commands:**
- Single unit file: `npx vitest run <path>` · Full unit suite: `npm test`
- Typecheck: `npm run typecheck`
- Single e2e file: `npx playwright test <path>` · Full e2e suite: `npm run test:e2e`

---

## Task 1: ModeSwitcher component

**Files:**
- Create: `tests/unit/components/ModeSwitcher.test.tsx`
- Create: `src/components/ModeSwitcher.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/ModeSwitcher.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeSwitcher } from '../../../src/components/ModeSwitcher';

describe('ModeSwitcher', () => {
  it('renders all four mode tabs in fixed order', () => {
    render(<ModeSwitcher mode="sessions" onModeChange={() => {}} />);
    const ids = screen.getAllByRole('tab').map((t) => t.getAttribute('data-testid'));
    expect(ids).toEqual([
      'mode-tab-sessions',
      'mode-tab-prompts',
      'mode-tab-usage',
      'mode-tab-memory',
    ]);
  });

  it('marks the active mode tab with aria-selected', () => {
    render(<ModeSwitcher mode="usage" onModeChange={() => {}} />);
    expect(screen.getByTestId('mode-tab-usage').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('mode-tab-sessions').getAttribute('aria-selected')).toBe('false');
  });

  it('fires onModeChange with the clicked mode', () => {
    const onModeChange = vi.fn();
    render(<ModeSwitcher mode="sessions" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByTestId('mode-tab-memory'));
    expect(onModeChange).toHaveBeenCalledWith('memory');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/components/ModeSwitcher.test.tsx`
Expected: FAIL — cannot resolve `../../../src/components/ModeSwitcher`.

- [ ] **Step 3: Write the component**

Create `src/components/ModeSwitcher.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { LibraryMode } from './library/LibraryPanel';

type Props = {
  mode: LibraryMode;
  onModeChange: (m: LibraryMode) => void;
};

function SessionsIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" aria-hidden>
      <path d="M8 2 14 5 8 8 2 5Z" />
      <path d="M2 8 8 11 14 8" />
      <path d="M2 11 8 14 14 11" />
    </svg>
  );
}

function PromptsIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 4 6.5 8 3 12" />
      <path d="M8 12 13 12" />
    </svg>
  );
}

function UsageIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
      <path d="M3 13 3 9" />
      <path d="M8 13 8 4" />
      <path d="M13 13 13 7" />
    </svg>
  );
}

function MemoryIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M6 18a4 4 0 0 1-2-.5" />
      <path d="M20 17.5a4 4 0 0 1-2 .5" />
    </svg>
  );
}

const TABS: ReadonlyArray<{ value: LibraryMode; label: string; Icon: () => ReactElement }> = [
  { value: 'sessions', label: 'Sessions', Icon: SessionsIcon },
  { value: 'prompts', label: 'Prompts', Icon: PromptsIcon },
  { value: 'usage', label: 'Usage', Icon: UsageIcon },
  { value: 'memory', label: 'Memory', Icon: MemoryIcon },
];

export function ModeSwitcher({ mode, onModeChange }: Props) {
  return (
    <nav role="tablist" aria-label="library mode" data-testid="mode-switcher" style={navStyle}>
      {TABS.map(({ value, label, Icon }) => {
        const active = value === mode;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            aria-label={label}
            title={label}
            data-testid={`mode-tab-${value}`}
            className={active ? 'tg-modetab tg-modetab--active' : 'tg-modetab'}
            onClick={() => onModeChange(value)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

const navStyle = {
  display: 'flex' as const,
  alignItems: 'center' as const,
  gap: 7,
  justifySelf: 'center' as const,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/components/ModeSwitcher.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ModeSwitcher.tsx tests/unit/components/ModeSwitcher.test.tsx
```

---

## Task 2: Tab stylesheet

**Files:**
- Create: `src/theme/header-nav.css`
- Modify: `src/index.css:1`

- [ ] **Step 1: Create the stylesheet**

Create `src/theme/header-nav.css`:

```css
/* Center-mounted mode switcher tabs (header nav).
   Inline style objects can't express :hover / ::before / ::after / @keyframes,
   so the chamfered-HUD tab look lives here. Palette matches src/theme/tokens.css. */

.tg-modetab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-dim);
  background: rgba(110, 224, 238, 0.04);
  border: 1px solid rgba(110, 224, 238, 0.22);
  padding: 7px 14px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.22s ease;
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
}

.tg-modetab svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  display: block;
}

.tg-modetab:hover {
  color: var(--text);
  border-color: var(--edge-idle);
  background: rgba(110, 224, 238, 0.08);
}

/* hover light-sweep */
.tg-modetab::after {
  content: "";
  position: absolute;
  top: 0;
  left: -120%;
  width: 60%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(0, 229, 255, 0.35), transparent);
  pointer-events: none;
}
.tg-modetab:hover::after {
  animation: tg-tab-scan 0.9s ease;
}
@keyframes tg-tab-scan {
  from { left: -120%; }
  to   { left: 160%; }
}

/* active state */
.tg-modetab--active {
  color: #04222a;
  font-weight: 700;
  border-color: var(--edge-trail);
  background: linear-gradient(180deg, #5cf2ff, #00b3c8);
  box-shadow: 0 0 14px rgba(0, 229, 255, 0.55);
  animation: tg-tab-breathe 3s ease-in-out infinite;
}
@keyframes tg-tab-breathe {
  0%, 100% { box-shadow: 0 0 12px rgba(0, 229, 255, 0.45); }
  50%      { box-shadow: 0 0 20px rgba(0, 229, 255, 0.8); }
}

/* active top scanline */
.tg-modetab--active::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: #eafdff;
  box-shadow: 0 0 8px #fff;
  pointer-events: none;
  animation: tg-tab-scanline 2.4s linear infinite;
}
@keyframes tg-tab-scanline {
  0%   { transform: translateY(0);    opacity: 0.9; }
  50%  { transform: translateY(28px); opacity: 0.2; }
  100% { transform: translateY(0);    opacity: 0.9; }
}

/* hide the tagline on narrow screens so it never collides with the centered tabs */
@media (max-width: 720px) {
  [data-testid="app-tagline"] { display: none; }
}

/* respect reduced-motion: keep the static active fill, drop looping motion */
@media (prefers-reduced-motion: reduce) {
  .tg-modetab--active { animation: none; }
  .tg-modetab--active::before { animation: none; opacity: 0.6; }
  .tg-modetab:hover::after { animation: none; }
}
```

- [ ] **Step 2: Import it from `src/index.css`**

`src/index.css` line 1 currently is:

```css
@import './theme/live-pane.css';
```

Change it to (CSS `@import` rules must stay at the top, before other rules):

```css
@import './theme/live-pane.css';
@import './theme/header-nav.css';
```

- [ ] **Step 3: Verify the unit suite still passes**

Run: `npm test`
Expected: PASS (jsdom unit tests don't load `index.css`, so this only confirms nothing regressed). Then `npm run typecheck` → no errors.

- [ ] **Step 4: Commit**

```bash
git add src/theme/header-nav.css src/index.css
```

---

## Task 3: Mount the switcher in the header

After this task the header shows the tabs **and** the sidebar dropdown still exists — both drive `setMode`, both work. The dropdown is removed in Task 5.

**Files:**
- Modify: `tests/unit/components/AppHeader.test.tsx` (full rewrite below)
- Modify: `src/components/AppHeader.tsx`
- Modify: `src/App.tsx:279`

- [ ] **Step 1: Update the AppHeader test (now expects props + tabs)**

Replace the entire contents of `tests/unit/components/AppHeader.test.tsx` with:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppHeader } from '../../../src/components/AppHeader';

describe('AppHeader', () => {
  it('renders the CLAUDEWATCH wordmark', () => {
    render(<AppHeader mode="sessions" onModeChange={() => {}} />);
    const header = screen.getByTestId('app-header');
    expect(header.textContent).toContain('CLAUDE');
    expect(header.textContent).toContain('WATCH');
  });

  it('renders the logo mark svg', () => {
    render(<AppHeader mode="sessions" onModeChange={() => {}} />);
    expect(screen.getByTestId('app-header').querySelector('svg')).not.toBeNull();
  });

  it('renders the two-tone tagline reading "watch claude think"', () => {
    render(<AppHeader mode="sessions" onModeChange={() => {}} />);
    expect(screen.getByTestId('app-tagline').textContent).toBe('watch claude think');
  });

  it('renders the four mode tabs and marks the active mode', () => {
    render(<AppHeader mode="usage" onModeChange={() => {}} />);
    expect(screen.getByTestId('mode-tab-sessions')).toBeDefined();
    expect(screen.getByTestId('mode-tab-prompts')).toBeDefined();
    expect(screen.getByTestId('mode-tab-usage')).toBeDefined();
    expect(screen.getByTestId('mode-tab-memory')).toBeDefined();
    expect(screen.getByTestId('mode-tab-usage').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('mode-tab-sessions').getAttribute('aria-selected')).toBe('false');
  });
});
```

- [ ] **Step 2: Run the AppHeader test to verify it fails**

Run: `npx vitest run tests/unit/components/AppHeader.test.tsx`
Expected: FAIL — the new "four mode tabs" test can't find `mode-tab-*` (AppHeader doesn't render them yet).

- [ ] **Step 3: Modify `src/components/AppHeader.tsx`**

Replace the file's top imports and component signature, add the `ModeSwitcher`, and change the bar to a grid. Full new file:

```tsx
import { ClaudeWatchMark } from './ClaudeWatchMark';
import { ModeSwitcher } from './ModeSwitcher';
import type { LibraryMode } from './library/LibraryPanel';

type Props = {
  mode: LibraryMode;
  onModeChange: (m: LibraryMode) => void;
};

/**
 * Full-width app header: brand lockup on the left, centered mode switcher,
 * two-tone tagline on the right. The tagline colors echo the graph's node-state
 * palette (cyan = active Claude, mint = success/thought).
 */
export function AppHeader({ mode, onModeChange }: Props) {
  return (
    <header style={styles.bar} data-testid="app-header">
      <span style={styles.brand}>
        <ClaudeWatchMark size={56} />
        <span style={styles.wordmark}>
          CLAUDE<span style={styles.accent}>WATCH</span>
        </span>
      </span>
      <ModeSwitcher mode={mode} onModeChange={onModeChange} />
      <span style={styles.tagline} data-testid="app-tagline">
        <span style={styles.tagWatch}>watch</span>{' '}
        <span style={styles.tagClaude}>claude</span>{' '}
        <span style={styles.tagThink}>think</span>
      </span>
    </header>
  );
}

const styles = {
  bar: {
    flexShrink: 0,
    height: 44,
    // The 56px logo SVG carries blank margins above/below the eye glyph; clip
    // them so the bar hugs the eye instead of the full SVG box.
    overflow: 'hidden' as const,
    display: 'grid' as const,
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center' as const,
    padding: '0 18px',
    background: 'rgba(5,8,13,0.95)',
    borderBottom: '1px solid var(--grid)',
  },
  brand: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    justifySelf: 'start' as const,
  },
  wordmark: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 14,
    letterSpacing: 3,
    color: 'var(--edge-trail)', // CLAUDE — cyan, matching the tagline "claude"
  },
  accent: { color: 'var(--node-success)' }, // WATCH — green, matching the eye
  tagline: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 10,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    justifySelf: 'end' as const,
  },
  // Two-tone tagline: "watch" stays readable-dim, "claude" cyan, "think" mint.
  tagWatch: { color: '#6e93a0' },
  tagClaude: { color: 'var(--edge-trail)' },
  tagThink: { color: 'var(--node-success)' },
};
```

- [ ] **Step 4: Wire the props in `src/App.tsx`**

`AppHeader` props are now required, so `App.tsx` must pass them or `tsc` fails. In `src/App.tsx`, line 279 currently reads:

```tsx
      <AppHeader />
```

Replace it with:

```tsx
      <AppHeader mode={mode} onModeChange={(m) => { setMode(m); setCreatingScope(null); }} />
```

(`mode`, `setMode`, and `setCreatingScope` are already in scope in `App`.) Leave the `<LibraryPanel ... onModeChange={...} />` usage untouched for now — it is removed in Task 5.

- [ ] **Step 5: Run the AppHeader test + typecheck**

Run: `npx vitest run tests/unit/components/AppHeader.test.tsx`
Expected: PASS (4 tests).
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Run the full unit suite**

Run: `npm test`
Expected: PASS — including `tests/unit/App-mode-routing.test.tsx` (it renders `<App />`, which now passes props to `AppHeader`).

- [ ] **Step 7: Commit**

```bash
git add src/components/AppHeader.tsx src/App.tsx tests/unit/components/AppHeader.test.tsx
```

---

## Task 4: Point the e2e specs at the new tabs

The tabs exist (Task 3) and the dropdown still exists, so switching the specs to the tabs keeps them green. Doing this **before** removing the dropdown keeps every commit green.

**Files:**
- Modify: `tests/e2e/prompts-mode.spec.ts`
- Modify: `tests/e2e/memory-page.spec.ts`
- Modify: `tests/e2e/memory-write.spec.ts`
- Modify: `tests/e2e/tokens-page.spec.ts`

- [ ] **Step 1: `tests/e2e/prompts-mode.spec.ts`**

Replace line 9-10:

```ts
  // Switch to Prompts mode via the dropdown.
  await page.locator('[data-testid="library-mode"]').selectOption('prompts');
```

with:

```ts
  // Switch to Prompts mode via the header tab.
  await page.getByTestId('mode-tab-prompts').click();
```

Replace line 30-32:

```ts
  // Now switch back to Sessions mode and verify the dropdown remains
  // functional and the session list reappears.
  await page.locator('[data-testid="library-mode"]').selectOption('sessions');
```

with:

```ts
  // Now switch back to Sessions mode and verify the tab remains
  // functional and the session list reappears.
  await page.getByTestId('mode-tab-sessions').click();
```

- [ ] **Step 2: `tests/e2e/memory-page.spec.ts`**

Replace both occurrences of:

```ts
  await page.getByTestId('library-mode').selectOption('memory');
```

with:

```ts
  await page.getByTestId('mode-tab-memory').click();
```

Replace:

```ts
  await expect(page.getByTestId('library-mode')).toHaveValue('sessions');
```

with:

```ts
  await expect(page.getByTestId('mode-tab-sessions')).toHaveAttribute('aria-selected', 'true');
```

- [ ] **Step 3: `tests/e2e/memory-write.spec.ts`**

Replace:

```ts
  await page.getByTestId('library-mode').selectOption('memory');
```

with:

```ts
  await page.getByTestId('mode-tab-memory').click();
```

- [ ] **Step 4: `tests/e2e/tokens-page.spec.ts`**

Replace:

```ts
  await page.getByTestId('library-mode').selectOption('usage');
```

with:

```ts
  await page.getByTestId('mode-tab-usage').click();
```

- [ ] **Step 5: Run the four e2e specs**

Run: `npx playwright test tests/e2e/prompts-mode.spec.ts tests/e2e/memory-page.spec.ts tests/e2e/memory-write.spec.ts tests/e2e/tokens-page.spec.ts`
Expected: PASS — the tabs drive mode changes; the dropdown is still present but unused.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/prompts-mode.spec.ts tests/e2e/memory-page.spec.ts tests/e2e/memory-write.spec.ts tests/e2e/tokens-page.spec.ts
```

---

## Task 5: Remove the sidebar dropdown

**Files:**
- Modify: `src/components/library/LibraryPanel.tsx`
- Modify: `src/App.tsx:289` (the `LibraryPanel` usage)

- [ ] **Step 1: Drop the `onModeChange` prop from `LibraryPanel`**

In `src/components/library/LibraryPanel.tsx`, the `Props` type (around line 19-36) contains:

```tsx
  mode: LibraryMode;
  onModeChange: (m: LibraryMode) => void;
```

Remove the `onModeChange` line, keeping `mode`:

```tsx
  mode: LibraryMode;
```

Then in the function signature (line 68), remove `onModeChange` from the destructured params:

```tsx
export function LibraryPanel({ selected, onSelect, collapsed, onToggleCollapsed, width, onResize, mode, usageRows, usageProjectId, usageCutoffDay, usageFamily, onUsageFamilyChange, onCreateMemory }: Props) {
```

- [ ] **Step 2: Remove the `<select>` from the header row**

In the same file, the expanded-state header (around line 216-238) reads:

```tsx
      <div style={styles.header}>
        <span style={styles.dropdownWrap}>
          <select
            value={mode}
            onChange={(e) => onModeChange(e.target.value as LibraryMode)}
            style={styles.dropdown}
            data-testid="library-mode"
            aria-label="library mode"
          >
            <option value="sessions">SESSIONS</option>
            <option value="prompts">PROMPTS</option>
            <option value="usage">USAGE</option>
            <option value="memory">MEMORY</option>
          </select>
        </span>
        <button
          onClick={onToggleCollapsed}
          style={styles.collapseBtn}
          aria-label="collapse sidebar"
          data-testid="sidebar-toggle"
          title="collapse (\)"
        >«</button>
      </div>
```

Replace that whole block with (collapse button only):

```tsx
      <div style={styles.header}>
        <button
          onClick={onToggleCollapsed}
          style={styles.collapseBtn}
          aria-label="collapse sidebar"
          data-testid="sidebar-toggle"
          title="collapse (\)"
        >«</button>
      </div>
```

- [ ] **Step 3: Right-align the now-single-button header row and drop dead styles**

In the `styles` object of the same file, change `header.justifyContent`:

```tsx
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px 6px',
    gap: 6,
  },
```

to:

```tsx
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '0 12px 6px',
    gap: 6,
  },
```

Then delete the now-unused `dropdownWrap` and `dropdown` style entries:

```tsx
  dropdownWrap: { position: 'relative' as const, display: 'inline-block' },
  dropdown: {
    appearance: 'none' as const,
    background: 'transparent',
    border: '1px solid var(--edge-trail)',
    color: 'var(--edge-trail)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    letterSpacing: 3,
    padding: '4px 22px 4px 8px',
    cursor: 'pointer',
    backgroundImage: 'linear-gradient(45deg, transparent 50%, var(--edge-trail) 50%), linear-gradient(135deg, var(--edge-trail) 50%, transparent 50%)',
    backgroundPosition: 'calc(100% - 11px) 50%, calc(100% - 7px) 50%',
    backgroundSize: '4px 4px',
    backgroundRepeat: 'no-repeat',
  },
```

(Leave `collapseBtn` and all other styles intact. `LibraryMode` is still imported/exported and used by the `mode` prop, so keep the import.)

- [ ] **Step 4: Stop passing `onModeChange` to `LibraryPanel` in `src/App.tsx`**

In `src/App.tsx`, the `<LibraryPanel>` usage (around line 281-296) includes:

```tsx
        mode={mode}
        onModeChange={(m) => { setMode(m); setCreatingScope(null); }}
```

Remove the `onModeChange` line, keeping `mode`:

```tsx
        mode={mode}
```

(The same logic now lives in the `AppHeader` `onModeChange` handler added in Task 3.)

- [ ] **Step 5: Typecheck + full unit suite**

Run: `npm run typecheck`
Expected: no errors (no remaining references to the removed prop or styles).
Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Run the e2e specs (dropdown now gone)**

Run: `npx playwright test tests/e2e/prompts-mode.spec.ts tests/e2e/memory-page.spec.ts tests/e2e/memory-write.spec.ts tests/e2e/tokens-page.spec.ts`
Expected: PASS — specs use the header tabs (Task 4), so removing the dropdown doesn't affect them.

- [ ] **Step 7: Commit**

```bash
git add src/components/library/LibraryPanel.tsx src/App.tsx
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Full unit suite**

Run: `npm test`
Expected: all PASS, including `ModeSwitcher`, `AppHeader`, and `App-mode-routing`.

- [ ] **Step 3: Full e2e suite**

Run: `npm run test:e2e`
Expected: all PASS. No remaining reference to `data-testid="library-mode"` anywhere:
Run: `npx grep -r "library-mode" tests src` is unnecessary — use the editor search; expect zero matches.

- [ ] **Step 4: Manual visual check**

Run: `npm run dev`, open the app, and confirm:
- The four tabs sit centered in the header; logo lockup is left and unchanged; tagline is right and unchanged.
- The active tab shows the cyan gradient fill, breathing glow, and top scanline; its icon/text are dark.
- Hovering an inactive tab brightens it and runs the light-sweep.
- Clicking each tab switches the main view (sessions list / prompts list / tokens page / memory page) exactly as before.
- The Memory tab shows the brain-outline glyph.
- Narrowing the window below ~720px hides the tagline; tabs and logo remain, no overlap.
- With OS "reduce motion" enabled, the active tab keeps its static fill but stops animating.

- [ ] **Step 5: Done**

No code changes expected in this task. If any check fails, fix in a focused follow-up commit referencing the failing item.

---

## Self-review (author's check against the spec)

- **Spec coverage:** Variant A tabs (Tasks 1-3) · icons incl. brain-outline (Task 1) · centered 3-col header, logo/tagline untouched (Task 3) · `header-nav.css` with chamfer/hover-sweep/breathing/scanline + reduced-motion (Task 2) · `LibraryPanel` dropdown removed + `App` rewired (Tasks 3, 5) · accessibility roles/aria (Task 1) · responsive tagline hide (Task 2) · test updates: 4 e2e + AppHeader + new ModeSwitcher (Tasks 1, 3, 4); `App-mode-routing` confirmed needing no change (Task 3 Step 6). All covered.
- **Placeholder scan:** none — every code/edit step shows full content.
- **Type consistency:** `LibraryMode` reused from `library/LibraryPanel` in `ModeSwitcher` and `AppHeader`; `onModeChange: (m: LibraryMode) => void` identical across `AppHeader` and the removed `LibraryPanel` prop; test ids `mode-tab-<value>` consistent between component, unit tests, and e2e.