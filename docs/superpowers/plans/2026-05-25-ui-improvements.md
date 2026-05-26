# UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four small UI improvements: a TRON glass-cylinder scrollbar on the left panel, a `Usage` mode in the library dropdown replacing the old `TOKENS` button (with family-card filtering for Opus/Sonnet/Haiku), a 30D default time range on the Tokens page, and a higher-contrast styling for visited (success-state) nodes and their trail edges.

**Architecture:** Three orthogonal areas of change. (1) Left panel: scrollbar CSS rule + a new `LibraryMode = 'sessions' | 'prompts' | 'usage'` with a new `UsageCardsList`. (2) App-level state: `mode` and `family` lifted into `App.tsx`, persisted to localStorage; the `#/tokens` hash route is dropped in favor of `mode === 'usage'`. (3) Graph: `NodeShape` success-state colors lifted in luminance with white text; `EdgePath` done-state non-recent stroke goes mint, with a higher opacity floor.

**Tech Stack:** React 19 + TypeScript; Vite; Vitest + @testing-library/react for unit tests; Playwright for e2e. Styles are inline-React + a global `src/index.css` + CSS variables in `src/theme/tokens.css`.

---

## File Structure

**Created:**
- `src/tokens/family.ts` — pure `familyOf(modelId)` helper + `Family` type.
- `src/components/library/UsageCardsList.tsx` — fully controlled card list rendered when `mode === 'usage'`.
- `tests/unit/tokens/family.test.ts` — unit tests for `familyOf`.
- `tests/unit/components/UsageCardsList.test.tsx` — render + interaction tests.
- `tests/unit/App-mode-routing.test.tsx` — back-compat hash-shim + mode-driven page render.

**Modified:**
- `src/theme/tokens.css` — add `--tg-rail-*` CSS variables.
- `src/index.css` — add `.tg-library-scroll` scrollbar rules (Webkit + Firefox).
- `src/components/library/LibraryPanel.tsx` — controlled `mode`; new `usage` option; render `UsageCardsList`; hide filter input in usage mode; remove `TOKENS` button; add `tg-library-scroll` class.
- `src/App.tsx` — owns `mode` and `family` state with localStorage persistence and `#/tokens` shim; renders `TokensPage` when `mode === 'usage'`.
- `src/tokens/TokensPage.tsx` — new `family` prop; default preset `'30d'` persisted to `tg.usage.preset`.
- `src/components/NodeShape.tsx` — extend `tintFor` with `successFill`; `colorsFor` success returns lifted fill + `var(--text)` text; drop shimmer; reduce success stroke width 1.75 → 1.5.
- `src/components/EdgePath.tsx` — non-recent done stroke = `var(--node-success)`; opacity floor 0.18 → 0.40; mint drop-shadow on non-recent done.
- `tests/e2e/tokens-page.spec.ts` — drive via dropdown instead of `#/tokens`.

**Deleted:**
- `src/util/useHashRoute.ts`
- `tests/unit/util/useHashRoute.test.ts`

---

## Task 1: Add `familyOf` helper

**Files:**
- Create: `src/tokens/family.ts`
- Test: `tests/unit/tokens/family.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tokens/family.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { familyOf } from '../../../src/tokens/family';

describe('familyOf', () => {
  it('claude-opus-4-7 → "opus"', () => {
    expect(familyOf('claude-opus-4-7')).toBe('opus');
  });
  it('claude-sonnet-4-6 → "sonnet"', () => {
    expect(familyOf('claude-sonnet-4-6')).toBe('sonnet');
  });
  it('claude-haiku-4-5-20251001 → "haiku"', () => {
    expect(familyOf('claude-haiku-4-5-20251001')).toBe('haiku');
  });
  it('case-insensitive match', () => {
    expect(familyOf('Claude-OPUS-4-7')).toBe('opus');
  });
  it('unknown model id → null', () => {
    expect(familyOf('gpt-4o-mini')).toBe(null);
  });
  it('empty string → null', () => {
    expect(familyOf('')).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tokens/family.test.ts`

Expected: FAIL with "Cannot find module '../../../src/tokens/family'".

- [ ] **Step 3: Write minimal implementation**

Create `src/tokens/family.ts`:

```ts
export type Family = 'all' | 'opus' | 'sonnet' | 'haiku';
export type ModelFamily = Exclude<Family, 'all'>;

export function familyOf(modelId: string): ModelFamily | null {
  const m = modelId.match(/^claude-(opus|sonnet|haiku)-/i);
  return m ? (m[1].toLowerCase() as ModelFamily) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/tokens/family.test.ts`

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tokens/family.ts tests/unit/tokens/family.test.ts
git commit -m "feat(tokens): familyOf helper for model-family detection"
```

---

## Task 2: Add scrollbar CSS variables

**Files:**
- Modify: `src/theme/tokens.css`

- [ ] **Step 1: Read current tokens.css**

The file ends with `--text-dim: #4f7782;` inside `:root { ... }`. The new vars go inside that same block.

- [ ] **Step 2: Add four new tokens**

In `src/theme/tokens.css`, inside the existing `:root { ... }` block, add the following four lines immediately before the closing brace:

```css
  --tg-rail-bg-edge: rgba(0, 229, 255, 0.18);
  --tg-rail-bg-mid: rgba(0, 229, 255, 0.02);
  --tg-rail-thumb-dark: #003844;
  --tg-rail-thumb-bright: #5cf2ff;
```

- [ ] **Step 3: Run typecheck and tests**

Run: `npm run typecheck && npm test`

Expected: both pass — pure CSS addition, no behavior change.

- [ ] **Step 4: Commit**

```bash
git add src/theme/tokens.css
git commit -m "feat(theme): add scrollbar rail CSS variables"
```

---

## Task 3: Add TRON scrollbar styling to the library panel scroll container

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/library/LibraryPanel.tsx`

- [ ] **Step 1: Apply the new class to the scroll container in LibraryPanel.tsx**

Locate the `<div style={styles.scroll}>` line (around line 258 in the file as it stands today). Replace that opening tag with one that adds a `className`:

```tsx
<div className="tg-library-scroll" style={styles.scroll}>
```

(Keep the surrounding code identical. The `styles.scroll` block can stay as it is — it provides layout; the new className provides scrollbar styling.)

- [ ] **Step 2: Append scrollbar CSS rules to `src/index.css`**

Append the following block to the end of `src/index.css`:

```css
/* TRON glass-cylinder scrollbar for the left library panel.
   Width 6px; horizontal radial gradient gives the thumb a curved-tube look. */
.tg-library-scroll::-webkit-scrollbar {
  width: 6px;
}
.tg-library-scroll::-webkit-scrollbar-track {
  background: linear-gradient(
    90deg,
    var(--tg-rail-bg-edge),
    var(--tg-rail-bg-mid) 50%,
    var(--tg-rail-bg-edge)
  );
  box-shadow:
    inset 1px 0 2px rgba(0, 0, 0, 0.9),
    inset -1px 0 2px rgba(0, 0, 0, 0.9);
}
.tg-library-scroll::-webkit-scrollbar-thumb {
  background: linear-gradient(
    90deg,
    var(--tg-rail-thumb-dark) 0%,
    #00b3c8 35%,
    var(--tg-rail-thumb-bright) 50%,
    #00b3c8 65%,
    var(--tg-rail-thumb-dark) 100%
  );
  border-top: 1px solid rgba(180, 250, 255, 0.6);
  border-bottom: 1px solid rgba(0, 40, 50, 0.9);
  box-shadow:
    0 0 6px rgba(0, 229, 255, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
.tg-library-scroll::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(
    90deg,
    #004c5c 0%,
    #00d6ee 35%,
    #b8faff 50%,
    #00d6ee 65%,
    #004c5c 100%
  );
  box-shadow:
    0 0 10px rgba(0, 229, 255, 0.85),
    inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

/* Firefox fallback (no per-element gradient support for scrollbars). */
.tg-library-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--tg-rail-thumb-bright) transparent;
}
```

- [ ] **Step 3: Run typecheck and unit tests**

Run: `npm run typecheck && npm test`

Expected: both pass. The class is purely additive — no test should regress.

- [ ] **Step 4: Manual smoke check (note in commit body)**

Run the dev server (`npm run dev`) and load the app in Chromium-based browsers. Verify the left panel's scrollbar shows the glass-cylinder thumb. Hover the thumb to see the brightened state. (Firefox renders only the thin/cyan thumb via the fallback — that's expected.)

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/components/library/LibraryPanel.tsx
git commit -m "feat(library): TRON glass-cylinder scrollbar on left panel"
```

---

## Task 4: Lift `LibraryMode` state into `App.tsx` (refactor only)

This task refactors the existing two-mode behavior so that `LibraryPanel` becomes fully controlled. No new mode is added yet; behavior must remain identical for sessions/prompts.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/library/LibraryPanel.tsx`

- [ ] **Step 1: Add controlled-mode props to `LibraryPanel`**

In `src/components/library/LibraryPanel.tsx`, change the `Props` type from:

```ts
type Props = {
  selected: Selection | null;
  onSelect: (s: Selection) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  width: number;
  onResize: (delta: number) => void;
};
```

to:

```ts
type Props = {
  selected: Selection | null;
  onSelect: (s: Selection) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  width: number;
  onResize: (delta: number) => void;
  mode: LibraryMode;
  onModeChange: (m: LibraryMode) => void;
};
```

Inside the component body, remove the internal `const [mode, setModeState] = useState<LibraryMode>(...)` line and the `setMode` helper. Replace them with destructured `mode` and `onModeChange` from props. The `<select onChange>` should now call `onModeChange(e.target.value as LibraryMode)`.

Also delete the now-unused `STORAGE_MODE` constant and `readMode()` function from this file — they move to App.

- [ ] **Step 2: Move mode persistence into `App.tsx`**

At the top of `src/App.tsx`, add the imports (place near other imports):

```ts
import type { LibraryMode } from './components/library/LibraryPanel';
```

Add this helper near the top of the file (above `App()`):

```ts
const STORAGE_MODE = 'tg.library.mode';

function readMode(): LibraryMode {
  try {
    const raw = localStorage.getItem(STORAGE_MODE);
    return raw === 'prompts' ? 'prompts' : 'sessions';
  } catch {
    return 'sessions';
  }
}
```

(Note: the third mode `'usage'` is added in Task 6. This step deliberately keeps the two-mode behavior identical so the refactor is safe in isolation.)

Inside `App()`, add the state and the persistence effect — placed near the other top-level state, e.g. after `const [selected, setSelected] = useState<Selection | null>(null);`:

```ts
const [mode, setMode] = useState<LibraryMode>(() => readMode());
useEffect(() => {
  try { localStorage.setItem(STORAGE_MODE, mode); } catch { /* ignore */ }
}, [mode]);
```

Then in the JSX, pass the props down. Find the `<LibraryPanel ... />` element and add:

```tsx
<LibraryPanel
  selected={selected}
  onSelect={setSelected}
  collapsed={sidebarCollapsed}
  onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
  width={sidebarWidth}
  onResize={(d) => setSidebarWidth((w) => w + d)}
  mode={mode}
  onModeChange={setMode}
/>
```

- [ ] **Step 3: Run typecheck and full tests**

Run: `npm run typecheck && npm test`

Expected: PASS. Behavior unchanged — the existing sessions/prompts dropdown still works, persistence still works. If any test about LibraryPanel sessions/prompts mode breaks, the refactor is wrong; revisit the prop wiring.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/library/LibraryPanel.tsx
git commit -m "refactor(library): lift LibraryMode into App as controlled state"
```

---

## Task 5: Lift family-card state and 30d-default preset into App

This task introduces App-owned `family` state and a persisted preset, but does not yet expose them in the UI. The UsageCardsList component (Task 6) and the TokensPage rewire (Task 7) will consume them in the next tasks.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Read current App.tsx state declarations to plan placement**

The new state goes alongside `mode` from Task 4.

- [ ] **Step 2: Add family state and persistence helper**

Near the top of `src/App.tsx` (next to the `readMode` helper from Task 4), add:

```ts
import type { Family } from './tokens/family';

const STORAGE_FAMILY = 'tg.usage.family';

function readFamily(): Family {
  try {
    const raw = localStorage.getItem(STORAGE_FAMILY);
    if (raw === 'opus' || raw === 'sonnet' || raw === 'haiku' || raw === 'all') return raw;
    return 'all';
  } catch {
    return 'all';
  }
}
```

Inside `App()`, alongside `[mode, setMode]`, add:

```ts
const [family, setFamily] = useState<Family>(() => readFamily());
useEffect(() => {
  try { localStorage.setItem(STORAGE_FAMILY, family); } catch { /* ignore */ }
}, [family]);
```

- [ ] **Step 3: Run typecheck and tests**

Run: `npm run typecheck && npm test`

Expected: PASS. The new state is declared but not yet consumed; it won't affect any existing behavior.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): own family state with localStorage persistence"
```

---

## Task 6: Build `UsageCardsList` component

**Files:**
- Create: `src/components/library/UsageCardsList.tsx`
- Test: `tests/unit/components/UsageCardsList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/UsageCardsList.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UsageCardsList } from '../../../src/components/library/UsageCardsList';
import type { TokenUsageRow } from '../../../src/api/client';

const rows: TokenUsageRow[] = [
  { projectId: 'p1', modelId: 'claude-opus-4-7',    isSubagent: false, day: '2026-05-20', input: 100, output: 50, cached: 50 },
  { projectId: 'p1', modelId: 'claude-opus-4-6',    isSubagent: false, day: '2026-05-20', input: 10,  output: 5,  cached: 5 },
  { projectId: 'p1', modelId: 'claude-sonnet-4-6',  isSubagent: false, day: '2026-05-20', input: 20,  output: 10, cached: 0 },
];

describe('UsageCardsList', () => {
  it('renders ALL plus the three families in fixed order', () => {
    render(
      <UsageCardsList
        rows={rows}
        projectId="all"
        cutoffDay="0000-01-01"
        selected="all"
        onSelect={() => {}}
      />,
    );
    const cards = screen.getAllByTestId(/^usage-card-/);
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual([
      'usage-card-all',
      'usage-card-opus',
      'usage-card-sonnet',
      'usage-card-haiku',
    ]);
  });

  it('ALL card shows total of all rows and a full bar', () => {
    render(
      <UsageCardsList
        rows={rows}
        projectId="all"
        cutoffDay="0000-01-01"
        selected="all"
        onSelect={() => {}}
      />,
    );
    const all = screen.getByTestId('usage-card-all');
    expect(all.textContent).toContain('ALL MODELS');
    // Total = 100+50+50 + 10+5+5 + 20+10+0 = 250
    expect(all.textContent).toContain('250');
    expect(all.querySelector('[data-role="bar"]')?.getAttribute('data-pct')).toBe('100');
  });

  it('Opus card lists versions descending and its share-of-spend bar pct', () => {
    render(
      <UsageCardsList
        rows={rows}
        projectId="all"
        cutoffDay="0000-01-01"
        selected="all"
        onSelect={() => {}}
      />,
    );
    const opus = screen.getByTestId('usage-card-opus');
    expect(opus.textContent).toContain('4.7 · 4.6');
    // Opus total = 220 of 250 = 88%
    expect(opus.querySelector('[data-role="bar"]')?.getAttribute('data-pct')).toBe('88');
  });

  it('Haiku card renders dimmed when there are no haiku rows', () => {
    render(
      <UsageCardsList
        rows={rows}
        projectId="all"
        cutoffDay="0000-01-01"
        selected="all"
        onSelect={() => {}}
      />,
    );
    const haiku = screen.getByTestId('usage-card-haiku');
    expect(haiku.textContent).toContain('(no data)');
    expect(haiku.getAttribute('data-empty')).toBe('true');
  });

  it('clicking a card calls onSelect with that family', () => {
    const onSelect = vi.fn();
    render(
      <UsageCardsList
        rows={rows}
        projectId="all"
        cutoffDay="0000-01-01"
        selected="all"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId('usage-card-opus'));
    expect(onSelect).toHaveBeenCalledWith('opus');
  });

  it('honors projectId and cutoffDay when computing totals', () => {
    render(
      <UsageCardsList
        rows={rows}
        projectId="p1"
        cutoffDay="2026-05-21"          // drops the 2026-05-20 rows entirely
        selected="all"
        onSelect={() => {}}
      />,
    );
    const all = screen.getByTestId('usage-card-all');
    // All rows are 2026-05-20 → filtered out → total 0
    expect(all.textContent).toContain('0');
  });

  it('marks the selected card with data-selected=true', () => {
    render(
      <UsageCardsList
        rows={rows}
        projectId="all"
        cutoffDay="0000-01-01"
        selected="opus"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByTestId('usage-card-opus').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('usage-card-all').getAttribute('data-selected')).toBe('false');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/components/UsageCardsList.test.tsx`

Expected: FAIL with "Cannot find module ... UsageCardsList".

- [ ] **Step 3: Implement the component**

Create `src/components/library/UsageCardsList.tsx`:

```tsx
import { useMemo } from 'react';
import type { TokenUsageRow } from '../../api/client';
import { familyOf, type Family, type ModelFamily } from '../../tokens/family';
import { formatTokens } from '../../util/formatTokens';

type Props = {
  rows: TokenUsageRow[];
  projectId: string | 'all';
  cutoffDay: string;
  selected: Family;
  onSelect: (f: Family) => void;
};

const FAMILIES: ModelFamily[] = ['opus', 'sonnet', 'haiku'];

function passes(row: TokenUsageRow, projectId: string | 'all', cutoffDay: string): boolean {
  if (projectId !== 'all' && row.projectId !== projectId) return false;
  if (row.day < cutoffDay) return false;
  return true;
}

function totalOf(row: TokenUsageRow): number {
  return row.input + row.output + row.cached;
}

function versionLabel(modelId: string): string | null {
  const m = modelId.match(/^claude-(?:opus|sonnet|haiku)-(\d+)-(\d+)/i);
  return m ? `${m[1]}.${m[2]}` : null;
}

export function UsageCardsList({ rows, projectId, cutoffDay, selected, onSelect }: Props) {
  const filtered = useMemo(
    () => rows.filter((r) => passes(r, projectId, cutoffDay)),
    [rows, projectId, cutoffDay],
  );

  const grandTotal = useMemo(
    () => filtered.reduce((acc, r) => acc + totalOf(r), 0),
    [filtered],
  );

  const perFamily = useMemo(() => {
    const result = new Map<ModelFamily, { total: number; versions: Set<string> }>();
    for (const r of filtered) {
      const fam = familyOf(r.modelId);
      if (!fam) continue;
      let bucket = result.get(fam);
      if (!bucket) {
        bucket = { total: 0, versions: new Set<string>() };
        result.set(fam, bucket);
      }
      bucket.total += totalOf(r);
      const v = versionLabel(r.modelId);
      if (v) bucket.versions.add(v);
    }
    return result;
  }, [filtered]);

  return (
    <div style={styles.list}>
      <Card
        kind="all"
        title="ALL"
        subtitle="ALL MODELS"
        total={grandTotal}
        pct={100}
        empty={false}
        selected={selected === 'all'}
        onClick={() => onSelect('all')}
      />
      {FAMILIES.map((fam) => {
        const bucket = perFamily.get(fam);
        const total = bucket?.total ?? 0;
        const versions = bucket
          ? [...bucket.versions].sort((a, b) => b.localeCompare(a))
          : [];
        const empty = !bucket || total === 0;
        const pct = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
        return (
          <Card
            key={fam}
            kind={fam}
            title={fam.toUpperCase()}
            subtitle={empty ? '(no data)' : versions.join(' · ')}
            total={total}
            pct={pct}
            empty={empty}
            selected={selected === fam}
            onClick={() => onSelect(fam)}
          />
        );
      })}
    </div>
  );
}

type CardProps = {
  kind: Family;
  title: string;
  subtitle: string;
  total: number;
  pct: number;
  empty: boolean;
  selected: boolean;
  onClick: () => void;
};

function Card({ kind, title, subtitle, total, pct, empty, selected, onClick }: CardProps) {
  return (
    <div
      data-testid={`usage-card-${kind}`}
      data-selected={selected ? 'true' : 'false'}
      data-empty={empty ? 'true' : 'false'}
      onClick={onClick}
      style={{
        ...styles.card,
        ...(selected ? styles.cardSelected : null),
        ...(empty ? styles.cardEmpty : null),
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <div style={styles.name}>{title}</div>
      <div style={styles.sub}>{subtitle}</div>
      <div style={styles.total}>{formatTokens(total)}</div>
      <div style={styles.barTrack}>
        <div
          data-role="bar"
          data-pct={String(pct)}
          style={{ ...styles.barFill, width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const styles = {
  list: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 6,
    padding: '0 12px 12px',
  },
  card: {
    background: 'rgba(5,8,13,0.6)',
    border: '1px solid rgba(110, 224, 238, 0.55)',
    color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
    padding: '10px 12px',
    cursor: 'pointer' as const,
    transition: 'all .12s ease',
  },
  cardSelected: {
    background: 'rgba(0,229,255,0.10)',
    borderColor: 'var(--edge-trail)',
    boxShadow: '0 0 12px rgba(0,229,255,0.25)',
  },
  cardEmpty: {
    opacity: 0.55,
  },
  name: { fontSize: 11, letterSpacing: 3, color: 'var(--edge-trail)' },
  sub: { fontSize: 10, letterSpacing: 1, color: 'var(--text-dim)', marginTop: 2 },
  total: { fontSize: 14, letterSpacing: 1, color: 'var(--text)', marginTop: 6 },
  barTrack: { height: 3, marginTop: 8, background: 'var(--grid)', position: 'relative' as const },
  barFill: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    background: 'var(--edge-trail)',
    boxShadow: '0 0 6px var(--edge-trail)',
  },
};
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/unit/components/UsageCardsList.test.tsx`

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/library/UsageCardsList.tsx tests/unit/components/UsageCardsList.test.tsx
git commit -m "feat(library): UsageCardsList — family filter cards with share-of-spend bars"
```

---

## Task 7: Wire `usage` mode end-to-end in LibraryPanel and App

This task adds the third option to the dropdown, hides the filter input in usage mode, removes the standalone `TOKENS` button, drops the hash route, and renders `TokensPage` when `mode === 'usage'`. It also implements the one-shot `#/tokens` shim.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/library/LibraryPanel.tsx`
- Modify: `src/tokens/TokensPage.tsx` (only to accept the new `family` prop; default preset change is in Task 8)

- [ ] **Step 1: Extend `LibraryMode` and `readMode` to recognize `usage`**

In `src/App.tsx`, update `readMode`:

```ts
function readMode(): LibraryMode {
  try {
    const raw = localStorage.getItem(STORAGE_MODE);
    if (raw === 'prompts' || raw === 'usage') return raw;
    return 'sessions';
  } catch {
    return 'sessions';
  }
}
```

In `src/components/library/LibraryPanel.tsx`, update the exported type:

```ts
export type LibraryMode = 'sessions' | 'prompts' | 'usage';
```

- [ ] **Step 2: Add the `<option value="usage">` and hide filter input in usage mode**

In `src/components/library/LibraryPanel.tsx`, locate the `<select ...>` and add the third option after `PROMPTS`:

```tsx
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
</select>
```

Then locate the `<input ... data-testid="session-filter" />` filter input and wrap it in a conditional:

```tsx
{mode !== 'usage' && (
  <input
    type="text"
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    placeholder="filter…"
    style={styles.filter}
    data-testid="session-filter"
  />
)}
```

- [ ] **Step 3: Remove the standalone `TOKENS` button and its styles**

Inside `LibraryPanel.tsx`, delete the entire `<button ... data-testid="tokens-link" ...>TOKENS</button>` block (the one between the `</span>` after the dropdown wrap and the collapse `<button>`).

Also delete `tokensLink:` and `tokensLinkOn:` entries from the `styles` object at the bottom of the file. (They are no longer referenced.)

- [ ] **Step 4: Render UsageCardsList in the usage branch**

In `LibraryPanel.tsx`, add new props to the `Props` type:

```ts
type Props = {
  selected: Selection | null;
  onSelect: (s: Selection) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  width: number;
  onResize: (delta: number) => void;
  mode: LibraryMode;
  onModeChange: (m: LibraryMode) => void;
  // Usage-mode props (consumed only when mode === 'usage')
  usageRows: TokenUsageRow[];
  usageProjectId: string | 'all';
  usageCutoffDay: string;
  usageFamily: Family;
  onUsageFamilyChange: (f: Family) => void;
};
```

Add the imports at the top of the file:

```ts
import { UsageCardsList } from './UsageCardsList';
import type { TokenUsageRow } from '../../api/client';
import type { Family } from '../../tokens/family';
```

Now locate the rendered groups list — the `<div style={styles.scroll}> {groups.map(...)} </div>` block — and wrap it so usage mode renders the cards instead:

```tsx
<div className="tg-library-scroll" style={styles.scroll}>
  {mode === 'usage' ? (
    <UsageCardsList
      rows={usageRows}
      projectId={usageProjectId}
      cutoffDay={usageCutoffDay}
      selected={usageFamily}
      onSelect={onUsageFamilyChange}
    />
  ) : (
    groups.map((g) => { /* existing content unchanged */ })
  )}
</div>
```

(Tip: leave the existing `groups.map` body completely intact — just wrap it in the conditional.)

Also: the loading / error / `(none)` headers above the scroll container should not render in usage mode. Wrap them too:

```tsx
{mode !== 'usage' && (
  <>
    {isLoading && <div style={styles.muted}>scanning…</div>}
    {error && <div style={styles.error}>error: {(error as Error).message}</div>}
    {hasData && groups.length === 0 && <div style={styles.muted}>(none)</div>}
  </>
)}
```

- [ ] **Step 5: Wire App.tsx to compute usage props and pass them down**

In `src/App.tsx`, add the imports:

```ts
import { useTokenUsage } from './api/hooks';
import { presetCutoff, type RangePreset } from './tokens/aggregate';
```

We need today's date and the current preset to compute `cutoffDay`. The preset itself lives in `TokensPage` (Task 8 changes its default to 30d). For the cards' display, we need the same cutoff. The cleanest path: lift `preset` into App too, alongside `mode` and `family`.

Add near the family state:

```ts
const STORAGE_PRESET = 'tg.usage.preset';

function readPreset(): RangePreset {
  try {
    const raw = localStorage.getItem(STORAGE_PRESET);
    if (raw === '7d' || raw === '30d' || raw === '90d' || raw === 'all') return raw;
    return '30d';
  } catch {
    return '30d';
  }
}
```

In `App()`, add:

```ts
const [preset, setPreset] = useState<RangePreset>(() => readPreset());
useEffect(() => {
  try { localStorage.setItem(STORAGE_PRESET, preset); } catch { /* ignore */ }
}, [preset]);

const usageQuery = useTokenUsage();
const usageProjectId: 'all' = 'all';            // project filter lives inside TokensPage chrome
const today = new Date().toISOString().slice(0, 10);
const usageCutoffDay = presetCutoff(preset, today);
```

(The project filter inside `TokensPage` is its own state; the cards always compute against the unfiltered project set so that the per-family totals shown on the cards reflect the whole project mix. Project-narrowing is communicated through `TokensPage` chrome and applied in its own filter pipeline. See the self-review note at the bottom — lifting project state is an optional follow-up; this plan intentionally does not change project ownership.)

Pass them to `<LibraryPanel ... />`:

```tsx
<LibraryPanel
  selected={selected}
  onSelect={setSelected}
  collapsed={sidebarCollapsed}
  onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
  width={sidebarWidth}
  onResize={(d) => setSidebarWidth((w) => w + d)}
  mode={mode}
  onModeChange={setMode}
  usageRows={usageQuery.data?.rows ?? []}
  usageProjectId={usageProjectId}
  usageCutoffDay={usageCutoffDay}
  usageFamily={family}
  onUsageFamilyChange={setFamily}
/>
```

- [ ] **Step 6: Replace the hash-route gate with a mode gate, with #/tokens shim**

Still in `src/App.tsx`:

a) Update the initial mode initializer to apply the one-shot redirect:

```ts
const [mode, setMode] = useState<LibraryMode>(() => {
  if (typeof window !== 'undefined' && window.location.hash === '#/tokens') {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return 'usage';
  }
  return readMode();
});
```

b) Remove the `const route = useHashRoute();` line and the `import { useHashRoute } from './util/useHashRoute';` line.

c) Find the JSX `{route === 'tokens' ? <TokensPage /> : (<>...</>)}` and replace `route === 'tokens'` with `mode === 'usage'`. Also pass the `family` and `preset` props (next task adds the prop types; for now pass them — they'll typecheck once Task 8 lands. To keep this commit green, see step 7):

```tsx
{mode === 'usage' ? <TokensPage family={family} preset={preset} onPresetChange={setPreset} /> : (
  /* existing graph branch unchanged */
)}
```

- [ ] **Step 7: Add a temporary pass-through in TokensPage so the new props compile**

This is a small surface-only change so that step 6c typechecks. The full behavior change happens in Task 8.

In `src/tokens/TokensPage.tsx`, change the function signature from:

```ts
export function TokensPage() {
```

to:

First add the family import alongside the existing aggregate import (which already brings in `RangePreset`):

```ts
import type { Family } from './family';
```

Then change the signature:

```ts
type Props = {
  family: Family;
  preset: RangePreset;
  onPresetChange: (p: RangePreset) => void;
};

export function TokensPage({ family, preset: presetFromApp, onPresetChange }: Props) {
```

For now keep using the internal `useState<RangePreset>('all')` line as `const [preset, setPreset] = useState<RangePreset>(presetFromApp);` and call `onPresetChange(p)` everywhere `setPreset(p)` is called. We will collapse this in Task 8.

```ts
const [preset, setPreset] = useState<RangePreset>(presetFromApp);
useEffect(() => { setPreset(presetFromApp); }, [presetFromApp]);
```

And on the chip click: replace `onClick={() => setPreset(p)}` with `onClick={() => { setPreset(p); onPresetChange(p); }}`. `family` is unused for now (intentional — it lights up in Task 8).

To silence the unused-prop warning, add `void family;` at the top of the function body — we'll delete this in Task 8.

- [ ] **Step 8: Run typecheck and full unit tests**

Run: `npm run typecheck && npm test`

Expected: PASS. The library dropdown now offers three options. Sessions/prompts still work; usage mode renders the cards. The TOKENS button is gone. `#/tokens` redirects once to usage mode.

- [ ] **Step 9: Smoke test in browser**

Run `npm run dev`. Manually verify:
- Library dropdown lists `SESSIONS / PROMPTS / USAGE`.
- Selecting USAGE shows the four cards (ALL/Opus/Sonnet/Haiku) and the main pane renders the tokens page.
- Visiting the app with `#/tokens` in the URL puts you in usage mode and the hash is cleared.
- The standalone `TOKENS` button is no longer present.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx src/components/library/LibraryPanel.tsx src/tokens/TokensPage.tsx
git commit -m "feat(library): add Usage mode; drop #/tokens route and TOKENS button"
```

---

## Task 8: Apply family filter and 30d default in TokensPage

**Files:**
- Modify: `src/tokens/TokensPage.tsx`

- [ ] **Step 1: Read the current filter pipeline**

`TokensPage` uses:

```ts
const summaries = useMemo(() => {
  if (!query.data) return [];
  const cutoff = presetCutoff(preset, today);
  return summariesPerModel(filterRows(query.data.rows, projectId, cutoff));
}, [query.data, projectId, preset, today]);
```

and passes `rows`/`projectId`/`preset` to `DailyUsageChart`. Both consumers receive the same row set; we add a family filter step before both.

- [ ] **Step 2: Replace the internal preset state with the prop**

Remove the temporary pass-through from Task 7. In `src/tokens/TokensPage.tsx`:

a) Delete `const [preset, setPreset] = useState<RangePreset>(presetFromApp);` and the `useEffect(() => setPreset(presetFromApp), [presetFromApp])`.

b) Rename the destructured prop back to the simple name and call the App callback directly:

```ts
export function TokensPage({ family, preset, onPresetChange }: Props) {
  ...
  // chip onClick:
  onClick={() => onPresetChange(p)}
```

c) Remove the `void family;` line — `family` is consumed in the next step.

- [ ] **Step 3: Apply family filter in the summaries memo**

Add the import:

```ts
import { familyOf } from './family';
```

Change the summaries memo to:

```ts
const filtered = useMemo(() => {
  if (!query.data) return [];
  const cutoff = presetCutoff(preset, today);
  const byProjectAndDate = filterRows(query.data.rows, projectId, cutoff);
  if (family === 'all') return byProjectAndDate;
  return byProjectAndDate.filter((r) => familyOf(r.modelId) === family);
}, [query.data, projectId, preset, family, today]);

const summaries = useMemo(() => summariesPerModel(filtered), [filtered]);
```

- [ ] **Step 4: Pass the filtered rows (or a family prop) to DailyUsageChart**

Two clean options. Pick (a) for the lightest diff.

(a) Pass `family` to the chart and re-filter inside it (matches the pattern that `DailyUsageChart` already does its own `filterRows` / `presetCutoff` call):

```tsx
<DailyUsageChart
  rows={query.data.rows}
  projectId={projectId}
  preset={preset}
  metric={metric}
  today={today}
  family={family}
/>
```

Then in `src/tokens/DailyUsageChart.tsx`, accept the new prop and integrate it into its existing row-filtering step. Find the line where it computes the filtered rows for stacking, and add `.filter((r) => family === 'all' ? true : familyOf(r.modelId) === family)` to that pipeline.

(b) Alternatively, restructure `TokensPage` to compute `filtered` once and pass it down. (Choose (a) — it keeps the chart's existing self-sufficient interface.)

For (a), the prop addition in `DailyUsageChart.tsx` looks like:

```ts
import { familyOf, type Family } from './family';

type Props = {
  rows: TokenUsageRow[];
  projectId: string | 'all';
  preset: RangePreset;
  metric: Metric;
  today: string;
  family: Family;
};

export function DailyUsageChart({ rows, projectId, preset, metric, today, family }: Props) {
  ...
}
```

And inside whatever memo currently does the row filtering (look for the existing `filterRows(...)` call), append the family filter:

```ts
const visibleRows = useMemo(() => {
  const cutoff = presetCutoff(preset, today);
  const base = filterRows(rows, projectId, cutoff);
  return family === 'all' ? base : base.filter((r) => familyOf(r.modelId) === family);
}, [rows, projectId, preset, today, family]);
```

- [ ] **Step 5: Write a unit test for family filtering**

Create `tests/unit/tokens/TokensPage.filter.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TokensPage } from '../../../src/tokens/TokensPage';

vi.mock('../../../src/api/hooks', () => ({
  useTokenUsage: () => ({
    data: {
      projects: [{ id: 'p1', cwd: '/repo/a' }],
      rows: [
        { projectId: 'p1', modelId: 'claude-opus-4-7',   isSubagent: false, day: '2026-05-20', input: 1, output: 1, cached: 0 },
        { projectId: 'p1', modelId: 'claude-sonnet-4-6', isSubagent: false, day: '2026-05-20', input: 1, output: 1, cached: 0 },
      ],
    },
    isLoading: false,
    error: null,
  }),
}));

function renderWithFamily(family: 'all' | 'opus' | 'sonnet' | 'haiku') {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <TokensPage family={family} preset="all" onPresetChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('TokensPage family filter', () => {
  it('shows both models when family === all', () => {
    renderWithFamily('all');
    expect(screen.queryByTestId('model-row-claude-opus-4-7')).not.toBeNull();
    expect(screen.queryByTestId('model-row-claude-sonnet-4-6')).not.toBeNull();
  });
  it('hides non-opus rows when family === opus', () => {
    renderWithFamily('opus');
    expect(screen.queryByTestId('model-row-claude-opus-4-7')).not.toBeNull();
    expect(screen.queryByTestId('model-row-claude-sonnet-4-6')).toBeNull();
  });
});
```

Run: `npm test -- tests/unit/tokens/TokensPage.filter.test.tsx`

Expected: PASS (2 tests).

- [ ] **Step 6: Run the full suite**

Run: `npm run typecheck && npm test`

Expected: PASS. (If `tokens-page.spec.ts` e2e fails because it still navigates by `#/tokens`, that's expected — fixed in Task 11.)

- [ ] **Step 7: Commit**

```bash
git add src/tokens/TokensPage.tsx src/tokens/DailyUsageChart.tsx tests/unit/tokens/TokensPage.filter.test.tsx
git commit -m "feat(tokens): apply family filter to summaries + chart; preset prop"
```

---

## Task 9: Add App-routing back-compat test

**Files:**
- Create: `tests/unit/App-mode-routing.test.tsx`

- [ ] **Step 1: Write the test**

Create `tests/unit/App-mode-routing.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../../src/App';

// Light mocks so the page doesn't try to fetch live data in jsdom.
vi.mock('../../src/api/hooks', async () => {
  const actual = await vi.importActual<object>('../../src/api/hooks');
  return {
    ...actual,
    useSessionList: () => ({ data: [], isLoading: false, error: null }),
    usePromptList:  () => ({ data: [], isLoading: false, error: null }),
    useTokenUsage:  () => ({ data: { projects: [], rows: [] }, isLoading: false, error: null }),
    useSession:     () => ({ data: null, isLoading: false, error: null }),
    isLiveMeta:     () => false,
  };
});

function renderApp() {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}><App /></QueryClientProvider>);
}

describe('App: mode-driven routing + #/tokens shim', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
  });
  afterEach(() => { window.location.hash = ''; });

  it('renders the TokensPage when localStorage mode is "usage"', () => {
    localStorage.setItem('tg.library.mode', 'usage');
    renderApp();
    expect(screen.getByTestId('tokens-page')).toBeDefined();
  });

  it('in usage mode the filter input is hidden and the family cards render', () => {
    localStorage.setItem('tg.library.mode', 'usage');
    renderApp();
    expect(screen.queryByTestId('session-filter')).toBeNull();
    expect(screen.getByTestId('usage-card-all')).toBeDefined();
    expect(screen.getByTestId('usage-card-opus')).toBeDefined();
    expect(screen.getByTestId('usage-card-sonnet')).toBeDefined();
    expect(screen.getByTestId('usage-card-haiku')).toBeDefined();
  });

  it('in sessions mode the filter input is visible and no usage cards render', () => {
    localStorage.setItem('tg.library.mode', 'sessions');
    renderApp();
    expect(screen.getByTestId('session-filter')).toBeDefined();
    expect(screen.queryByTestId('usage-card-all')).toBeNull();
  });

  it('one-shot upgrades #/tokens to usage mode and clears the hash', () => {
    window.location.hash = '#/tokens';
    renderApp();
    expect(window.location.hash).toBe('');
    expect(screen.getByTestId('tokens-page')).toBeDefined();
  });

  it('does NOT render TokensPage by default', () => {
    renderApp();
    expect(screen.queryByTestId('tokens-page')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -- tests/unit/App-mode-routing.test.tsx`

Expected: PASS (5 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/App-mode-routing.test.tsx
git commit -m "test(app): mode-driven routing + #/tokens back-compat shim"
```

---

## Task 10: Update NodeShape success-state colors

**Files:**
- Modify: `src/components/NodeShape.tsx`
- Test: `tests/unit/components/NodeShape.success.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/NodeShape.success.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { NodeShape } from '../../../src/components/NodeShape';
import type { LaidOutNode } from '../../../src/graph/layout';

function makeNode(kind: 'tool_call' | 'assistant_turn' | 'root_prompt'): LaidOutNode {
  return {
    id: 'n1',
    x: 50,
    y: 50,
    milestone: {
      id: 'n1',
      kind,
      label: 'Sample',
      timestamp: '2026-05-25T00:00:00Z',
      contextSize: 8192,
      children: [],
    } as unknown as LaidOutNode['milestone'],
  } as LaidOutNode;
}

function fillOf(svg: SVGSVGElement, kind: string): string {
  const g = svg.querySelector(`g[data-kind="${kind}"]`);
  if (!g) throw new Error(`no node group for kind=${kind}`);
  const path = g.querySelector('path');
  return path?.getAttribute('fill') ?? '';
}

describe('NodeShape success styling (P1)', () => {
  it('tool_call success uses the lifted fill #1c4a40', () => {
    const { container } = render(
      <svg>
        <NodeShape node={makeNode('tool_call')} state="success" inSubagent={false} />
      </svg>,
    );
    expect(fillOf(container.querySelector('svg')!, 'tool_call')).toBe('#1c4a40');
  });

  it('assistant_turn success uses #1a3d54', () => {
    const { container } = render(
      <svg>
        <NodeShape node={makeNode('assistant_turn')} state="success" inSubagent={false} />
      </svg>,
    );
    expect(fillOf(container.querySelector('svg')!, 'assistant_turn')).toBe('#1a3d54');
  });

  it('root_prompt success uses #1a4254', () => {
    const { container } = render(
      <svg>
        <NodeShape node={makeNode('root_prompt')} state="success" inSubagent={false} />
      </svg>,
    );
    expect(fillOf(container.querySelector('svg')!, 'root_prompt')).toBe('#1a4254');
  });

  it('success text color uses --text (not --node-success)', () => {
    const { container } = render(
      <svg>
        <NodeShape node={makeNode('tool_call')} state="success" inSubagent={false} />
      </svg>,
    );
    const text = container.querySelector('svg g[data-kind="tool_call"] text');
    expect(text?.getAttribute('fill')).toBe('var(--text)');
  });

  it('success no longer carries the tg-shimmer animation', () => {
    const { container } = render(
      <svg>
        <NodeShape node={makeNode('tool_call')} state="success" inSubagent={false} />
      </svg>,
    );
    const path = container.querySelector('svg g[data-kind="tool_call"] path');
    const style = path?.getAttribute('style') ?? '';
    expect(style).not.toContain('tg-shimmer');
  });

  it('context badge stroke matches success stroke (mint)', () => {
    const { container } = render(
      <svg>
        <NodeShape node={makeNode('tool_call')} state="success" inSubagent={false} showContextBadge />
      </svg>,
    );
    const badge = container.querySelector('[data-testid="context-badge"] rect');
    expect(badge?.getAttribute('stroke')).toBe('var(--node-success)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/components/NodeShape.success.test.tsx`

Expected: FAIL — fills still match the old dark tints (`#0f2e2a` etc.).

- [ ] **Step 3: Update `tintFor` to return `successFill`**

In `src/components/NodeShape.tsx`, replace `tintFor` with:

```ts
function tintFor(kind: MilestoneKind): { fill: string; accent: string; successFill: string } {
  // Distinct neon tints per kind, on the TRON cyan/violet/teal axis.
  // `fill` is the idle/active fallback; `successFill` is the lifted-luminance
  // post-active plate (P1) used in the `success` state of colorsFor().
  switch (kind) {
    case 'root_prompt':
    case 'user_followup':
      return { fill: '#0a2230', accent: '#5cf2ff', successFill: '#1a4254' };
    case 'tool_call':
      return { fill: '#0f2e2a', accent: '#7fffd4', successFill: '#1c4a40' };
    case 'subagent_spawn':
      return { fill: '#1a1230', accent: '#9d6cff', successFill: '#2c1f4a' };
    case 'completion':
      return { fill: '#0d2a16', accent: '#7fffd4', successFill: '#194028' };
    case 'assistant_turn':
    default:
      return { fill: '#0f2632', accent: '#5cf2ff', successFill: '#1a3d54' };
  }
}
```

- [ ] **Step 4: Update `colorsFor` success branch to use the new fill and `--text` text**

In the same file, replace the `success` case of `colorsFor`:

```ts
case 'success':
  return {
    fill: tint.successFill,
    stroke: 'var(--node-success)',
    text: 'var(--text)',
  };
```

(Note: today's code uses `subStroke` only in `idle`. Active and success keep their existing stroke-color logic; only success's stroke is `--node-success` and only the fill and text change here.)

- [ ] **Step 5: Drop the shimmer animation from success nodes**

In the same file, find the `<path … style={state === 'success' ? { animation: 'tg-shimmer 2.4s ease-in-out infinite' } : undefined} />` and change to:

```tsx
<path
  d={d}
  fill={colors.fill}
  stroke={colors.stroke}
  strokeWidth={state === 'active' ? 2 : state === 'success' ? 1.5 : 1.25}
  opacity={state === 'pruned' ? 0.35 : 0.97}
/>
```

(Both the stroke-width change from 1.75 → 1.5 AND removal of the inline `style` happen in this single edit.)

- [ ] **Step 6: Optional cleanup — search for remaining `tg-shimmer` consumers**

Run: `npm test -- --reporter=verbose` and `git grep "tg-shimmer" src`

If grep returns no matches in `src/`, you may remove the `@keyframes tg-shimmer` rule from `src/index.css` (or `src/theme/*.css`, wherever it lives). If matches remain (e.g. used by another animation pulse), leave the keyframes alone. **Important:** if uncertain, leave the keyframes in place — orphaning them is harmless; deleting one that's still referenced is not.

- [ ] **Step 7: Run all tests**

Run: `npm run typecheck && npm test`

Expected: PASS. The new NodeShape.success tests pass; no existing test regresses.

- [ ] **Step 8: Commit**

```bash
git add src/components/NodeShape.tsx tests/unit/components/NodeShape.success.test.tsx
git commit -m "feat(node): lifted success-state fill + white text; drop shimmer"
```

---

## Task 11: Update EdgePath done-trail color and opacity floor

**Files:**
- Modify: `src/components/EdgePath.tsx`
- Test: `tests/unit/components/EdgePath.done.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/EdgePath.done.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EdgePath } from '../../../src/components/EdgePath';
import type { LaidOutEdge } from '../../../src/graph/layout';

const edge: LaidOutEdge = {
  id: 'e1',
  sourceId: 's',
  targetId: 't',
  sourceX: 0,
  sourceY: 0,
  targetX: 80,
  targetY: 80,
};

function pathOf(container: HTMLElement): SVGPathElement {
  return container.querySelector('svg path') as SVGPathElement;
}

describe('EdgePath done state (trail update)', () => {
  it('recent done (freshness 1) keeps cyan stroke', () => {
    const { container } = render(
      <svg>
        <EdgePath edge={edge} state="done" progress={1} inSubagent={false} freshness={1} />
      </svg>,
    );
    expect(pathOf(container).getAttribute('stroke')).toBe('var(--edge-trail)');
  });

  it('older done (freshness 0.3) switches to mint stroke', () => {
    const { container } = render(
      <svg>
        <EdgePath edge={edge} state="done" progress={1} inSubagent={false} freshness={0.3} />
      </svg>,
    );
    expect(pathOf(container).getAttribute('stroke')).toBe('var(--node-success)');
  });

  it('older done opacity floor is at least 0.40 even at freshness 0', () => {
    const { container } = render(
      <svg>
        <EdgePath edge={edge} state="done" progress={1} inSubagent={false} freshness={0} />
      </svg>,
    );
    const op = Number(pathOf(container).getAttribute('opacity'));
    expect(op).toBeGreaterThanOrEqual(0.4);
  });

  it('drawing, idle and pruned states retain cyan stroke', () => {
    for (const state of ['drawing', 'idle', 'pruned'] as const) {
      const { container } = render(
        <svg>
          <EdgePath edge={edge} state={state} progress={0.5} inSubagent={false} freshness={1} />
        </svg>,
      );
      expect(pathOf(container).getAttribute('stroke')).toBe('var(--edge-trail)');
    }
  });

  it('subagent done edges keep subagent-accent stroke regardless of freshness', () => {
    const { container } = render(
      <svg>
        <EdgePath edge={edge} state="done" progress={1} inSubagent={true} freshness={0.2} />
      </svg>,
    );
    expect(pathOf(container).getAttribute('stroke')).toBe('var(--subagent-accent)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/components/EdgePath.done.test.tsx`

Expected: FAIL — "older done" test fails because today the stroke is always cyan for non-subagent.

- [ ] **Step 3: Update the stroke, opacity, and glow filter logic**

In `src/components/EdgePath.tsx`, change the `stroke` computation. Replace the existing single-line `const stroke = ...` with:

```ts
const isRecentDone = freshness >= 0.95;
const stroke = inSubagent
  ? 'var(--subagent-accent)'
  : (state === 'done' && !isRecentDone)
    ? 'var(--node-success)'
    : 'var(--edge-trail)';
```

(Note: today the code already declares `const isRecentDone = freshness >= 0.95;` just below the stroke. After this change, declare it ABOVE the stroke line so we can use it in that ternary; remove the duplicate declaration further down.)

Replace the `doneOpacity` computation:

```ts
const doneOpacity = isRecentDone
  ? 0.92
  : Math.max(0.40, 0.25 + 0.55 * freshness);
```

Replace the `glowFilter` block:

```ts
const glowFilter =
  state === 'drawing' ? `drop-shadow(0 0 6px var(--edge-trail))`
  : state === 'done' && isRecentDone ? `drop-shadow(0 0 4px var(--edge-trail))`
  : state === 'done' ? `drop-shadow(0 0 3px var(--node-success))`
  : state === 'idle' ? `drop-shadow(0 0 1.5px var(--edge-trail))`
  : `drop-shadow(0 0 1px rgba(255,255,255,0.08))`;
```

Stroke widths and dasharrays are not modified by this task — leave them alone.

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/unit/components/EdgePath.done.test.tsx`

Expected: all 5 tests PASS.

- [ ] **Step 5: Run full unit suite + typecheck**

Run: `npm run typecheck && npm test`

Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/components/EdgePath.tsx tests/unit/components/EdgePath.done.test.tsx
git commit -m "feat(edge): mint stroke + lifted opacity for non-recent done edges"
```

---

## Task 12: Delete useHashRoute and update e2e tokens-page test

**Files:**
- Delete: `src/util/useHashRoute.ts`
- Delete: `tests/unit/util/useHashRoute.test.ts`
- Modify: `tests/e2e/tokens-page.spec.ts`

- [ ] **Step 1: Confirm no remaining consumers**

Run: `git grep useHashRoute src`

Expected: zero matches (App.tsx import was removed in Task 7).

- [ ] **Step 2: Delete the files**

```bash
git rm src/util/useHashRoute.ts tests/unit/util/useHashRoute.test.ts
```

- [ ] **Step 3: Update the e2e test to drive via dropdown**

Edit `tests/e2e/tokens-page.spec.ts`. Replace the line:

```ts
await page.goto('/#/tokens');
```

with:

```ts
await page.goto('/');
await page.getByTestId('library-mode').selectOption('usage');
```

The rest of the test stays as-is. (The `getByTestId('tokens-page')` assertion still works because the page renders identically once mode === 'usage'.)

- [ ] **Step 4: Run typecheck and full suite**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 5: Run e2e suite locally**

Run: `npx playwright test tokens-page`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/tokens-page.spec.ts
git commit -m "chore: delete useHashRoute; drive tokens-page e2e through dropdown"
```

---

## Task 13: Final integration check

**Files:** none modified — verification only.

- [ ] **Step 1: Run full test suites**

```bash
npm run typecheck
npm test
npx playwright test
```

Expected: all green.

- [ ] **Step 2: Manual smoke walkthrough**

Run `npm run dev` and verify in a browser:

1. **Scrollbar:** With many sessions/prompts loaded, the left-panel scrollbar shows the glass-cylinder thumb. Hovering the thumb brightens it.
2. **Dropdown:** Library dropdown has SESSIONS / PROMPTS / USAGE. The standalone `TOKENS` button is gone. The filter input disappears when USAGE is selected.
3. **Cards:** USAGE shows four cards (ALL, OPUS, SONNET, HAIKU) in that order. The ALL card's bar is full; family cards show their share. Cards with no data are dimmed and show `(no data)`.
4. **Tokens page filtering:** With OPUS selected, only Opus rows appear in the top spend list and the chart only stacks Opus versions × main/sub.
5. **Default range:** Opening Usage for the first time (or after clearing `tg.usage.preset`) shows `30D` selected.
6. **Back-compat:** Open `http://localhost:5173/#/tokens` — should land in Usage mode with the hash cleared.
7. **Trail styling:** Load a session with completed playback. Visited "Glob" / "Grep" / "Decided" nodes are clearly visible with white text on a lifted teal/blue plate. The trail edges behind the playhead are mint with visible opacity; the most recent inbound edge is the bright cyan accent.
8. **Context badge:** A node with `contextSize` set still shows its token-count badge in the top-right corner; for success-state nodes the badge stroke/text is mint, matching the node stroke.

- [ ] **Step 3: Open the PR (optional — confirm with the user first per project policy)**

Do not push or open a PR without explicit user authorization. If authorized, see the project's typical PR workflow.

---

## Self-review notes

- Every step shows code/commands.
- Each task ends in a focused commit.
- TDD pattern (red → green → commit) is used everywhere a behavior changes.
- The plan touches the four spec sections directly: scrollbar (Task 3), dropdown + cards + routing (Tasks 4–9), 30D preset (Task 8), node + trail (Tasks 10–11).
- The two intentional caveats:
  - Task 7 introduces a temporary pass-through in `TokensPage` so the controlled-preset prop typechecks cleanly; Task 8 removes the temporary state and consolidates.
  - The cards in the left panel always compute totals against the unfiltered project set (whole-mix). If you'd prefer the cards to honor the project filter, lift `projectId` into App alongside `mode`/`family` and pass it down — straightforward extension that can be a follow-up if requested.