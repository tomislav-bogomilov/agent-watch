# ClaudeWatch Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the app from ThoughtGraph to ClaudeWatch — add an "Iris Scan" logo mark with an animated radar sweep, a full-width app header, and rename the user-facing + project-metadata surfaces.

**Architecture:** Two new presentational React components — `ClaudeWatchMark` (inline SVG logo, CSS-animated sweep) and `AppHeader` (the top bar). `App.tsx`'s outer shell changes from a horizontal flex to a column: header on top, the existing `[sidebar + main]` row below. The sweep animation is a CSS keyframe in `index.css`, disabled under `prefers-reduced-motion`. Rename touches `index.html`, `package.json`, and living docs only — no code identifiers, storage keys, or the repo folder.

**Tech Stack:** React 19 + TypeScript, inline-style components (existing convention), CSS keyframes in `src/index.css`, Vitest + `@testing-library/react` (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-05-27-claudewatch-rebrand-design.md`

**Branch:** Work lands on `feat/claudewatch-rebrand` (already created and checked out). Merge to `main` only on explicit authorization.

---

### Task 1: `ClaudeWatchMark` logo component + sweep animation

The reusable Iris Scan SVG. Static layers (eye outline, pupil ring, mint blip, pupil node) plus a rotating group (sweep arm + wedge) clipped to the eye. When `animated` is true the rotating group carries the `cw-sweep` class; the keyframe + reduced-motion rule live in `index.css`.

**Files:**
- Create: `src/components/ClaudeWatchMark.tsx`
- Modify: `src/index.css` (append keyframe + reduced-motion rule)
- Test: `tests/unit/components/ClaudeWatchMark.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/components/ClaudeWatchMark.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ClaudeWatchMark } from '../../../src/components/ClaudeWatchMark';

describe('ClaudeWatchMark', () => {
  it('renders an svg at the requested size', () => {
    const { container } = render(<ClaudeWatchMark size={40} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('width')).toBe('40');
    expect(svg!.getAttribute('height')).toBe('40');
  });

  it('marks the sweep group with the cw-sweep class when animated (default)', () => {
    const { container } = render(<ClaudeWatchMark size={22} />);
    expect(container.querySelector('.cw-sweep')).not.toBeNull();
  });

  it('omits the cw-sweep class when animated={false}', () => {
    const { container } = render(<ClaudeWatchMark size={22} animated={false} />);
    expect(container.querySelector('.cw-sweep')).toBeNull();
    // The sweep arm still renders, just without the animation hook.
    expect(container.querySelector('[data-testid="cw-sweep-arm"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- ClaudeWatchMark`
Expected: FAIL — `Cannot find module '../../../src/components/ClaudeWatchMark'`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/ClaudeWatchMark.tsx
type Props = {
  /** Rendered width & height in px. */
  size?: number;
  /** When true (default), the sweep arm rotates via the `cw-sweep` CSS class. */
  animated?: boolean;
};

/**
 * "Iris Scan" mark: an eye whose pupil is a node, with a radar sweep arm that
 * rakes the iris and one mint blip caught on it. Colors come from theme tokens.
 * The sweep arm is clipped to the eye so the beam stays inside the lens as it
 * rotates. Animation (and its reduced-motion opt-out) is defined in index.css.
 */
export function ClaudeWatchMark({ size = 22, animated = true }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 0 4px rgba(0,229,255,0.55))', display: 'block' }}
    >
      <defs>
        <linearGradient id="cw-grad" x1="32" y1="32" x2="58" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--edge-trail)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--edge-trail)" stopOpacity="0" />
        </linearGradient>
        <clipPath id="cw-eye-clip">
          <path d="M5 32 Q32 8 59 32 Q32 56 5 32 Z" />
        </clipPath>
      </defs>

      {/* Static eye + pupil ring */}
      <path d="M5 32 Q32 8 59 32 Q32 56 5 32 Z" fill="none" stroke="var(--edge-trail)" strokeWidth="2" />
      <circle cx="32" cy="32" r="8.5" fill="none" stroke="var(--edge-idle)" strokeWidth="1.5" />

      {/* Rotating sweep arm, clipped to the eye */}
      <g
        data-testid="cw-sweep-arm"
        className={animated ? 'cw-sweep' : undefined}
        clipPath="url(#cw-eye-clip)"
      >
        <path d="M32 32 L58 32 A26 26 0 0 0 54 22 Z" fill="url(#cw-grad)" />
        <line x1="32" y1="32" x2="58" y2="32" stroke="var(--edge-trail)" strokeWidth="1.8" />
      </g>

      {/* Static blip + pupil node (drawn on top) */}
      <circle cx="47" cy="28" r="2.8" fill="var(--node-success)" />
      <circle cx="32" cy="32" r="3.4" fill="var(--edge-trail)" />
    </svg>
  );
}
```

- [ ] **Step 4: Append the animation CSS**

Add to the end of `src/index.css`:

```css
/* ClaudeWatch logo: the radar sweep arm rotates about the eye centre.
   transform-box: view-box makes transform-origin:center resolve to the
   SVG viewBox centre (32,32). */
@keyframes cw-sweep-rot {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.cw-sweep {
  transform-origin: center;
  transform-box: view-box;
  animation: cw-sweep-rot 6s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .cw-sweep { animation: none; }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- ClaudeWatchMark`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ClaudeWatchMark.tsx src/index.css tests/unit/components/ClaudeWatchMark.test.tsx
git commit -m "feat(brand): ClaudeWatchMark logo with animated radar sweep"
```

---

### Task 2: `AppHeader` top bar component

A full-width bar: the mark + wordmark on the left, dim tagline on the right. Presentational, no props/state. `data-testid="app-header"` for e2e.

**Files:**
- Create: `src/components/AppHeader.tsx`
- Test: `tests/unit/components/AppHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/components/AppHeader.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppHeader } from '../../../src/components/AppHeader';

describe('AppHeader', () => {
  it('renders the CLAUDEWATCH wordmark', () => {
    render(<AppHeader />);
    const header = screen.getByTestId('app-header');
    expect(header.textContent).toContain('CLAUDE');
    expect(header.textContent).toContain('WATCH');
  });

  it('renders the logo mark svg', () => {
    render(<AppHeader />);
    expect(screen.getByTestId('app-header').querySelector('svg')).not.toBeNull();
  });

  it('renders the tagline', () => {
    render(<AppHeader />);
    expect(screen.getByText('watch claude think')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- AppHeader`
Expected: FAIL — `Cannot find module '../../../src/components/AppHeader'`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/AppHeader.tsx
import { ClaudeWatchMark } from './ClaudeWatchMark';

/** Full-width app header: brand lockup on the left, dim tagline on the right. */
export function AppHeader() {
  return (
    <header style={styles.bar} data-testid="app-header">
      <span style={styles.brand}>
        <ClaudeWatchMark size={22} />
        <span style={styles.wordmark}>
          CLAUDE<span style={styles.accent}>WATCH</span>
        </span>
      </span>
      <span style={styles.tagline}>watch claude think</span>
    </header>
  );
}

const styles = {
  bar: {
    flexShrink: 0,
    height: 40,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: '0 16px',
    background: 'rgba(5,8,13,0.95)',
    borderBottom: '1px solid var(--grid)',
  },
  brand: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 9,
  },
  wordmark: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 14,
    letterSpacing: 3,
    color: 'var(--text)',
  },
  accent: { color: 'var(--edge-trail)' },
  tagline: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: 'var(--text-dim)',
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- AppHeader`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/AppHeader.tsx tests/unit/components/AppHeader.test.tsx
git commit -m "feat(brand): AppHeader top bar with logo + wordmark"
```

---

### Task 3: Wire `AppHeader` into the App shell

Restructure `App.tsx`'s outer shell from a horizontal flex into a column: `<AppHeader />` on top, the existing sidebar+main in an inner `body` row.

**Files:**
- Modify: `src/App.tsx` (import; `return` JSX wrapper; `styles.shell`; add `styles.body`)
- Test: `tests/e2e/app-header.spec.ts`

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/app-header.spec.ts
import { test, expect } from '@playwright/test';

test('app header is visible on load and shows the brand', async ({ page }) => {
  await page.goto('/');
  const header = page.getByTestId('app-header');
  await expect(header).toBeVisible();
  await expect(header).toContainText('WATCH');
});

test('header sits above the sidebar (column layout)', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.getByTestId('session-list').waitFor();
  const headerBox = await page.getByTestId('app-header').boundingBox();
  const sidebarBox = await page.getByTestId('session-list').boundingBox();
  expect(headerBox).not.toBeNull();
  expect(sidebarBox).not.toBeNull();
  // The sidebar's top edge starts at or below the header's bottom edge.
  expect(sidebarBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- app-header`
Expected: FAIL — `getByTestId('app-header')` not found / not visible.

- [ ] **Step 3: Add the import**

In `src/App.tsx`, add alongside the other component imports (near the top, after the `LivePanes` import):

```tsx
import { AppHeader } from './components/AppHeader';
```

- [ ] **Step 4: Wrap the shell in a column**

In `src/App.tsx`, the current `return` opens with:

```tsx
  return (
    <div style={styles.shell}>
      <LibraryPanel
```

Change it to insert the header and an inner `body` row that wraps both the `LibraryPanel` and `<main>`:

```tsx
  return (
    <div style={styles.shell}>
      <AppHeader />
      <div style={styles.body}>
        <LibraryPanel
```

Then find the matching close of the shell at the end of the JSX:

```tsx
      </main>
    </div>
  );
}
```

Change it to close the new `body` wrapper before the shell:

```tsx
      </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update `styles.shell` and add `styles.body`**

In `src/App.tsx`, the current style is:

```tsx
  shell: { display: 'flex', height: '100%' },
```

Replace with:

```tsx
  shell: { display: 'flex' as const, flexDirection: 'column' as const, height: '100%' },
  body: { display: 'flex' as const, flex: 1, minHeight: 0 },
```

- [ ] **Step 6: Run typecheck + e2e to verify**

Run: `npm run typecheck`
Expected: PASS (no errors).

Run: `npm run test:e2e -- app-header`
Expected: PASS (2 tests).

- [ ] **Step 7: Run the responsive-shell e2e to confirm no regression**

Run: `npm run test:e2e -- responsive-shell`
Expected: PASS (2 tests) — sidebar collapse and content centering still work under the new column layout.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx tests/e2e/app-header.spec.ts
git commit -m "feat(brand): mount AppHeader above sidebar+main (column shell)"
```

---

### Task 4: `index.html` title + favicon

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Update the title**

In `index.html`, change:

```html
    <title>Claude ThoughtGraph</title>
```

to:

```html
    <title>ClaudeWatch</title>
```

- [ ] **Step 2: Add an inline SVG favicon**

In `index.html`, add this line inside `<head>` immediately after the `<title>` line (static Iris Scan — favicons don't animate reliably):

```html
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><path d='M5 32 Q32 8 59 32 Q32 56 5 32 Z' fill='none' stroke='%2300e5ff' stroke-width='3'/><line x1='32' y1='32' x2='56' y2='28' stroke='%2300e5ff' stroke-width='3'/><circle cx='48' cy='29' r='3.5' fill='%237fffd4'/><circle cx='32' cy='32' r='5' fill='%2300e5ff'/></svg>" />
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`
Open `http://localhost:5173`. Confirm the browser tab reads **ClaudeWatch** and shows the cyan eye favicon. Stop the dev server (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(brand): ClaudeWatch title + Iris Scan favicon"
```

---

### Task 5: `package.json` project name

**Files:**
- Modify: `package.json:2`

- [ ] **Step 1: Rename the package**

In `package.json`, change:

```json
  "name": "claude-thoughtgraph",
```

to:

```json
  "name": "claudewatch",
```

- [ ] **Step 2: Verify install integrity is untouched**

Run: `npm run typecheck`
Expected: PASS. (The `name` field is metadata; no lockfile or dependency change.)

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(brand): rename package to claudewatch"
```

---

### Task 6: Rebrand living docs (README, PRD, tech docs)

Rename ThoughtGraph → ClaudeWatch in prose, headlines, and the documented dev URL/name. Do **not** touch `docs/superpowers/specs/` or `docs/superpowers/plans/` (archival), and do **not** change the `~/.claude/projects` paths or sample command output.

**Files:**
- Modify: `README.md`
- Modify: `PRD.md`
- Modify: `docs/tech_docs/USER_GUIDE.md`
- Modify: `docs/tech_docs/DEVELOPER_GUIDE.md`
- Modify: `docs/tech_docs/open_questions.md`

- [ ] **Step 1: Rewrite the README headline + intro**

In `README.md`, replace the `# ThoughtGraph` heading and the first paragraph so the product name is ClaudeWatch. Keep the existing meaning; only the product name changes. New top:

```markdown
# ClaudeWatch

Watch a Claude Code agent *think*. ClaudeWatch reads Claude Code's own session logs from
your machine and turns each session into a navigable graph: every node is a **Thought** — a
prompt, a decision, a tool call, a subagent spawn, a completion — and edges link each
Thought to the ones that followed. A glowing playhead retraces the agent's path, lighting
up the trail it took, with failures in red, abandoned branches dimmed, and the winning path
brightened. It also shows in-progress sessions live and aggregates token usage across all
your sessions.
```

- [ ] **Step 2: Sweep the remaining doc mentions**

For each of `README.md`, `PRD.md`, `docs/tech_docs/USER_GUIDE.md`, `docs/tech_docs/DEVELOPER_GUIDE.md`, `docs/tech_docs/open_questions.md`: use Grep to find every remaining branding mention, then Edit each to `ClaudeWatch`.

Run to locate them:

```bash
git grep -n "ThoughtGraph" -- README.md PRD.md docs/tech_docs/
```

Edit each match that is a **product-name** reference to `ClaudeWatch`. Leave untouched:
- Any `~/.claude/projects` or filesystem path examples.
- Any sample CLI output or code identifiers quoted in the docs.
- "Thought"/"Thoughts" node terminology (that is the node name, not the brand).

- [ ] **Step 3: Verify nothing branding-related remains**

Run: `git grep -n "ThoughtGraph" -- README.md PRD.md docs/tech_docs/`
Expected: no output, OR only lines that are genuine filesystem paths / quoted output (review each; there should be none in these files).

- [ ] **Step 4: Commit**

```bash
git add README.md PRD.md docs/tech_docs/
git commit -m "docs(brand): rebrand living docs ThoughtGraph -> ClaudeWatch"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 2: Full unit suite**

Run: `npm run test`
Expected: PASS — including the new `ClaudeWatchMark` (3) and `AppHeader` (3) tests, and the untouched `formatPath` test (its `ThoughtGraph` path fixture still passes because the repo folder was not renamed).

- [ ] **Step 3: Full e2e suite**

Run: `npm run test:e2e`
Expected: PASS — including the new `app-header` spec and the existing `responsive-shell` spec under the new column layout.

- [ ] **Step 4: Visual smoke check**

Run: `npm run dev`. Open `http://localhost:5173` in Chrome/Edge. Confirm:
- The full-width header bar shows the eye logo, `CLAUDEWATCH`, and the `watch claude think` tagline.
- The sweep arm rotates inside the eye.
- The sidebar and canvas sit below the header; nothing is clipped or overlapping.
Stop the dev server.

- [ ] **Step 5: Report completion**

Summarize what changed and confirm all suites pass. Do not merge to `main` — await explicit authorization per the project workflow.

---

## Self-Review

**Spec coverage:**
- Scope (user-facing + metadata; leave internals) → Tasks 4, 5, 6 rename only those surfaces; the doc sweep (Task 6, Step 2) explicitly excludes paths/identifiers and archival specs/plans. ✓
- `ClaudeWatchMark` (Iris Scan, animated sweep, reduced-motion, token colors) → Task 1. ✓
- Favicon from the same geometry → Task 4. ✓
- `AppHeader` (full-width, mark + wordmark, tagline) → Task 2. ✓
- Layout change (column shell) → Task 3. ✓
- Testing (AppHeader unit, ClaudeWatchMark unit, e2e header visible, no existing test changes) → Tasks 1, 2, 3; full suite in Task 7. ✓
- Non-goals (no graph/playback/theme changes, no identifier/storage/folder rename) → respected; no task touches them. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; the doc sweep (Task 6 Step 2) is a search-then-edit instruction with an explicit keep/change rule rather than a vague "rebrand everything." ✓

**Type/name consistency:** `ClaudeWatchMark` props (`size`, `animated`) used identically in Tasks 1 and 2. The `cw-sweep` class set in Task 1's component matches the keyframe class in Task 1's CSS and the test selectors. `data-testid="app-header"` matches between Task 2 (component), Task 2 (unit test), and Task 3 (e2e). `styles.body` defined in Task 3 Step 5 matches its use in Task 3 Step 4. ✓