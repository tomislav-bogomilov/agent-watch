# ClaudeWatch Rebrand — Design

**Date:** 2026-05-27
**Status:** Approved (design), pending spec review

## Goal

Rebrand the app from **ThoughtGraph** to **ClaudeWatch**: rename the user-facing and
project-metadata surfaces, introduce a logo mark, and add a full-width app header that
displays the brand. The app keeps its existing TRON aesthetic and canvas-first layout.

## Scope

**Rename scope: user-facing + project metadata.** We rename what users see and the
project's identity files. We deliberately leave functional internals untouched so
nothing breaks.

**In scope (rename):**
- `index.html` — `<title>` → `ClaudeWatch`; add a favicon.
- `package.json` — `name`: `claude-thoughtgraph` → `claudewatch`.
- `README.md` — headline and prose.
- `PRD.md` — product name references.
- Living tech docs — `docs/tech_docs/USER_GUIDE.md`, `DEVELOPER_GUIDE.md`,
  `open_questions.md`.

**Out of scope (left untouched):**
- `tg.*` localStorage keys — renaming would drop users' persisted prefs.
- Variable/type/component identifiers, internal code comments.
- The repository folder name (`ThoughtGraph`).
- The `ThoughtGraph` path fixture in `tests/unit/util/formatPath.test.ts` — it is a
  filesystem-path example (the repo folder), not branding.
- Historical design records under `docs/superpowers/specs/` and `docs/superpowers/plans/`
  — archival documents that legitimately reference the old name.

## Components

### 1. `ClaudeWatchMark` — the logo (`src/components/ClaudeWatchMark.tsx`)

The **"Iris Scan"** mark: an eye outline with a sweep arm raking out from a central
pupil-node, and one mint blip caught on the iris. Built as inline SVG using existing
theme tokens — cyan `--edge-trail` (#00e5ff), mint `--node-success` (#7fffd4), soft
`--edge-idle` (#6ee0ee) for the iris ring.

- **Props:** `size` (px, default ~22), and `animated` (boolean, default `true`).
- **Structure:** static layers (eye outline, pupil ring, pupil node, mint blip) plus a
  rotating group containing the sweep arm + its gradient wedge.
- **Animation:** the sweep-arm group rotates 360° on a ~6s linear infinite loop
  (`transform-origin: center; transform-box: view-box;` so it pivots about the eye
  centre). This echoes the existing `paneBreathe` animation in spirit.
- **Reduced motion:** under `@media (prefers-reduced-motion: reduce)` the animation is
  disabled and the arm holds a fixed angle (the static composition).
- **Reuse:** the same SVG geometry backs the favicon (below).

### 2. `AppHeader` — the top bar (`src/components/AppHeader.tsx`)

A full-width bar spanning the entire app, above the sidebar + main row.

- **Height:** ~40px. **Background:** `rgba(5,8,13,0.95)`. **Border-bottom:**
  `1px solid var(--grid)`.
- **Left:** `<ClaudeWatchMark size={22} />` + wordmark — `CLAUDE` in `--text`, `WATCH`
  in `--edge-trail` — monospace, letter-spacing ~3px.
- **Right:** dim tagline `watch claude think` (`--text-dim`, small, uppercase,
  letter-spacing). Presentational only; safe to remove.
- Purely presentational — no props, no state.

### 3. Favicon

The app currently has no favicon. Add an inline SVG favicon via
`<link rel="icon" href="data:image/svg+xml,...">` in `index.html`, using the Iris Scan
geometry (static — favicons don't animate reliably). No new `public/` directory needed.

## Layout change (`src/App.tsx`)

Today `styles.shell` is a horizontal flex (`display: flex; height: 100%`) holding the
sidebar and `<main>` side by side.

Restructure to a **column**:

```
shell (column, height 100%)
├── <AppHeader />              // flex-shrink: 0
└── body (row, flex: 1, minHeight: 0)
    ├── <LibraryPanel />
    └── <main>
```

The existing per-session canvas header (SESSION title, cwd, FIT/FOLLOW/LIVE tools) and
all other behaviour are unaffected — only the outer shell gains a header row and the
former shell becomes the inner `body` row.

## Testing

- **Unit (`AppHeader`):** renders the `CLAUDEWATCH` wordmark text and contains the mark
  SVG. Follows TDD — test first.
- **Unit (`ClaudeWatchMark`):** renders an `<svg>`; respects the `animated` prop
  (rotating group present/absent or animation class toggled).
- **E2E (light):** on initial load the header bar is visible and shows the brand text.
- **No existing test changes required** — verified that no test asserts the document
  title, and the only `ThoughtGraph` string in tests is the untouched path fixture.

## Non-goals

- No change to graph rendering, playback, live sessions, or token usage.
- No theme/palette changes beyond consuming existing tokens.
- No renaming of code identifiers, storage keys, or the repo folder.

## Workflow note

Per the project's feature-branch-per-workstream workflow, implementation lands on a
dedicated branch (e.g. `feat/claudewatch-rebrand`) and merges to `main` only on explicit
authorization.