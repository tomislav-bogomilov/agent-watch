# Header Nav — center-mounted mode switcher

**Date:** 2026-06-01
**Branch:** `feat/header-nav`
**Status:** Approved design — ready for implementation plan

## Summary

Move the library mode switcher (`Sessions / Prompts / Usage / Memory`) out of the
left sidebar `<select>` dropdown and into the **center of the app header** as four
animated "chamfered HUD" tab buttons, each with a line-icon and an animated
active/inactive state. The logo lockup stays left, the tagline stays right.

This is a presentation change only. Mode state, persistence, and routing already
live in `App.tsx` and do not move.

## Current state

- `App.tsx` owns `mode: LibraryMode` (`useState`), persists it to
  `localStorage['tg.library.mode']`, and seeds `usage` from the `#/tokens` hash.
- `LibraryPanel.tsx` renders a `<select data-testid="library-mode">` in its header
  and calls `onModeChange` on change. It also renders the sidebar collapse button.
- `AppHeader.tsx` is a presentational bar: brand lockup (`<ClaudeWatchMark size={56} />`
  + `CLAUDEWATCH` wordmark) on the left, two-tone `watch claude think` tagline on the
  right, laid out with `justify-content: space-between`. It takes no props.

## Design decisions (settled during brainstorm)

- **Variant:** "Chamfered HUD" tabs — clip-path notched buttons echoing the canvas
  frame. Chosen over a sliding-underline, a segmented capsule, and a thought-graph-node
  treatment.
- **Icons:** text **+** a 14px line-icon per mode.
  - Sessions → layers/stack
  - Prompts → prompt chevron `>` + underscore
  - Usage → bar chart
  - Memory → **brain (outline, two-hemisphere)**
- **Logo & tagline:** unchanged. `ClaudeWatchMark` is explicitly out of scope — do not
  modify it.

## Architecture

Four files change; one new component and one new stylesheet are added.

### New: `src/components/ModeSwitcher.tsx`

A presentational, controlled component — the only new logic-bearing unit.

```ts
type Props = {
  mode: LibraryMode;                 // imported from ./library/LibraryPanel
  onModeChange: (m: LibraryMode) => void;
};
```

- Renders a `<nav role="tablist" aria-label="library mode">` containing four
  `<button role="tab">` elements, one per mode, in fixed order:
  `sessions, prompts, usage, memory`.
- Each button:
  - `className="tg-modetab"` plus `tg-modetab--active` when `mode === value`.
  - `data-testid={`mode-tab-${value}`}` (drives e2e tests).
  - `aria-selected={active}` and `aria-current={active ? 'page' : undefined}`.
  - `title` / `aria-label` = the human label.
  - Children: inline `<svg aria-hidden>` icon + a `<span>` label
    (`SESSIONS` / `PROMPTS` / `USAGE` / `MEMORY`, uppercase via CSS).
  - `onClick={() => onModeChange(value)}`.
- The four icons are small inline-SVG components defined in this file (see
  "Icon set" below). Icons use `stroke="currentColor"` / `fill="currentColor"` so they
  inherit the tab's text color in both states (dim when inactive, dark `#04222a`
  on the cyan fill when active).
- Styling is entirely via the `tg-modetab` CSS classes — no inline style objects —
  because the look needs `:hover`, `::before`/`::after`, and `@keyframes`, which inline
  styles cannot express.

### Changed: `src/components/AppHeader.tsx`

- Add props `{ mode, onModeChange }` (import the `LibraryMode` type from
  `./library/LibraryPanel`) and forward them to `<ModeSwitcher>`.
- Change `styles.bar` layout from `display:flex; justify-content:space-between` to
  `display:grid; gridTemplateColumns:'1fr auto 1fr'; alignItems:center`. This pins the
  switcher dead-center regardless of the differing widths of the brand and tagline.
- Wrap the brand `<span>` with `justifySelf:'start'`, the new `<ModeSwitcher>` in the
  center cell (`justifySelf:'center'`), and the tagline with `justifySelf:'end'`.
- Keep `data-testid="app-header"` and `data-testid="app-tagline"`; keep
  `overflow:hidden` and the existing 44px height (the tabs fit: ~30px tall at 7px
  vertical padding).
- The brand lockup and tagline markup are copied verbatim — no visual change.

### Changed: `src/components/library/LibraryPanel.tsx`

- Remove the `<select>` block and its `styles.dropdown` / `styles.dropdownWrap`.
- Remove `onModeChange` from `Props` (no longer used here). Keep `mode` — the panel
  still switches which list it renders.
- The header row now contains only the collapse `«` button. Right-align it
  (`justifyContent:'flex-end'`) so the row doesn't look empty on the left.

### Changed: `src/App.tsx`

- Pass `mode={mode}` and `onModeChange={(m) => { setMode(m); setCreatingScope(null); }}`
  to `<AppHeader>`.
- Stop passing `onModeChange` to `<LibraryPanel>` (keep passing `mode`).
- Nothing else changes — `setMode` callers (`handleJumpToSession`, `onCreateMemory`)
  and persistence are untouched.

### New: `src/theme/header-nav.css` (imported from `src/index.css`)

Holds the tab classes and keyframes. Values mirror the approved mockup exactly.

- `.tg-modetab` (inactive/base):
  - `display:flex; align-items:center; gap:7px;`
  - font: `ui-monospace` stack, `11px`, `letter-spacing:2px`, `text-transform:uppercase`
  - `color: var(--text-dim);`
  - `background: rgba(110,224,238,.04);`
  - `border: 1px solid rgba(110,224,238,.22);`
  - `padding: 7px 14px; cursor:pointer; position:relative; overflow:hidden;`
  - `transition: all .22s ease;`
  - chamfer: `clip-path: polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);`
  - icon: `.tg-modetab svg { width:14px; height:14px; flex-shrink:0; display:block; }`
- `.tg-modetab:hover` → `color: var(--text); border-color: var(--edge-idle); background: rgba(110,224,238,.08);`
- Hover light-sweep: `.tg-modetab::after` is an off-screen diagonal highlight bar that
  animates across on hover (`@keyframes tg-tab-scan` left:-120% → 160%, .9s ease).
- `.tg-modetab--active`:
  - `color:#04222a; font-weight:700; border-color: var(--edge-trail);`
  - `background: linear-gradient(180deg,#5cf2ff,#00b3c8);`
  - `box-shadow: 0 0 14px rgba(0,229,255,.55);`
  - breathing glow: `animation: tg-tab-breathe 3s ease-in-out infinite;`
    (`@keyframes tg-tab-breathe` box-shadow 12px↔20px glow).
  - top scanline: `.tg-modetab--active::before` a 2px bright bar that travels down,
    `animation: tg-tab-scanline 2.4s linear infinite`.
- Reduced motion: under `@media (prefers-reduced-motion: reduce)`, disable
  `tg-tab-breathe`, `tg-tab-scanline`, and the hover-sweep animation (static active
  fill + border remain so state is still obvious). Matches the existing reduced-motion
  rule for `.cw-sweep`.

## Icon set (inline SVG, `currentColor`)

Source of truth is the approved mockup. Final paths:

- **Sessions** (layers), `viewBox="0 0 16 16"`, stroke 1.4:
  `M8 2 14 5 8 8 2 5Z` · `M2 8 8 11 14 8` · `M2 11 8 14 14 11`
- **Prompts** (chevron + underscore), `viewBox="0 0 16 16"`, stroke 1.6, round caps:
  `M3 4 6.5 8 3 12` · `M8 12 13 12`
- **Usage** (bars), `viewBox="0 0 16 16"`, stroke 1.6, round caps:
  `M3 13 3 9` · `M8 13 8 4` · `M13 13 13 7`
- **Memory** (brain outline), `viewBox="0 0 24 24"`, stroke 1.7, round caps/joins:
  - `M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z`
  - `M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z`
  - `M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4`
  - `M6 18a4 4 0 0 1-2-.5` · `M20 17.5a4 4 0 0 1-2 .5`

Each icon renders at `14×14`; the brain's 24-viewBox scales down cleanly.

## Accessibility

- `role="tablist"` on the nav; `role="tab"` + `aria-selected` on each button.
- `aria-current="page"` on the active tab.
- Buttons are real `<button>`s — keyboard focus and Enter/Space work for free.
- Icons are `aria-hidden`; the text label is the accessible name.

## Responsive behavior

- The center cell (`auto`) never wraps; the `1fr` side cells absorb width and truncate.
- Below a narrow breakpoint (~720px) hide the tagline (`display:none`) so the tabs never
  collide with it. The logo and tabs always remain.
- No change to the existing `NARROW_THRESHOLD` sidebar-collapse logic.

## Test impact

Updated in the same change:

- **e2e — switch from dropdown to tab clicks:**
  - `tests/e2e/memory-page.spec.ts`, `memory-write.spec.ts`, `tokens-page.spec.ts`,
    `prompts-mode.spec.ts` currently call
    `getByTestId('library-mode').selectOption('<mode>')`. Replace with
    `getByTestId('mode-tab-<mode>').click()`.
  - `memory-page.spec.ts` asserts `getByTestId('library-mode').toHaveValue('sessions')`
    after a cross-link click. Replace with an active-state assertion on the sessions tab,
    e.g. `expect(getByTestId('mode-tab-sessions')).toHaveAttribute('aria-selected','true')`.
- **unit — `tests/unit/components/AppHeader.test.tsx`:** `render(<AppHeader />)` now needs
  props: `render(<AppHeader mode="sessions" onModeChange={() => {}} />)`. Existing
  wordmark/logo/tagline assertions stay. Add assertions that the four tabs render and
  that the `mode` tab carries the active class/attr.
- **new — `tests/unit/components/ModeSwitcher.test.tsx`:** renders four tabs in order,
  marks the `mode` tab active, and fires `onModeChange` with the right value on click.
- `tests/unit/App-mode-routing.test.tsx`: verify it still passes (it drives `App`, not
  the dropdown directly); adjust only if it queries the old `<select>`.

## Out of scope (YAGNI)

- No change to `ClaudeWatchMark`, the wordmark, or the tagline visuals.
- No keyboard shortcuts for mode switching (playback shortcuts are unrelated).
- No new design tokens; literal color values match existing inline usage.
- No change to mode persistence, the `#/tokens` hash seed, or the sidebar collapse logic.
