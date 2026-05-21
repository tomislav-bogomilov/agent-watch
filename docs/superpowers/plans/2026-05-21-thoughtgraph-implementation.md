# Claude ThoughtGraph POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dev-mode React app that auto-discovers Claude Code JSONL session logs from `~/.claude/projects` and renders each session as a TRON-themed top-down decision tree with an animated traversal trail and a two-line HUD readout.

**Architecture:** A Vite dev server hosts a React 19 + TypeScript frontend. A custom Vite plugin (Node-side, runs inside the dev server) exposes `~/.claude/projects` via `/api/sessions` endpoints. The frontend fetches JSONL via TanStack Query, parses it into semantic milestone trees with pure functions, lays the tree out via `d3.tree()`, and renders SVG nodes/edges. A React-driven `usePlayback()` hook walks the tree depth-first (descending into subagents first) and drives all visual state changes.

**Tech Stack:** React 19, TypeScript, Vite 6, D3 v7, TanStack Query v5, Vitest 2 (unit), Playwright 1 (E2E).

---

## File Structure

**Root config:**
- `package.json` — deps + scripts
- `tsconfig.json` — strict TS config for app + tests
- `tsconfig.node.json` — separate config for Vite/plugin code
- `vite.config.ts` — Vite config including custom plugin + Vitest config
- `playwright.config.ts` — E2E config; spawns dev server with fixture `CLAUDE_HOME`
- `index.html` — Vite HTML entry
- `.gitignore` — already exists (Task 0 covers if missing)

**Server (Vite plugin):**
- `server/vite-plugin-sessions.ts` — middleware exposing `/api/sessions` and `/api/sessions/:project/:id`

**Frontend:**
- `src/main.tsx` — React entrypoint, TanStack Query provider, CSS imports
- `src/App.tsx` — layout shell (sidebar + canvas + HUD + controls)
- `src/index.css` — global resets, dark canvas, grid background
- `src/theme/tokens.css` — TRON color tokens (CSS custom properties)
- `src/theme/Filters.tsx` — single shared SVG `<defs>` with the glow `<filter>`
- `src/api/client.ts` — typed fetch helpers
- `src/api/hooks.ts` — `useSessionList`, `useSession` TanStack Query hooks
- `src/parse/types.ts` — `MilestoneKind`, `Milestone`, `Session`, raw event types
- `src/parse/sentence.ts` — `firstSentence(text)` helper
- `src/parse/filter.ts` — drop noise events
- `src/parse/chain.ts` — `parentUuid`→`uuid` chain building
- `src/parse/extract-label.ts` — short on-node label per milestone kind
- `src/parse/extract-summary.ts` — one-line summary per milestone kind
- `src/parse/extract-result.ts` — per-tool result one-liner
- `src/parse/milestones.ts` — assemble milestone tree from filtered event chain
- `src/parse/failure.ts` — mark `failed`, compute taint + success path
- `src/parse/subagents.ts` — link subagent files to spawn nodes
- `src/parse/index.ts` — `parseSession(payload)` orchestrator
- `src/graph/layout.ts` — pure D3 tree layout adapter
- `src/playback/usePlayback.ts` — DFS traversal clock + state
- `src/components/SessionList.tsx` — left sidebar
- `src/components/GraphCanvas.tsx` — SVG canvas hosting nodes + edges
- `src/components/NodeShape.tsx` — per-node SVG group
- `src/components/EdgePath.tsx` — per-edge SVG path with animated draw
- `src/components/PlaybackControls.tsx` — play/pause + speed pill
- `src/components/NowPlaying.tsx` — two-line HUD readout
- `src/components/NodeTooltip.tsx` — hover detail

**Tests:**
- `tests/unit/parse/sentence.test.ts`
- `tests/unit/parse/filter.test.ts`
- `tests/unit/parse/chain.test.ts`
- `tests/unit/parse/extract-result.test.ts`
- `tests/unit/parse/milestones.test.ts`
- `tests/unit/parse/failure.test.ts`
- `tests/unit/graph/layout.test.ts`
- `tests/e2e/discovery-load.spec.ts`
- `tests/e2e/playback.spec.ts`
- `tests/e2e/failure-rendering.spec.ts`
- `tests/e2e/subagent.spec.ts`
- `tests/e2e/hud-readout.spec.ts`
- `tests/fixtures/sessions/happy-path.jsonl`
- `tests/fixtures/sessions/with-failure.jsonl`
- `tests/fixtures/sessions/with-subagent.jsonl`
- `tests/fixtures/sessions/with-subagent/subagents/agent-fixsub.jsonl`
- `tests/fixtures/claude-projects/C--fixture-project/*.jsonl` (mirrors structure)

---

## Task 1: Project bootstrap

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "claude-thoughtgraph",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.51.0",
    "d3": "^7.9.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0",
    "@types/d3": "^7.4.3",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "useDefineForClassFields": true,
    "types": ["vite/client", "vitest/globals", "node"]
  },
  "include": ["src", "tests/unit"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true,
    "composite": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "server/**/*.ts", "playwright.config.ts"]
}
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claude ThoughtGraph</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `vite.config.ts`**

```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.ts'],
  },
});
```

(The custom sessions plugin gets added to `plugins` in Task 10.)

- [ ] **Step 6: Create `src/index.css`**

```css
:root { color-scheme: dark; }
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  background: #05080d;
  color: #aeeaf2;
  font-family: ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 7: Create `src/main.tsx`**

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
```

- [ ] **Step 8: Create `src/App.tsx`**

```typescript
export default function App() {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ margin: 0, fontWeight: 400, letterSpacing: 2 }}>CLAUDE THOUGHTGRAPH</h1>
      <p style={{ opacity: 0.6 }}>bootstrap ok</p>
    </div>
  );
}
```

- [ ] **Step 9: Install deps**

```bash
npm install
```

Expected: deps install without errors.

- [ ] **Step 10: Run dev server, verify it boots**

```bash
npm run dev
```

Expected output includes `Local: http://localhost:5173/`. Open the URL: see "CLAUDE THOUGHTGRAPH bootstrap ok" on a dark background. Stop the server (Ctrl+C).

- [ ] **Step 11: Typecheck passes**

```bash
npm run typecheck
```

Expected: no output (clean).

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json index.html vite.config.ts src/main.tsx src/App.tsx src/index.css
git commit -m "chore: bootstrap Vite + React 19 + TypeScript project"
```

---

## Task 2: TRON theme tokens

**Files:**
- Create: `src/theme/tokens.css`
- Modify: `src/main.tsx`
- Modify: `src/index.css`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/theme/tokens.css`**

```css
:root {
  --bg: #05080d;
  --grid: #0e1822;
  --edge-idle: #1a3a4a;
  --edge-trail: #00e5ff;
  --node-idle: #0f2632;
  --node-active: #00e5ff;
  --node-success: #7fffd4;
  --node-failed: #ff5d3a;
  --node-pruned: #1a1f24;
  --subagent-accent: #9d6cff;
  --text: #aeeaf2;
  --text-dim: #4f7782;
}
```

- [ ] **Step 2: Update `src/main.tsx` to import tokens before index.css**

Replace the import lines at the top:

```typescript
import './theme/tokens.css';
import './index.css';
```

- [ ] **Step 3: Replace `src/index.css` with grid-backgrounded canvas**

```css
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  background:
    radial-gradient(ellipse at top, rgba(0, 229, 255, 0.04), transparent 60%),
    linear-gradient(var(--grid) 1px, transparent 1px) 0 0 / 40px 40px,
    linear-gradient(90deg, var(--grid) 1px, transparent 1px) 0 0 / 40px 40px,
    var(--bg);
  color: var(--text);
  font-family: ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 4: Replace `src/App.tsx` with a theme-checking placeholder**

```typescript
export default function App() {
  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ margin: 0, fontWeight: 400, letterSpacing: 4, color: 'var(--edge-trail)' }}>
        CLAUDE THOUGHTGRAPH
      </h1>
      <p style={{ opacity: 0.6, marginTop: 8 }}>theme tokens loaded</p>
    </div>
  );
}
```

- [ ] **Step 5: Run dev server, visually verify**

```bash
npm run dev
```

Expected: dark background with a faint cyan grid; cyan "CLAUDE THOUGHTGRAPH" heading. Stop server.

- [ ] **Step 6: Commit**

```bash
git add src/theme/tokens.css src/main.tsx src/index.css src/App.tsx
git commit -m "feat(theme): add TRON color tokens and grid background"
```

---

## Task 3: Parse types and sentence helper

**Files:**
- Create: `src/parse/types.ts`
- Create: `src/parse/sentence.ts`
- Create: `tests/unit/parse/sentence.test.ts`

- [ ] **Step 1: Create `src/parse/types.ts`**

```typescript
export type MilestoneKind =
  | 'root_prompt'
  | 'assistant_turn'
  | 'tool_call'
  | 'subagent_spawn'
  | 'user_followup'
  | 'completion';

export type Milestone = {
  id: string;
  kind: MilestoneKind;
  label: string;
  summary: string;
  result?: string;
  detail?: string;
  timestamp: string;
  failed: boolean;
  toolName?: string;
  raw: unknown;
  children: Milestone[];
};

export type Session = {
  id: string;
  cwd: string;
  startedAt: string;
  root: Milestone;
  successPath: Set<string>;
  totalMilestones: number;
};

export type RawEvent = {
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  type: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  sessionId?: string;
  cwd?: string;
  message?: {
    role: 'user' | 'assistant';
    content: string | RawContentBlock[];
  };
  [key: string]: unknown;
};

export type RawContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | RawContentBlock[]; is_error?: boolean };

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
};
```

- [ ] **Step 2: Write failing test for `firstSentence`**

Create `tests/unit/parse/sentence.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { firstSentence } from '../../../src/parse/sentence';

describe('firstSentence', () => {
  it('returns the first sentence when terminated with a period', () => {
    expect(firstSentence('Hello world. Then more.')).toBe('Hello world');
  });

  it('returns the first sentence when terminated with ! or ?', () => {
    expect(firstSentence('Wow! Next.')).toBe('Wow');
    expect(firstSentence('Why? Because.')).toBe('Why');
  });

  it('returns the entire string trimmed when no terminator', () => {
    expect(firstSentence('  no terminator here  ')).toBe('no terminator here');
  });

  it('truncates to 160 chars when no terminator and string is long', () => {
    const long = 'x'.repeat(200);
    expect(firstSentence(long)).toBe('x'.repeat(160));
  });

  it('returns empty string for empty input', () => {
    expect(firstSentence('')).toBe('');
    expect(firstSentence('   ')).toBe('');
  });

  it('handles a single character followed by terminator', () => {
    expect(firstSentence('a. b. c.')).toBe('a');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- sentence
```

Expected: FAIL — `Cannot find module '../../../src/parse/sentence'`.

- [ ] **Step 4: Implement `src/parse/sentence.ts`**

```typescript
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  const match = trimmed.match(/^([^.!?]+)[.!?](?:\s|$)/);
  if (match) return match[1].trim();
  return trimmed.slice(0, 160);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- sentence
```

Expected: PASS (6 passed).

- [ ] **Step 6: Commit**

```bash
git add src/parse/types.ts src/parse/sentence.ts tests/unit/parse/sentence.test.ts
git commit -m "feat(parse): add core types and firstSentence helper"
```

---

## Task 4: Parse noise filter

**Files:**
- Create: `src/parse/filter.ts`
- Create: `tests/unit/parse/filter.test.ts`

- [ ] **Step 1: Write failing test for `filterNoise`**

Create `tests/unit/parse/filter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { filterNoise } from '../../../src/parse/filter';
import type { RawEvent } from '../../../src/parse/types';

function evt(overrides: Partial<RawEvent>): RawEvent {
  return {
    uuid: 'u',
    parentUuid: null,
    timestamp: '2026-05-21T00:00:00Z',
    type: 'user',
    ...overrides,
  };
}

describe('filterNoise', () => {
  it('drops file-history-snapshot events', () => {
    const events = [evt({ type: 'file-history-snapshot', uuid: '1' })];
    expect(filterNoise(events)).toEqual([]);
  });

  it('drops attachment events', () => {
    const events = [evt({ type: 'attachment', uuid: '1' })];
    expect(filterNoise(events)).toEqual([]);
  });

  it('drops system events', () => {
    const events = [evt({ type: 'system', uuid: '1' })];
    expect(filterNoise(events)).toEqual([]);
  });

  it('drops user events with isMeta:true', () => {
    const events = [evt({ uuid: '1', isMeta: true })];
    expect(filterNoise(events)).toEqual([]);
  });

  it('drops user messages whose content is a /clear command wrapper', () => {
    const events = [
      evt({
        uuid: '1',
        message: {
          role: 'user',
          content: '<command-name>/clear</command-name>\n<command-message>clear</command-message>',
        },
      }),
    ];
    expect(filterNoise(events)).toEqual([]);
  });

  it('drops user messages whose content is local-command-caveat boilerplate', () => {
    const events = [
      evt({
        uuid: '1',
        message: {
          role: 'user',
          content:
            '<local-command-caveat>Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages or otherwise consider them in your response unless the user explicitly asks you to.</local-command-caveat>',
        },
      }),
    ];
    expect(filterNoise(events)).toEqual([]);
  });

  it('drops assistant messages with empty content', () => {
    const events = [
      evt({ uuid: '1', type: 'assistant', message: { role: 'assistant', content: '' } }),
      evt({ uuid: '2', type: 'assistant', message: { role: 'assistant', content: [] } }),
    ];
    expect(filterNoise(events)).toEqual([]);
  });

  it('keeps real user messages', () => {
    const real = evt({
      uuid: '1',
      message: { role: 'user', content: 'Please help me build a thing' },
    });
    expect(filterNoise([real])).toEqual([real]);
  });

  it('keeps real assistant messages with text', () => {
    const real = evt({
      uuid: '1',
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Sure' }] },
    });
    expect(filterNoise([real])).toEqual([real]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- filter
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/parse/filter.ts`**

```typescript
import type { RawEvent, RawContentBlock } from './types';

const NOISE_TYPES = new Set(['file-history-snapshot', 'attachment', 'system']);
const COMMAND_WRAPPER_RX = /<command-(name|message|args)>/;
const LOCAL_CAVEAT_RX = /<local-command-(caveat|stdout|stderr)>/;

function contentToString(content: string | RawContentBlock[] | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
}

function isCommandWrapperUser(ev: RawEvent): boolean {
  if (ev.type !== 'user' || !ev.message) return false;
  const text = contentToString(ev.message.content);
  return COMMAND_WRAPPER_RX.test(text) || LOCAL_CAVEAT_RX.test(text);
}

function isEmptyAssistant(ev: RawEvent): boolean {
  if (ev.type !== 'assistant' || !ev.message) return false;
  const c = ev.message.content;
  if (typeof c === 'string') return c.trim() === '';
  if (Array.isArray(c)) return c.length === 0;
  return true;
}

export function filterNoise(events: RawEvent[]): RawEvent[] {
  return events.filter((ev) => {
    if (NOISE_TYPES.has(ev.type)) return false;
    if (ev.isMeta === true) return false;
    if (isCommandWrapperUser(ev)) return false;
    if (isEmptyAssistant(ev)) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- filter
```

Expected: PASS (9 passed).

- [ ] **Step 5: Commit**

```bash
git add src/parse/filter.ts tests/unit/parse/filter.test.ts
git commit -m "feat(parse): add JSONL noise filter"
```

---

## Task 5: Event chain construction

**Files:**
- Create: `src/parse/chain.ts`
- Create: `tests/unit/parse/chain.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/parse/chain.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildChain } from '../../../src/parse/chain';
import type { RawEvent } from '../../../src/parse/types';

function evt(uuid: string, parentUuid: string | null): RawEvent {
  return { uuid, parentUuid, timestamp: '2026-05-21T00:00:00Z', type: 'user' };
}

describe('buildChain', () => {
  it('orders events by parent pointer regardless of input order', () => {
    const events = [evt('c', 'b'), evt('a', null), evt('b', 'a')];
    const chain = buildChain(events);
    expect(chain.map((e) => e.uuid)).toEqual(['a', 'b', 'c']);
  });

  it('returns a single root event correctly', () => {
    const events = [evt('only', null)];
    expect(buildChain(events).map((e) => e.uuid)).toEqual(['only']);
  });

  it('drops orphaned events (parent not present)', () => {
    const events = [evt('a', null), evt('b', 'a'), evt('orphan', 'missing')];
    const chain = buildChain(events);
    expect(chain.map((e) => e.uuid)).toEqual(['a', 'b']);
  });

  it('returns empty array for empty input', () => {
    expect(buildChain([])).toEqual([]);
  });

  it('uses the first event without a parent as root if multiple roots exist', () => {
    const events = [evt('r1', null), evt('r2', null), evt('a', 'r1')];
    const chain = buildChain(events);
    expect(chain.map((e) => e.uuid)).toEqual(['r1', 'a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- chain
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/parse/chain.ts`**

```typescript
import type { RawEvent } from './types';

export function buildChain(events: RawEvent[]): RawEvent[] {
  if (events.length === 0) return [];

  const byUuid = new Map<string, RawEvent>();
  for (const ev of events) byUuid.set(ev.uuid, ev);

  const childrenByParent = new Map<string | null, RawEvent[]>();
  for (const ev of events) {
    const parent = ev.parentUuid && byUuid.has(ev.parentUuid) ? ev.parentUuid : null;
    const list = childrenByParent.get(parent) ?? [];
    list.push(ev);
    childrenByParent.set(parent, list);
  }

  const roots = childrenByParent.get(null) ?? [];
  if (roots.length === 0) return [];
  const root = roots[0];

  const chain: RawEvent[] = [];
  const visited = new Set<string>();
  function walk(node: RawEvent): void {
    if (visited.has(node.uuid)) return;
    visited.add(node.uuid);
    chain.push(node);
    const kids = childrenByParent.get(node.uuid) ?? [];
    for (const k of kids) walk(k);
  }
  walk(root);
  return chain;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- chain
```

Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add src/parse/chain.ts tests/unit/parse/chain.test.ts
git commit -m "feat(parse): build event chain from parentUuid pointers"
```

---

## Task 6: Label, summary, and result extraction

**Files:**
- Create: `src/parse/extract-label.ts`
- Create: `src/parse/extract-summary.ts`
- Create: `src/parse/extract-result.ts`
- Create: `tests/unit/parse/extract-result.test.ts`

- [ ] **Step 1: Create `src/parse/extract-label.ts`**

```typescript
import { basename } from 'node:path';
import type { MilestoneKind } from './types';

export type LabelInput =
  | { kind: 'root_prompt' | 'assistant_turn' | 'user_followup' | 'completion' }
  | { kind: 'tool_call'; toolName: string; input: Record<string, unknown> }
  | { kind: 'subagent_spawn'; subagentType: string };

function safeBasename(p: unknown): string {
  if (typeof p !== 'string' || p.length === 0) return '?';
  return basename(p.replace(/\\/g, '/'));
}

export function extractLabel(input: LabelInput): { label: string; kind: MilestoneKind } {
  switch (input.kind) {
    case 'root_prompt':
      return { label: 'Prompt', kind: 'root_prompt' };
    case 'assistant_turn':
      return { label: 'Decided', kind: 'assistant_turn' };
    case 'user_followup':
      return { label: 'User', kind: 'user_followup' };
    case 'completion':
      return { label: 'Done', kind: 'completion' };
    case 'subagent_spawn':
      return { label: `→ ${input.subagentType}`, kind: 'subagent_spawn' };
    case 'tool_call': {
      const t = input.toolName;
      const args = input.input;
      if (t === 'Read') return { label: `Read ${safeBasename(args.file_path)}`, kind: 'tool_call' };
      if (t === 'Edit') return { label: `Edit ${safeBasename(args.file_path)}`, kind: 'tool_call' };
      if (t === 'Write') return { label: `Write ${safeBasename(args.file_path)}`, kind: 'tool_call' };
      if (t === 'Bash') return { label: 'Bash', kind: 'tool_call' };
      if (t === 'Grep') return { label: 'Grep', kind: 'tool_call' };
      return { label: t, kind: 'tool_call' };
    }
  }
}
```

- [ ] **Step 2: Create `src/parse/extract-summary.ts`**

```typescript
import { firstSentence } from './sentence';

export type SummaryInput =
  | { kind: 'root_prompt' | 'user_followup'; text: string }
  | { kind: 'assistant_turn' | 'completion'; text: string }
  | { kind: 'tool_call'; toolName: string; input: Record<string, unknown> }
  | { kind: 'subagent_spawn'; description: string };

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

function firstLine(s: string): string {
  const lines = s.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t.length > 0) return t;
  }
  return '';
}

export function extractSummary(input: SummaryInput): string {
  switch (input.kind) {
    case 'root_prompt':
    case 'user_followup':
      return truncate(input.text.trim(), 160);
    case 'assistant_turn':
    case 'completion':
      return firstSentence(input.text);
    case 'subagent_spawn':
      return truncate(input.description.trim(), 160);
    case 'tool_call': {
      const t = input.toolName;
      const args = input.input;
      if (t === 'Read') return `Read ${args.file_path ?? '?'}`;
      if (t === 'Bash') return `Bash: ${truncate(firstLine(String(args.command ?? '')), 160)}`;
      if (t === 'Edit')
        return `Edit ${args.file_path ?? '?'}`;
      if (t === 'Write') return `Write ${args.file_path ?? '?'}`;
      if (t === 'Grep')
        return `Grep '${args.pattern ?? ''}' in ${args.path ?? '<repo>'}`;
      try {
        return `${t}: ${truncate(JSON.stringify(args), 140)}`;
      } catch {
        return t;
      }
    }
  }
}
```

- [ ] **Step 3: Write failing test for `extractResult`**

Create `tests/unit/parse/extract-result.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractResult } from '../../../src/parse/extract-result';

describe('extractResult', () => {
  it('Read: lines + bytes when content is text', () => {
    const result = extractResult({
      toolName: 'Read',
      isError: false,
      content: 'line one\nline two\nline three\n',
    });
    expect(result).toBe('3 lines, 28 bytes — starts: line one');
  });

  it('Bash: exit code + last non-empty stdout line', () => {
    const result = extractResult({
      toolName: 'Bash',
      isError: false,
      content: '<stdout>\n12 passed\n0 failed\n</stdout>\n<exit_code>0</exit_code>',
    });
    expect(result).toBe('exit 0 — 0 failed');
  });

  it('Bash: marks failure when exit code is non-zero', () => {
    const result = extractResult({
      toolName: 'Bash',
      isError: false,
      content: '<stdout></stdout>\n<stderr>oops</stderr>\n<exit_code>1</exit_code>',
    });
    expect(result).toBe('exit 1 — oops');
  });

  it('Edit: replacement count from result', () => {
    const result = extractResult({
      toolName: 'Edit',
      isError: false,
      content: 'Made 3 replacements in src/foo.ts',
    });
    expect(result).toBe('3 replacements');
  });

  it('Write: byte count', () => {
    const result = extractResult({
      toolName: 'Write',
      isError: false,
      content: 'Wrote 1024 bytes to src/bar.ts',
    });
    expect(result).toBe('Wrote 1024 bytes');
  });

  it('Grep: match and file counts', () => {
    const result = extractResult({
      toolName: 'Grep',
      isError: false,
      content: 'Found 5 matches in 3 files',
    });
    expect(result).toBe('5 matches in 3 files');
  });

  it('errors get the ⚠ prefix using the error message', () => {
    const result = extractResult({
      toolName: 'Read',
      isError: true,
      content: 'File does not exist: /tmp/missing',
    });
    expect(result).toBe('⚠ error: File does not exist: /tmp/missing');
  });

  it('unknown tool falls back to truncated content', () => {
    const result = extractResult({
      toolName: 'WeirdTool',
      isError: false,
      content: 'hello world from somewhere',
    });
    expect(result).toBe('hello world from somewhere');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npm test -- extract-result
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement `src/parse/extract-result.ts`**

```typescript
export type ResultInput = {
  toolName: string;
  isError: boolean;
  content: string;
};

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

function lastNonEmptyLine(s: string): string {
  const lines = s.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t.length > 0) return t;
  }
  return '';
}

function extractBashExitCode(content: string): number | null {
  const m = content.match(/<exit_code>(\d+)<\/exit_code>/);
  if (m) return Number(m[1]);
  return null;
}

function extractBashStreams(content: string): { stdout: string; stderr: string } {
  const stdoutMatch = content.match(/<stdout>([\s\S]*?)<\/stdout>/);
  const stderrMatch = content.match(/<stderr>([\s\S]*?)<\/stderr>/);
  return {
    stdout: stdoutMatch ? stdoutMatch[1] : '',
    stderr: stderrMatch ? stderrMatch[1] : '',
  };
}

export function extractResult(input: ResultInput): string {
  if (input.isError) {
    return `⚠ error: ${truncate(input.content.trim(), 160)}`;
  }

  const t = input.toolName;
  const content = input.content;

  if (t === 'Read') {
    const lines = content.split(/\r?\n/);
    const lineCount = lines.length - (lines[lines.length - 1] === '' ? 1 : 0);
    const bytes = new TextEncoder().encode(content).length;
    let firstNonEmpty = '';
    for (const line of lines) {
      const trimmed = line.replace(/^\s*\d+→/, '').trim();
      if (trimmed.length > 0) {
        firstNonEmpty = trimmed;
        break;
      }
    }
    return `${lineCount} lines, ${bytes} bytes — starts: ${truncate(firstNonEmpty, 80)}`;
  }

  if (t === 'Bash') {
    const exitCode = extractBashExitCode(content) ?? 0;
    const { stdout, stderr } = extractBashStreams(content);
    const stream = exitCode === 0 ? stdout : stderr || stdout;
    const last = lastNonEmptyLine(stream);
    return `exit ${exitCode} — ${truncate(last, 120)}`;
  }

  if (t === 'Edit') {
    const m = content.match(/(\d+)\s+replacement/i);
    if (m) return `${m[1]} replacements`;
    return truncate(content.trim(), 160);
  }

  if (t === 'Write') {
    const m = content.match(/(?:Wrote|wrote)\s+(\d+)\s+bytes/);
    if (m) return `Wrote ${m[1]} bytes`;
    return truncate(content.trim(), 160);
  }

  if (t === 'Grep') {
    const m = content.match(/(\d+)\s+matches?\s+in\s+(\d+)\s+files?/i);
    if (m) return `${m[1]} matches in ${m[2]} files`;
    return truncate(content.trim(), 160);
  }

  return truncate(content.trim(), 160);
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npm test -- extract-result
```

Expected: PASS (8 passed).

- [ ] **Step 7: Commit**

```bash
git add src/parse/extract-label.ts src/parse/extract-summary.ts src/parse/extract-result.ts tests/unit/parse/extract-result.test.ts
git commit -m "feat(parse): add label/summary/result extraction"
```

---

## Task 7: Milestone assembly

**Files:**
- Create: `src/parse/milestones.ts`
- Create: `tests/unit/parse/milestones.test.ts`

- [ ] **Step 1: Write failing test for `buildMilestones`**

Create `tests/unit/parse/milestones.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildMilestones } from '../../../src/parse/milestones';
import type { RawEvent } from '../../../src/parse/types';

const t = '2026-05-21T00:00:00Z';

function userMsg(uuid: string, parentUuid: string | null, text: string): RawEvent {
  return {
    uuid,
    parentUuid,
    timestamp: t,
    type: 'user',
    message: { role: 'user', content: text },
  };
}

function assistantText(uuid: string, parentUuid: string | null, text: string): RawEvent {
  return {
    uuid,
    parentUuid,
    timestamp: t,
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  };
}

function assistantTool(
  uuid: string,
  parentUuid: string | null,
  toolUseId: string,
  toolName: string,
  input: Record<string, unknown>,
  precedingText = ''
): RawEvent {
  const content = [];
  if (precedingText) content.push({ type: 'text', text: precedingText });
  content.push({ type: 'tool_use', id: toolUseId, name: toolName, input });
  return {
    uuid,
    parentUuid,
    timestamp: t,
    type: 'assistant',
    message: { role: 'assistant', content: content as any },
  };
}

function toolResult(
  uuid: string,
  parentUuid: string | null,
  toolUseId: string,
  content: string,
  isError = false
): RawEvent {
  return {
    uuid,
    parentUuid,
    timestamp: t,
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError } as any],
    },
  };
}

describe('buildMilestones', () => {
  it('treats the first non-meta user message as root_prompt', () => {
    const events: RawEvent[] = [
      userMsg('1', null, 'Hello there'),
      assistantText('2', '1', 'Hi'),
    ];
    const root = buildMilestones(events);
    expect(root.kind).toBe('root_prompt');
    expect(root.label).toBe('Prompt');
    expect(root.summary).toBe('Hello there');
  });

  it('chains assistant_turn after root_prompt', () => {
    const events: RawEvent[] = [
      userMsg('1', null, 'Hello'),
      assistantText('2', '1', 'I will help. Starting now.'),
    ];
    const root = buildMilestones(events);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].kind).toBe('completion'); // single assistant turn at end becomes completion
    expect(root.children[0].summary).toBe('I will help');
  });

  it('creates tool_call milestones with matched tool_result content', () => {
    const events: RawEvent[] = [
      userMsg('1', null, 'Read it'),
      assistantTool('2', '1', 'tu_a', 'Read', { file_path: '/tmp/x.txt' }),
      toolResult('3', '2', 'tu_a', 'alpha\nbeta\n', false),
      assistantText('4', '3', 'Done with the read.'),
    ];
    const root = buildMilestones(events);
    const tool = root.children[0];
    expect(tool.kind).toBe('tool_call');
    expect(tool.label).toBe('Read x.txt');
    expect(tool.summary).toBe('Read /tmp/x.txt');
    expect(tool.result).toMatch(/^2 lines, 10 bytes/);
    expect(tool.failed).toBe(false);
    expect(tool.toolName).toBe('Read');
  });

  it('flags failure on is_error tool_result', () => {
    const events: RawEvent[] = [
      userMsg('1', null, 'Try'),
      assistantTool('2', '1', 'tu_a', 'Read', { file_path: '/nope' }),
      toolResult('3', '2', 'tu_a', 'File does not exist', true),
    ];
    const root = buildMilestones(events);
    const tool = root.children[0];
    expect(tool.failed).toBe(true);
    expect(tool.result?.startsWith('⚠ error')).toBe(true);
  });

  it('detects subagent_spawn for Task tool', () => {
    const events: RawEvent[] = [
      userMsg('1', null, 'Delegate'),
      assistantTool('2', '1', 'tu_t', 'Task', {
        subagent_type: 'Explore',
        description: 'find auth code',
        prompt: 'do it',
      }),
      toolResult('3', '2', 'tu_t', 'Subagent done', false),
    ];
    const root = buildMilestones(events);
    const spawn = root.children[0];
    expect(spawn.kind).toBe('subagent_spawn');
    expect(spawn.label).toBe('→ Explore');
    expect(spawn.summary).toBe('find auth code');
  });

  it('the last milestone is tagged as completion when assistant text-only', () => {
    const events: RawEvent[] = [
      userMsg('1', null, 'q'),
      assistantText('2', '1', 'Working.'),
      assistantText('3', '2', 'All done!'),
    ];
    const root = buildMilestones(events);
    const inner = root.children[0];
    expect(inner.kind).toBe('assistant_turn');
    expect(inner.children[0].kind).toBe('completion');
    expect(inner.children[0].summary).toBe('All done');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- milestones
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/parse/milestones.ts`**

```typescript
import { extractLabel } from './extract-label';
import { extractSummary } from './extract-summary';
import { extractResult } from './extract-result';
import type { Milestone, RawContentBlock, RawEvent } from './types';

type ToolUseBlock = { id: string; name: string; input: Record<string, unknown> };

function blocks(ev: RawEvent): RawContentBlock[] {
  const c = ev.message?.content;
  if (!c) return [];
  if (typeof c === 'string') return [{ type: 'text', text: c }];
  return c;
}

function plainText(ev: RawEvent): string {
  return blocks(ev)
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

function toolUses(ev: RawEvent): ToolUseBlock[] {
  return blocks(ev)
    .filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));
}

function toolResults(ev: RawEvent): Map<string, { content: string; isError: boolean }> {
  const result = new Map<string, { content: string; isError: boolean }>();
  for (const b of blocks(ev)) {
    if (b.type === 'tool_result') {
      const content = typeof b.content === 'string'
        ? b.content
        : b.content
            .filter((cb): cb is { type: 'text'; text: string } => cb.type === 'text')
            .map((cb) => cb.text)
            .join('');
      result.set(b.tool_use_id, { content, isError: b.is_error === true });
    }
  }
  return result;
}

function makeMilestone(partial: Omit<Milestone, 'children'> & { children?: Milestone[] }): Milestone {
  return { ...partial, children: partial.children ?? [] };
}

export function buildMilestones(events: RawEvent[]): Milestone {
  if (events.length === 0) {
    return makeMilestone({
      id: 'empty',
      kind: 'root_prompt',
      label: 'Prompt',
      summary: '(empty session)',
      timestamp: '',
      failed: false,
      raw: null,
    });
  }

  // Collect all tool results across events keyed by tool_use_id
  const allToolResults = new Map<string, { content: string; isError: boolean }>();
  for (const ev of events) {
    if (ev.type !== 'user') continue;
    const rs = toolResults(ev);
    for (const [id, r] of rs) allToolResults.set(id, r);
  }

  // Build a flat list of milestones in order
  const flat: Milestone[] = [];
  let isFirstUser = true;

  for (const ev of events) {
    if (ev.type === 'user' && ev.message) {
      const onlyToolResults = blocks(ev).every((b) => b.type === 'tool_result');
      if (onlyToolResults) continue; // results merged into tool_call below
      const text = typeof ev.message.content === 'string'
        ? ev.message.content
        : plainText(ev);
      if (text.trim().length === 0) continue;
      const isRoot = isFirstUser;
      isFirstUser = false;
      const kind = isRoot ? 'root_prompt' : 'user_followup';
      const { label } = extractLabel({ kind });
      flat.push(
        makeMilestone({
          id: ev.uuid,
          kind,
          label,
          summary: extractSummary({ kind, text }),
          detail: text,
          timestamp: ev.timestamp,
          failed: false,
          raw: ev,
        })
      );
    } else if (ev.type === 'assistant' && ev.message) {
      const text = plainText(ev);
      const tools = toolUses(ev);

      if (text && tools.length === 0) {
        flat.push(
          makeMilestone({
            id: ev.uuid,
            kind: 'assistant_turn',
            label: extractLabel({ kind: 'assistant_turn' }).label,
            summary: extractSummary({ kind: 'assistant_turn', text }),
            detail: text,
            timestamp: ev.timestamp,
            failed: false,
            raw: ev,
          })
        );
      }
      for (const tu of tools) {
        const isTask = tu.name === 'Task';
        const kind = isTask ? 'subagent_spawn' : 'tool_call';
        const result = allToolResults.get(tu.id);
        const failed = result?.isError === true || isBashFailed(tu.name, result?.content ?? '');
        const labelInfo = isTask
          ? extractLabel({ kind: 'subagent_spawn', subagentType: String(tu.input.subagent_type ?? '?') })
          : extractLabel({ kind: 'tool_call', toolName: tu.name, input: tu.input });
        const summary = isTask
          ? extractSummary({ kind: 'subagent_spawn', description: String(tu.input.description ?? '') })
          : extractSummary({ kind: 'tool_call', toolName: tu.name, input: tu.input });
        const resultStr = result
          ? extractResult({ toolName: tu.name, isError: result.isError, content: result.content })
          : undefined;
        flat.push(
          makeMilestone({
            id: `${ev.uuid}#${tu.id}`,
            kind,
            label: labelInfo.label,
            summary,
            result: resultStr,
            detail: JSON.stringify(tu.input, null, 2),
            timestamp: ev.timestamp,
            failed,
            toolName: tu.name,
            raw: { event: ev, toolUse: tu, toolResult: result },
          })
        );
      }
    }
  }

  // Promote final assistant_turn to completion
  for (let i = flat.length - 1; i >= 0; i--) {
    if (flat[i].kind === 'assistant_turn') {
      flat[i] = { ...flat[i], kind: 'completion', label: 'Done' };
      break;
    }
  }

  // Chain flat list into a tree (one child per parent for sequential flow)
  if (flat.length === 0) {
    return makeMilestone({
      id: 'empty',
      kind: 'root_prompt',
      label: 'Prompt',
      summary: '(no milestones)',
      timestamp: events[0]?.timestamp ?? '',
      failed: false,
      raw: null,
    });
  }

  for (let i = flat.length - 1; i > 0; i--) {
    flat[i - 1].children = [flat[i]];
  }
  return flat[0];
}

function isBashFailed(toolName: string, content: string): boolean {
  if (toolName !== 'Bash') return false;
  const m = content.match(/<exit_code>(\d+)<\/exit_code>/);
  if (!m) return false;
  return Number(m[1]) !== 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- milestones
```

Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add src/parse/milestones.ts tests/unit/parse/milestones.test.ts
git commit -m "feat(parse): assemble milestone tree from filtered events"
```

---

## Task 8: Failure marking and success path

**Files:**
- Create: `src/parse/failure.ts`
- Create: `tests/unit/parse/failure.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/parse/failure.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeSuccessPath, isTainted } from '../../../src/parse/failure';
import type { Milestone } from '../../../src/parse/types';

function ms(id: string, failed = false, children: Milestone[] = []): Milestone {
  return {
    id, kind: 'tool_call', label: id, summary: id,
    timestamp: '', failed, raw: null, children,
  };
}

describe('isTainted', () => {
  it('returns true when the milestone itself failed', () => {
    expect(isTainted(ms('a', true))).toBe(true);
  });

  it('returns true when any descendant failed', () => {
    const root = ms('a', false, [ms('b', false, [ms('c', true)])]);
    expect(isTainted(root)).toBe(true);
  });

  it('returns false when nothing failed', () => {
    const root = ms('a', false, [ms('b', false, [ms('c', false)])]);
    expect(isTainted(root)).toBe(false);
  });
});

describe('computeSuccessPath', () => {
  it('returns all ids on a clean linear chain', () => {
    const root = ms('a', false, [ms('b', false, [ms('c', false)])]);
    const sp = computeSuccessPath(root);
    expect(sp).toEqual(new Set(['a', 'b', 'c']));
  });

  it('excludes tainted subagent branches (first child of a two-child node)', () => {
    // a -> [subagent_branch_with_failure, main_continues]
    const sub = ms('sub', false, [ms('sub_fail', true)]);
    const main = ms('main', false);
    const root = ms('a', false, [sub, main]);
    const sp = computeSuccessPath(root);
    expect(sp).toEqual(new Set(['a', 'main']));
  });

  it('returns empty set when root failed', () => {
    const root = ms('a', true);
    const sp = computeSuccessPath(root);
    expect(sp).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- failure
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/parse/failure.ts`**

```typescript
import type { Milestone } from './types';

export function isTainted(node: Milestone): boolean {
  if (node.failed) return true;
  for (const c of node.children) {
    if (isTainted(c)) return true;
  }
  return false;
}

/**
 * Success path = root → final completion, skipping any tainted branch.
 * For a node with 2 children (subagent_spawn), prefer the non-tainted main
 * branch; if both are non-tainted (typical success case), include both.
 * For a node with 1 child, just follow.
 * If the node itself failed, contribute nothing.
 */
export function computeSuccessPath(root: Milestone): Set<string> {
  const path = new Set<string>();
  function walk(node: Milestone): void {
    if (node.failed) return;
    path.add(node.id);
    if (node.children.length === 0) return;
    if (node.children.length === 1) {
      if (!isTainted(node.children[0])) walk(node.children[0]);
      return;
    }
    // two children: [subagent_root, next_main]
    const [sub, next] = node.children;
    if (!isTainted(sub)) walk(sub);
    if (!isTainted(next)) walk(next);
  }
  walk(root);
  return path;
}

export function countMilestones(node: Milestone): number {
  let total = 1;
  for (const c of node.children) total += countMilestones(c);
  return total;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- failure
```

Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add src/parse/failure.ts tests/unit/parse/failure.test.ts
git commit -m "feat(parse): compute taint and success path"
```

---

## Task 9: Parser orchestrator (no subagents yet)

**Files:**
- Create: `src/parse/index.ts`

- [ ] **Step 1: Create `src/parse/index.ts`**

```typescript
import { buildChain } from './chain';
import { countMilestones, computeSuccessPath } from './failure';
import { filterNoise } from './filter';
import { buildMilestones } from './milestones';
import type { RawEvent, Session, SessionPayload } from './types';

function parseJsonl(jsonl: string): RawEvent[] {
  const out: RawEvent[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      out.push(JSON.parse(trimmed) as RawEvent);
    } catch {
      // ignore malformed lines; treat as schema drift
    }
  }
  return out;
}

export function parseSession(payload: SessionPayload): Session {
  const events = parseJsonl(payload.jsonl);
  const chain = buildChain(events);
  const clean = filterNoise(chain);
  const root = buildMilestones(clean);
  // Subagent attachment happens in Task 11.
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

export type { Milestone, Session, MilestoneKind, SessionMeta, SessionPayload } from './types';
```

- [ ] **Step 2: Add an integration-style test that exercises the orchestrator on a small JSONL string**

Create `tests/unit/parse/orchestrator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSession } from '../../../src/parse';

const jsonl = [
  JSON.stringify({
    uuid: '1', parentUuid: null, timestamp: '2026-05-21T00:00:00Z',
    type: 'user', message: { role: 'user', content: 'Please add a feature' },
  }),
  JSON.stringify({
    uuid: '2', parentUuid: '1', timestamp: '2026-05-21T00:00:01Z',
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'On it. Reading first.' }, { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: '/x.txt' } }] },
  }),
  JSON.stringify({
    uuid: '3', parentUuid: '2', timestamp: '2026-05-21T00:00:02Z',
    type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'hello\nworld\n', is_error: false }] },
  }),
  JSON.stringify({
    uuid: '4', parentUuid: '3', timestamp: '2026-05-21T00:00:03Z',
    type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'All done!' }] },
  }),
].join('\n');

describe('parseSession orchestrator', () => {
  it('returns a Session with expected structure', () => {
    const session = parseSession({
      projectId: 'p', sessionId: 's', cwd: '/proj', jsonl, subagents: [],
    });
    expect(session.id).toBe('s');
    expect(session.totalMilestones).toBe(4);
    expect(session.root.kind).toBe('root_prompt');
    // root -> assistant_turn -> tool_call -> completion
    const chain: string[] = [];
    let node = session.root;
    while (node) {
      chain.push(node.kind);
      node = node.children[0];
    }
    expect(chain).toEqual(['root_prompt', 'assistant_turn', 'tool_call', 'completion']);
    expect(session.successPath.size).toBe(4);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
npm test -- orchestrator
```

Expected: PASS (1 passed).

- [ ] **Step 4: Commit**

```bash
git add src/parse/index.ts tests/unit/parse/orchestrator.test.ts
git commit -m "feat(parse): orchestrator combining filter+chain+milestones+failure"
```

---

## Task 10: Vite plugin — session listing and JSONL serving

**Files:**
- Create: `server/vite-plugin-sessions.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: Create `server/vite-plugin-sessions.ts`**

```typescript
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Plugin, Connect } from 'vite';

type SessionMeta = {
  projectId: string;
  sessionId: string;
  cwd: string;
  startedAt: string;
  sizeBytes: number;
};

function claudeHome(): string {
  return process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.claude', 'projects');
}

function decodeProjectId(id: string): string {
  // Claude Code encodes paths like `C:\Users\foo\proj` -> `C--Users-foo-proj`.
  // Best-effort: replace double-dash with colon prefix (Windows), single dash with slash.
  if (/^[A-Za-z]--/.test(id)) {
    const driveLetter = id[0];
    const rest = id.slice(3).replace(/-/g, '/');
    return `${driveLetter}:/${rest}`;
  }
  return id.replace(/-/g, '/');
}

function sendJson(res: Parameters<Connect.NextHandleFunction>[1], status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function listSessions(root: string): Promise<SessionMeta[]> {
  let projects: string[];
  try {
    projects = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: SessionMeta[] = [];
  for (const projectId of projects) {
    const projectDir = path.join(root, projectId);
    let entries: string[];
    try {
      entries = await fs.readdir(projectDir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.jsonl')) continue;
      const full = path.join(projectDir, name);
      let stat;
      try {
        stat = await fs.stat(full);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      const sessionId = name.replace(/\.jsonl$/, '');
      out.push({
        projectId,
        sessionId,
        cwd: decodeProjectId(projectId),
        startedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
      });
    }
  }
  out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return out;
}

async function readSessionPayload(root: string, projectId: string, sessionId: string) {
  const projectDir = path.join(root, projectId);
  const sessionPath = path.join(projectDir, `${sessionId}.jsonl`);
  const jsonl = await fs.readFile(sessionPath, 'utf8');
  const subagents: { id: string; jsonl: string }[] = [];
  const subagentDir = path.join(projectDir, sessionId, 'subagents');
  try {
    const files = await fs.readdir(subagentDir);
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const content = await fs.readFile(path.join(subagentDir, f), 'utf8');
      subagents.push({ id: f.replace(/\.jsonl$/, ''), jsonl: content });
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

function isSafeId(s: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(s);
}

export function sessionsPlugin(): Plugin {
  const root = claudeHome();
  return {
    name: 'thoughtgraph:sessions',
    configureServer(server) {
      server.middlewares.use('/api/sessions', async (req, res, next) => {
        try {
          const url = req.url ?? '/';
          if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'method not allowed' });
            return;
          }
          if (url === '/' || url === '') {
            const sessions = await listSessions(root);
            sendJson(res, 200, { sessions });
            return;
          }
          const match = url.match(/^\/([^/]+)\/([^/?#]+)(?:[?#].*)?$/);
          if (!match) {
            sendJson(res, 400, { error: 'expected /api/sessions/:projectId/:sessionId' });
            return;
          }
          const [, projectId, sessionId] = match;
          if (!isSafeId(projectId) || !isSafeId(sessionId)) {
            sendJson(res, 400, { error: 'invalid id' });
            return;
          }
          const payload = await readSessionPayload(root, projectId, sessionId);
          sendJson(res, 200, payload);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            sendJson(res, 404, { error: 'not found' });
            return;
          }
          next(err as Error);
        }
      });
    },
  };
}
```

- [ ] **Step 2: Register the plugin in `vite.config.ts`**

Replace the file with:

```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sessionsPlugin } from './server/vite-plugin-sessions';

export default defineConfig({
  plugins: [react(), sessionsPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Boot dev server and verify endpoints by hand**

```bash
npm run dev
```

In another shell:

```bash
curl -s http://localhost:5173/api/sessions | head -c 500
```

Expected: JSON with `{"sessions":[...]}` listing real sessions from your `~/.claude/projects`. Pick one entry and verify a single session:

```bash
curl -s "http://localhost:5173/api/sessions/<projectId>/<sessionId>" | head -c 500
```

Expected: JSON with `jsonl` and `subagents` fields. Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add server/vite-plugin-sessions.ts vite.config.ts
git commit -m "feat(server): Vite plugin exposing /api/sessions"
```

---

## Task 11: Subagent attachment

**Files:**
- Create: `src/parse/subagents.ts`
- Modify: `src/parse/index.ts`
- Create: `tests/unit/parse/subagents.test.ts`

- [ ] **Step 1: Write failing test for subagent attachment**

Create `tests/unit/parse/subagents.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSession } from '../../../src/parse';

const mainJsonl = [
  JSON.stringify({
    uuid: 'u1', parentUuid: null, timestamp: 't0',
    type: 'user', message: { role: 'user', content: 'Delegate this' },
  }),
  JSON.stringify({
    uuid: 'u2', parentUuid: 'u1', timestamp: 't1',
    type: 'assistant',
    message: { role: 'assistant', content: [
      { type: 'tool_use', id: 'tu_task', name: 'Task',
        input: { subagent_type: 'Explore', description: 'find stuff', prompt: 'go' } },
    ] },
  }),
  JSON.stringify({
    uuid: 'u3', parentUuid: 'u2', timestamp: 't2',
    type: 'user', message: { role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_task', content: 'sub returned ok', is_error: false }] },
  }),
  JSON.stringify({
    uuid: 'u4', parentUuid: 'u3', timestamp: 't3',
    type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Continuing main.' }] },
  }),
].join('\n');

const subJsonl = [
  JSON.stringify({
    uuid: 's1', parentUuid: null, timestamp: 't1a', isSidechain: true,
    type: 'user', message: { role: 'user', content: 'go' },
    relatedToolUseId: 'tu_task',
  }),
  JSON.stringify({
    uuid: 's2', parentUuid: 's1', timestamp: 't1b', isSidechain: true,
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'Subagent thinking. Done.' }] },
  }),
].join('\n');

describe('subagent attachment', () => {
  it('attaches a subagent subtree as the first child of the spawn node', () => {
    const session = parseSession({
      projectId: 'p', sessionId: 's', cwd: '/proj', jsonl: mainJsonl,
      subagents: [{ id: 'agent-x', jsonl: subJsonl }],
    });
    // root -> subagent_spawn
    const spawn = session.root.children[0];
    expect(spawn.kind).toBe('subagent_spawn');
    // spawn.children = [subagent_root, next_main]
    expect(spawn.children.length).toBe(2);
    expect(spawn.children[0].kind).toBe('root_prompt');
    expect(spawn.children[0].summary).toBe('go');
    expect(spawn.children[1].kind).toBe('completion');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- subagents
```

Expected: FAIL — spawn has only one child (the next milestone), no subagent attachment yet.

- [ ] **Step 3: Implement `src/parse/subagents.ts`**

```typescript
import { buildChain } from './chain';
import { filterNoise } from './filter';
import { buildMilestones } from './milestones';
import type { Milestone, RawEvent } from './types';

export type SubagentFile = { id: string; jsonl: string };

function parseJsonl(jsonl: string): RawEvent[] {
  const out: RawEvent[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as RawEvent);
    } catch { /* ignore */ }
  }
  return out;
}

function buildSubagentRoot(jsonl: string): Milestone {
  const events = parseJsonl(jsonl);
  const chain = buildChain(events);
  const clean = filterNoise(chain);
  return buildMilestones(clean);
}

/**
 * Attach subagent subtrees to the matching `subagent_spawn` milestones.
 * Linkage: a subagent file is matched to a spawn by `relatedToolUseId`
 * in any of its events, or, if absent, by timestamp proximity (the first
 * subagent event timestamp must be ≥ the spawn's timestamp).
 */
export function attachSubagents(root: Milestone, subagents: SubagentFile[]): void {
  if (subagents.length === 0) return;

  // Map each subagent file -> (toolUseId | null, firstTimestamp, root milestone)
  const subInfos = subagents.map((sa) => {
    const events = parseJsonl(sa.jsonl);
    let toolUseId: string | null = null;
    for (const ev of events) {
      const rel = (ev as Record<string, unknown>).relatedToolUseId;
      if (typeof rel === 'string') { toolUseId = rel; break; }
    }
    const firstTs = events.find((e) => e.timestamp)?.timestamp ?? '';
    const subRoot = buildSubagentRoot(sa.jsonl);
    return { id: sa.id, toolUseId, firstTs, subRoot };
  });

  // Walk milestone tree, find subagent_spawn nodes, attach in DFS order.
  function walk(node: Milestone): void {
    if (node.kind === 'subagent_spawn') {
      const toolUseId = extractToolUseId(node.id);
      // Prefer id match
      let idx = subInfos.findIndex((s) => s.toolUseId && s.toolUseId === toolUseId);
      if (idx === -1) {
        // Fallback: nearest timestamp ≥ spawn timestamp
        idx = subInfos.findIndex(
          (s) => s.firstTs !== '' && node.timestamp !== '' && s.firstTs >= node.timestamp
        );
      }
      if (idx === -1 && subInfos.length > 0) {
        // last resort: take the first remaining
        idx = 0;
      }
      if (idx !== -1) {
        const [info] = subInfos.splice(idx, 1);
        // children was [next_main]; prepend subagent root.
        node.children = [info.subRoot, ...node.children];
      }
    }
    for (const c of node.children) walk(c);
  }

  walk(root);
}

function extractToolUseId(milestoneId: string): string | null {
  const idx = milestoneId.indexOf('#');
  return idx === -1 ? null : milestoneId.slice(idx + 1);
}
```

- [ ] **Step 4: Modify `src/parse/index.ts` to call `attachSubagents` and recompute success path**

Replace `src/parse/index.ts` with:

```typescript
import { buildChain } from './chain';
import { computeSuccessPath, countMilestones } from './failure';
import { filterNoise } from './filter';
import { buildMilestones } from './milestones';
import { attachSubagents } from './subagents';
import type { RawEvent, Session, SessionPayload } from './types';

function parseJsonl(jsonl: string): RawEvent[] {
  const out: RawEvent[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      out.push(JSON.parse(trimmed) as RawEvent);
    } catch {
      // ignore malformed lines; treat as schema drift
    }
  }
  return out;
}

export function parseSession(payload: SessionPayload): Session {
  const events = parseJsonl(payload.jsonl);
  const chain = buildChain(events);
  const clean = filterNoise(chain);
  const root = buildMilestones(clean);
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

export type { Milestone, Session, MilestoneKind, SessionMeta, SessionPayload } from './types';
```

- [ ] **Step 5: Run all parse tests**

```bash
npm test
```

Expected: PASS (all parse tests including subagents).

- [ ] **Step 6: Commit**

```bash
git add src/parse/subagents.ts src/parse/index.ts tests/unit/parse/subagents.test.ts
git commit -m "feat(parse): attach subagent subtrees to spawn milestones"
```

---

## Task 12: API client and TanStack Query hooks

**Files:**
- Create: `src/api/client.ts`
- Create: `src/api/hooks.ts`

- [ ] **Step 1: Create `src/api/client.ts`**

```typescript
import type { SessionMeta, SessionPayload } from '../parse/types';

export async function fetchSessionList(): Promise<SessionMeta[]> {
  const res = await fetch('/api/sessions');
  if (!res.ok) throw new Error(`session list failed: ${res.status}`);
  const json = (await res.json()) as { sessions: SessionMeta[] };
  return json.sessions;
}

export async function fetchSessionPayload(
  projectId: string,
  sessionId: string
): Promise<SessionPayload> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(`session fetch failed: ${res.status}`);
  return (await res.json()) as SessionPayload;
}
```

- [ ] **Step 2: Create `src/api/hooks.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchSessionList, fetchSessionPayload } from './client';
import { parseSession } from '../parse';
import type { Session } from '../parse/types';

export function useSessionList() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessionList,
  });
}

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

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/api/client.ts src/api/hooks.ts
git commit -m "feat(api): TanStack Query hooks for session list and payload"
```

---

## Task 13: Session list sidebar

**Files:**
- Create: `src/components/SessionList.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/SessionList.tsx`**

```typescript
import { useSessionList } from '../api/hooks';
import type { SessionMeta } from '../parse/types';

type Props = {
  selected: { projectId: string; sessionId: string } | null;
  onSelect: (s: SessionMeta) => void;
};

export function SessionList({ selected, onSelect }: Props) {
  const { data, isLoading, error } = useSessionList();

  return (
    <aside style={styles.aside}>
      <h2 style={styles.title}>SESSIONS</h2>
      {isLoading && <div style={styles.muted}>scanning…</div>}
      {error && <div style={styles.error}>error: {(error as Error).message}</div>}
      {data && data.length === 0 && <div style={styles.muted}>(none)</div>}
      <ul style={styles.list}>
        {data?.map((s) => {
          const isSelected = selected?.projectId === s.projectId && selected?.sessionId === s.sessionId;
          return (
            <li
              key={`${s.projectId}/${s.sessionId}`}
              onClick={() => onSelect(s)}
              style={{
                ...styles.item,
                ...(isSelected ? styles.itemSelected : {}),
              }}
            >
              <div style={styles.itemCwd}>{s.cwd}</div>
              <div style={styles.itemMeta}>
                {new Date(s.startedAt).toLocaleString()} · {Math.round(s.sizeBytes / 1024)}KB
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

const styles = {
  aside: {
    width: 280,
    height: '100%',
    borderRight: '1px solid var(--grid)',
    overflowY: 'auto' as const,
    padding: '16px 0',
  },
  title: {
    margin: 0,
    padding: '0 16px 12px',
    fontSize: 11,
    letterSpacing: 3,
    color: 'var(--text-dim)',
    fontWeight: 400,
  },
  list: { listStyle: 'none', padding: 0, margin: 0 },
  item: {
    padding: '10px 16px',
    cursor: 'pointer',
    borderLeft: '2px solid transparent',
  },
  itemSelected: {
    borderLeftColor: 'var(--edge-trail)',
    background: 'rgba(0, 229, 255, 0.04)',
  },
  itemCwd: {
    fontSize: 12,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  itemMeta: { fontSize: 10, color: 'var(--text-dim)', marginTop: 2 },
  muted: { padding: '0 16px', color: 'var(--text-dim)', fontSize: 12 },
  error: { padding: '0 16px', color: 'var(--node-failed)', fontSize: 12 },
};
```

- [ ] **Step 2: Replace `src/App.tsx`**

```typescript
import { useState } from 'react';
import { SessionList } from './components/SessionList';
import type { SessionMeta } from './parse/types';

type Selected = { projectId: string; sessionId: string } | null;

export default function App() {
  const [selected, setSelected] = useState<Selected>(null);

  function handleSelect(s: SessionMeta) {
    setSelected({ projectId: s.projectId, sessionId: s.sessionId });
  }

  return (
    <div style={styles.shell}>
      <SessionList selected={selected} onSelect={handleSelect} />
      <main style={styles.main}>
        {!selected && <div style={styles.empty}>SELECT A SESSION</div>}
        {selected && <div style={styles.empty}>SESSION {selected.sessionId.slice(0, 8)} (graph not yet rendered)</div>}
      </main>
    </div>
  );
}

const styles = {
  shell: { display: 'flex', height: '100%' },
  main: { flex: 1, position: 'relative' as const },
  empty: {
    position: 'absolute' as const, inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-dim)', letterSpacing: 4,
  },
};
```

- [ ] **Step 3: Run dev server, visually verify sidebar populates**

```bash
npm run dev
```

Open http://localhost:5173. Expected: left sidebar lists your real Claude Code sessions; clicking one highlights it and shows the placeholder. Stop server.

- [ ] **Step 4: Commit**

```bash
git add src/components/SessionList.tsx src/App.tsx
git commit -m "feat(ui): session list sidebar wired to /api/sessions"
```

---

## Task 14: D3 tree layout adapter

**Files:**
- Create: `src/graph/layout.ts`
- Create: `tests/unit/graph/layout.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/graph/layout.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { layoutTree } from '../../../src/graph/layout';
import type { Milestone } from '../../../src/parse/types';

function ms(id: string, children: Milestone[] = []): Milestone {
  return {
    id, kind: 'tool_call', label: id, summary: id,
    timestamp: '', failed: false, raw: null, children,
  };
}

describe('layoutTree', () => {
  it('produces one node per milestone and N-1 edges for a linear tree', () => {
    const root = ms('a', [ms('b', [ms('c')])]);
    const { nodes, edges } = layoutTree(root);
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);
  });

  it('node positions advance vertically as depth increases', () => {
    const root = ms('a', [ms('b', [ms('c')])]);
    const { nodes } = layoutTree(root);
    const a = nodes.find((n) => n.id === 'a')!;
    const b = nodes.find((n) => n.id === 'b')!;
    const c = nodes.find((n) => n.id === 'c')!;
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y);
  });

  it('edges reference nodes by id', () => {
    const root = ms('a', [ms('b')]);
    const { edges } = layoutTree(root);
    expect(edges[0].sourceId).toBe('a');
    expect(edges[0].targetId).toBe('b');
  });

  it('handles a two-child node (subagent_spawn)', () => {
    const root = ms('a', [ms('sub'), ms('next')]);
    const { nodes, edges } = layoutTree(root);
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);
    const sub = nodes.find((n) => n.id === 'sub')!;
    const next = nodes.find((n) => n.id === 'next')!;
    expect(sub.x).not.toBe(next.x);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- layout
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/graph/layout.ts`**

```typescript
import { hierarchy, tree as d3tree } from 'd3';
import type { Milestone } from '../parse/types';

export type LaidOutNode = {
  id: string;
  milestone: Milestone;
  x: number;
  y: number;
  depth: number;
};

export type LaidOutEdge = {
  sourceId: string;
  targetId: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
};

export type LayoutResult = {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
};

const NODE_X_SPACING = 140;
const NODE_Y_SPACING = 110;

export function layoutTree(root: Milestone): LayoutResult {
  const h = hierarchy<Milestone>(root, (d) => d.children);
  const layout = d3tree<Milestone>().nodeSize([NODE_X_SPACING, NODE_Y_SPACING]);
  const laid = layout(h);

  const nodes: LaidOutNode[] = [];
  const edges: LaidOutEdge[] = [];
  let minX = Infinity, maxX = -Infinity, maxY = -Infinity;

  laid.each((d) => {
    nodes.push({ id: d.data.id, milestone: d.data, x: d.x, y: d.y, depth: d.depth });
    if (d.x < minX) minX = d.x;
    if (d.x > maxX) maxX = d.x;
    if (d.y > maxY) maxY = d.y;
  });

  laid.eachBefore((d) => {
    if (!d.parent) return;
    edges.push({
      sourceId: d.parent.data.id,
      targetId: d.data.id,
      sourceX: d.parent.x,
      sourceY: d.parent.y,
      targetX: d.x,
      targetY: d.y,
    });
  });

  // Normalize x so minX = 0
  const xShift = -minX + 60; // 60px left padding
  for (const n of nodes) n.x += xShift;
  for (const e of edges) {
    e.sourceX += xShift;
    e.targetX += xShift;
  }

  return {
    nodes,
    edges,
    width: (maxX - minX) + 120,
    height: maxY + 120,
  };
}
```

- [ ] **Step 4: Update the test to also import from `'d3'`**

Edit `tests/unit/graph/layout.test.ts` if it imports from `d3-hierarchy`; the layout module imports from the `d3` umbrella, so the test does not need direct access to `d3-hierarchy`.

- [ ] **Step 5: Run test**

```bash
npm test -- layout
```

Expected: PASS (4 passed).

- [ ] **Step 6: Commit**

```bash
git add src/graph/layout.ts tests/unit/graph/layout.test.ts
git commit -m "feat(graph): D3 tree layout adapter"
```

(Note: the `d3` umbrella package re-exports `hierarchy` and `tree` from `d3-hierarchy`. No separate dep install is needed.)

---

## Task 15: Static graph rendering

**Files:**
- Create: `src/theme/Filters.tsx`
- Create: `src/components/NodeShape.tsx`
- Create: `src/components/EdgePath.tsx`
- Create: `src/components/GraphCanvas.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/theme/Filters.tsx`**

```typescript
export function GraphDefs() {
  return (
    <defs>
      <filter id="tg-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="tg-glow-hard" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}
```

- [ ] **Step 2: Create `src/components/NodeShape.tsx`**

```typescript
import type { LaidOutNode } from '../graph/layout';

type Props = {
  node: LaidOutNode;
  state: 'idle' | 'active' | 'success' | 'failed' | 'pruned';
  inSubagent: boolean;
};

function glyphFor(kind: LaidOutNode['milestone']['kind']): string {
  switch (kind) {
    case 'root_prompt': return '>';
    case 'user_followup': return '>';
    case 'assistant_turn': return '·';
    case 'tool_call': return '⚙';
    case 'subagent_spawn': return '⌥';
    case 'completion': return '■';
  }
}

export function NodeShape({ node, state, inSubagent }: Props) {
  const w = 110, h = 28;
  const colors = colorsFor(state, inSubagent);

  return (
    <g transform={`translate(${node.x - w / 2}, ${node.y - h / 2})`} data-id={node.id} data-state={state}>
      {state === 'active' || state === 'success' ? (
        <rect width={w} height={h} rx={4} fill={colors.fill} stroke={colors.stroke} strokeWidth={1}
              filter="url(#tg-glow)" opacity={0.95} />
      ) : (
        <rect width={w} height={h} rx={4} fill={colors.fill} stroke={colors.stroke} strokeWidth={1}
              opacity={state === 'pruned' ? 0.35 : 0.95} />
      )}
      <text x={8} y={h / 2 + 4} fontSize={11} fill={colors.text} fontFamily="ui-monospace, monospace">
        {glyphFor(node.milestone.kind)}  {node.milestone.label}
      </text>
      {state === 'failed' && (
        <circle cx={w - 6} cy={6} r={3} fill="var(--node-failed)" filter="url(#tg-glow)" />
      )}
    </g>
  );
}

function colorsFor(state: Props['state'], inSubagent: boolean) {
  const stroke = inSubagent ? 'var(--subagent-accent)' : 'var(--edge-idle)';
  switch (state) {
    case 'idle':
      return { fill: 'var(--node-idle)', stroke, text: 'var(--text)' };
    case 'active':
      return { fill: 'var(--node-active)', stroke: 'var(--node-active)', text: '#001017' };
    case 'success':
      return { fill: 'var(--node-idle)', stroke: 'var(--node-success)', text: 'var(--node-success)' };
    case 'failed':
      return { fill: 'var(--node-idle)', stroke: 'var(--node-failed)', text: 'var(--node-failed)' };
    case 'pruned':
      return { fill: 'var(--node-pruned)', stroke: 'var(--node-pruned)', text: 'var(--text-dim)' };
  }
}
```

- [ ] **Step 3: Create `src/components/EdgePath.tsx`**

```typescript
import type { LaidOutEdge } from '../graph/layout';

type Props = {
  edge: LaidOutEdge;
  state: 'idle' | 'drawing' | 'done' | 'pruned';
  progress: number; // 0..1, only used when state==='drawing'
  inSubagent: boolean;
};

export function EdgePath({ edge, state, progress, inSubagent }: Props) {
  const d = curvePath(edge);
  const stroke =
    state === 'pruned'
      ? 'var(--node-pruned)'
      : inSubagent
      ? 'var(--subagent-accent)'
      : state === 'idle'
      ? 'var(--edge-idle)'
      : 'var(--edge-trail)';
  const dashArray = state === 'drawing' ? `${pathLength(edge)}` : undefined;
  const dashOffset = state === 'drawing' ? pathLength(edge) * (1 - progress) : 0;
  const opacity = state === 'pruned' ? 0.3 : state === 'idle' ? 0.5 : 1;
  const strokeWidth = inSubagent ? 1.5 : 2;
  const dasharray = inSubagent && state !== 'drawing' ? '6 4' : dashArray;

  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={dasharray}
      strokeDashoffset={dashOffset}
      opacity={opacity}
      filter={state === 'drawing' || state === 'done' ? 'url(#tg-glow)' : undefined}
    />
  );
}

function curvePath(edge: LaidOutEdge): string {
  const mid = (edge.sourceY + edge.targetY) / 2;
  return `M ${edge.sourceX} ${edge.sourceY} C ${edge.sourceX} ${mid}, ${edge.targetX} ${mid}, ${edge.targetX} ${edge.targetY}`;
}

function pathLength(edge: LaidOutEdge): number {
  const dx = edge.targetX - edge.sourceX;
  const dy = edge.targetY - edge.sourceY;
  return Math.sqrt(dx * dx + dy * dy) * 1.15;
}
```

- [ ] **Step 4: Create `src/components/GraphCanvas.tsx` (static rendering for now)**

```typescript
import { useMemo } from 'react';
import { layoutTree } from '../graph/layout';
import { GraphDefs } from '../theme/Filters';
import { NodeShape } from './NodeShape';
import { EdgePath } from './EdgePath';
import type { Session } from '../parse/types';

type Props = { session: Session };

export function GraphCanvas({ session }: Props) {
  const layout = useMemo(() => layoutTree(session.root), [session]);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ display: 'block' }}
    >
      <GraphDefs />
      {layout.edges.map((e) => (
        <EdgePath key={`${e.sourceId}->${e.targetId}`} edge={e} state="idle" progress={0} inSubagent={false} />
      ))}
      {layout.nodes.map((n) => (
        <NodeShape key={n.id} node={n} state="idle" inSubagent={false} />
      ))}
    </svg>
  );
}
```

- [ ] **Step 5: Replace `src/App.tsx`**

```typescript
import { useState } from 'react';
import { SessionList } from './components/SessionList';
import { GraphCanvas } from './components/GraphCanvas';
import { useSession } from './api/hooks';
import type { SessionMeta } from './parse/types';

type Selected = { projectId: string; sessionId: string } | null;

export default function App() {
  const [selected, setSelected] = useState<Selected>(null);
  const { data: session, isLoading, error } = useSession(
    selected?.projectId ?? null,
    selected?.sessionId ?? null
  );

  return (
    <div style={styles.shell}>
      <SessionList selected={selected} onSelect={(s: SessionMeta) => setSelected({ projectId: s.projectId, sessionId: s.sessionId })} />
      <main style={styles.main}>
        {!selected && <div style={styles.empty}>SELECT A SESSION</div>}
        {selected && isLoading && <div style={styles.empty}>LOADING…</div>}
        {selected && error && <div style={styles.error}>error: {(error as Error).message}</div>}
        {session && <GraphCanvas session={session} />}
      </main>
    </div>
  );
}

const styles = {
  shell: { display: 'flex', height: '100%' },
  main: { flex: 1, position: 'relative' as const, overflow: 'hidden' as const },
  empty: {
    position: 'absolute' as const, inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-dim)', letterSpacing: 4,
  },
  error: { padding: 24, color: 'var(--node-failed)' },
};
```

- [ ] **Step 6: Manual verify**

```bash
npm run dev
```

Open the app, pick a session. Expected: a tree of cyan-outlined nodes appears with edges connecting them. Stop server.

- [ ] **Step 7: Commit**

```bash
git add src/theme/Filters.tsx src/components/NodeShape.tsx src/components/EdgePath.tsx src/components/GraphCanvas.tsx src/App.tsx
git commit -m "feat(ui): static graph render with TRON-styled nodes and edges"
```

---

## Task 16: Playback hook (depth-first traversal order)

**Files:**
- Create: `src/playback/usePlayback.ts`
- Create: `tests/unit/playback.test.ts`

- [ ] **Step 1: Write failing test for DFS order**

Create `tests/unit/playback.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { flattenDFS } from '../../src/playback/usePlayback';
import type { Milestone } from '../../src/parse/types';

function ms(id: string, children: Milestone[] = []): Milestone {
  return {
    id, kind: 'tool_call', label: id, summary: id,
    timestamp: '', failed: false, raw: null, children,
  };
}

describe('flattenDFS', () => {
  it('linear tree -> in-order ids', () => {
    const root = ms('a', [ms('b', [ms('c')])]);
    expect(flattenDFS(root).map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('subagent spawn (2 children) -> subagent subtree visited before main next', () => {
    // a -> [sub_root -> sub_leaf, next_main -> done]
    const sub = ms('sub_root', [ms('sub_leaf')]);
    const main = ms('next_main', [ms('done')]);
    const spawn = ms('spawn', [sub, main]);
    const root = ms('root', [spawn]);
    expect(flattenDFS(root).map((n) => n.id)).toEqual([
      'root',
      'spawn',
      'sub_root',
      'sub_leaf',
      'next_main',
      'done',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- playback
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/playback/usePlayback.ts`**

```typescript
import { useEffect, useRef, useState } from 'react';
import type { Milestone } from '../parse/types';

export type Speed = 1 | 2 | 4;

export function flattenDFS(root: Milestone): Milestone[] {
  const out: Milestone[] = [];
  function walk(node: Milestone): void {
    out.push(node);
    for (const c of node.children) walk(c);
  }
  walk(root);
  return out;
}

const BASE_MS_PER_NODE = 200;

export type PlaybackState = {
  order: Milestone[];
  index: number;     // index of "current" milestone (head of trail)
  edgeProgress: number; // 0..1 progress of the trail along the edge into the current node
  playing: boolean;
  speed: Speed;
  finished: boolean;
};

export type PlaybackControls = {
  play(): void;
  pause(): void;
  toggle(): void;
  setSpeed(s: Speed): void;
  restart(): void;
};

export function usePlayback(root: Milestone | null): { state: PlaybackState; controls: PlaybackControls } {
  const [order, setOrder] = useState<Milestone[]>([]);
  const [index, setIndex] = useState(0);
  const [edgeProgress, setEdgeProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!root) { setOrder([]); setIndex(0); setEdgeProgress(0); return; }
    const flat = flattenDFS(root);
    setOrder(flat);
    setIndex(0);
    setEdgeProgress(0);
    setPlaying(true);
  }, [root]);

  useEffect(() => {
    if (!playing || order.length === 0) return;
    lastTickRef.current = null;
    function tick(now: number) {
      if (lastTickRef.current == null) lastTickRef.current = now;
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;

      const msPerNode = BASE_MS_PER_NODE / speed;
      setEdgeProgress((prev) => {
        const next = prev + dt / msPerNode;
        if (next >= 1) {
          setIndex((idx) => Math.min(idx + 1, order.length - 1));
          return 0;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, order, speed]);

  useEffect(() => {
    if (index >= order.length - 1 && edgeProgress >= 0.999) {
      setPlaying(false);
    }
  }, [index, edgeProgress, order.length]);

  const controls: PlaybackControls = {
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    toggle: () => setPlaying((p) => !p),
    setSpeed: (s) => setSpeed(s),
    restart: () => { setIndex(0); setEdgeProgress(0); setPlaying(true); },
  };

  return {
    state: {
      order, index, edgeProgress, playing, speed,
      finished: order.length > 0 && index >= order.length - 1 && edgeProgress >= 0.999,
    },
    controls,
  };
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- playback
```

Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add src/playback/usePlayback.ts tests/unit/playback.test.ts
git commit -m "feat(playback): DFS traversal order + raf-driven clock"
```

---

## Task 17: Trail animation in the canvas

**Files:**
- Modify: `src/components/GraphCanvas.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace `src/components/GraphCanvas.tsx`**

```typescript
import { useMemo } from 'react';
import { layoutTree, type LaidOutNode } from '../graph/layout';
import { GraphDefs } from '../theme/Filters';
import { NodeShape } from './NodeShape';
import { EdgePath } from './EdgePath';
import type { Milestone, Session } from '../parse/types';
import type { PlaybackState } from '../playback/usePlayback';

type Props = { session: Session; playback: PlaybackState; subagentIds: Set<string> };

type SubagentRegion = { x: number; y: number; width: number; height: number };

function collectDescendantIds(node: Milestone): string[] {
  const ids = [node.id];
  for (const c of node.children) ids.push(...collectDescendantIds(c));
  return ids;
}

function computeSubagentRegions(root: Milestone, nodes: LaidOutNode[]): SubagentRegion[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const regions: SubagentRegion[] = [];
  function walk(node: Milestone): void {
    if (node.kind === 'subagent_spawn' && node.children[0]) {
      const ids = collectDescendantIds(node.children[0]);
      const positions = ids
        .map((id) => byId.get(id))
        .filter((n): n is LaidOutNode => n !== undefined);
      if (positions.length > 0) {
        const xs = positions.map((p) => p.x);
        const ys = positions.map((p) => p.y);
        regions.push({
          x: Math.min(...xs) - 70,
          y: Math.min(...ys) - 20,
          width: Math.max(...xs) - Math.min(...xs) + 140,
          height: Math.max(...ys) - Math.min(...ys) + 50,
        });
      }
    }
    for (const c of node.children) walk(c);
  }
  walk(root);
  return regions;
}

export function GraphCanvas({ session, playback, subagentIds }: Props) {
  const layout = useMemo(() => layoutTree(session.root), [session]);
  const subagentRegions = useMemo(
    () => computeSubagentRegions(session.root, layout.nodes),
    [session, layout]
  );

  const currentId = playback.order[playback.index]?.id;
  const traversedIds = new Set(playback.order.slice(0, playback.index + 1).map((m) => m.id));
  const successIds = session.successPath;

  const traversedEdgeKey =
    playback.index > 0
      ? `${playback.order[playback.index - 1].id}->${playback.order[playback.index].id}`
      : null;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ display: 'block' }}
    >
      <GraphDefs />
      {subagentRegions.map((r, i) => (
        <rect
          key={`sg-region-${i}`}
          x={r.x}
          y={r.y}
          width={r.width}
          height={r.height}
          fill="var(--subagent-accent)"
          fillOpacity={0.05}
          stroke="var(--subagent-accent)"
          strokeOpacity={0.25}
          strokeWidth={1}
          rx={8}
          data-testid="subagent-region"
        />
      ))}
      {layout.edges.map((e) => {
        const key = `${e.sourceId}->${e.targetId}`;
        const isTraversed = traversedIds.has(e.targetId);
        const isCurrent = key === traversedEdgeKey;
        const inSub = subagentIds.has(e.targetId);
        const state = isCurrent ? 'drawing' : isTraversed ? 'done' : 'idle';
        return (
          <EdgePath
            key={key}
            edge={e}
            state={state}
            progress={isCurrent ? playback.edgeProgress : isTraversed ? 1 : 0}
            inSubagent={inSub}
          />
        );
      })}
      {layout.nodes.map((n) => {
        const inSub = subagentIds.has(n.id);
        let state: 'idle' | 'active' | 'success' | 'failed' | 'pruned';
        if (n.milestone.failed) state = 'failed';
        else if (n.id === currentId) state = 'active';
        else if (playback.finished && successIds.has(n.id)) state = 'success';
        else if (traversedIds.has(n.id)) state = 'success';
        else state = 'idle';
        return <NodeShape key={n.id} node={n} state={state} inSubagent={inSub} />;
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Update `src/App.tsx` to wire playback**

```typescript
import { useMemo, useState } from 'react';
import { SessionList } from './components/SessionList';
import { GraphCanvas } from './components/GraphCanvas';
import { useSession } from './api/hooks';
import { usePlayback } from './playback/usePlayback';
import type { Milestone, SessionMeta } from './parse/types';

type Selected = { projectId: string; sessionId: string } | null;

function collectSubagentIds(root: Milestone): Set<string> {
  const ids = new Set<string>();
  function walk(node: Milestone, inSub: boolean): void {
    if (inSub) ids.add(node.id);
    if (node.kind === 'subagent_spawn' && node.children.length >= 1) {
      walk(node.children[0], true);
      if (node.children[1]) walk(node.children[1], inSub);
      return;
    }
    for (const c of node.children) walk(c, inSub);
  }
  walk(root, false);
  return ids;
}

export default function App() {
  const [selected, setSelected] = useState<Selected>(null);
  const { data: session, isLoading, error } = useSession(
    selected?.projectId ?? null,
    selected?.sessionId ?? null
  );
  const { state: playback } = usePlayback(session?.root ?? null);
  const subagentIds = useMemo(
    () => (session ? collectSubagentIds(session.root) : new Set<string>()),
    [session]
  );

  return (
    <div style={styles.shell}>
      <SessionList
        selected={selected}
        onSelect={(s: SessionMeta) => setSelected({ projectId: s.projectId, sessionId: s.sessionId })}
      />
      <main style={styles.main}>
        {!selected && <div style={styles.empty}>SELECT A SESSION</div>}
        {selected && isLoading && <div style={styles.empty}>LOADING…</div>}
        {selected && error && <div style={styles.error}>error: {(error as Error).message}</div>}
        {session && <GraphCanvas session={session} playback={playback} subagentIds={subagentIds} />}
      </main>
    </div>
  );
}

const styles = {
  shell: { display: 'flex', height: '100%' },
  main: { flex: 1, position: 'relative' as const, overflow: 'hidden' as const },
  empty: {
    position: 'absolute' as const, inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-dim)', letterSpacing: 4,
  },
  error: { padding: 24, color: 'var(--node-failed)' },
};
```

- [ ] **Step 3: Manual verify**

```bash
npm run dev
```

Open a session. Expected: trail animates downward through nodes; reached nodes turn cyan; current node has the glowing halo; final node settles. Stop server.

- [ ] **Step 4: Commit**

```bash
git add src/components/GraphCanvas.tsx src/App.tsx
git commit -m "feat(playback): animated trail traversal on the graph canvas"
```

---

## Task 18: HUD readout (NowPlaying)

**Files:**
- Create: `src/components/NowPlaying.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/NowPlaying.tsx`**

```typescript
import { useEffect, useState } from 'react';
import type { Milestone } from '../parse/types';

type Props = {
  current: Milestone | null;
  edgeProgress: number;
  inSubagent: boolean;
};

function useTypewriter(text: string, durationMs: number): string {
  const [out, setOut] = useState('');
  useEffect(() => {
    if (!text) { setOut(''); return; }
    setOut('');
    const start = performance.now();
    let raf = 0;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const len = Math.floor(text.length * t);
      setOut(text.slice(0, len));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, durationMs]);
  return out;
}

export function NowPlaying({ current, edgeProgress, inSubagent }: Props) {
  const summaryText = current?.summary ?? '';
  const resultText = edgeProgress >= 0.6 ? (current?.result ?? '') : '';
  const summary = useTypewriter(summaryText, 180);
  const result = useTypewriter(resultText, 220);
  if (!current) return null;
  const failed = current.failed;
  const frameColor = inSubagent ? 'var(--subagent-accent)' : 'var(--edge-idle)';

  return (
    <div style={{
      ...styles.frame,
      borderColor: frameColor,
      boxShadow: inSubagent ? '0 0 24px rgba(157,108,255,0.25)' : 'none',
    }}>
      {inSubagent && (
        <div style={{ ...styles.header, color: 'var(--subagent-accent)' }}>⌥ SUBAGENT</div>
      )}
      <div style={{ ...styles.line1, color: failed ? 'var(--node-failed)' : 'var(--edge-trail)' }}>
        {summary || ' '}
      </div>
      <div style={{ ...styles.line2, color: failed ? 'var(--node-failed)' : 'var(--text-dim)' }}>
        {result || ' '}
      </div>
    </div>
  );
}

const styles = {
  frame: {
    position: 'absolute' as const,
    left: '50%',
    bottom: 80,
    transform: 'translateX(-50%)',
    minWidth: 520,
    maxWidth: '70%',
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid',
    padding: '10px 16px',
    fontFamily: 'ui-monospace, monospace',
    backdropFilter: 'blur(2px)',
  },
  header: { fontSize: 10, letterSpacing: 3, marginBottom: 4 },
  line1: { fontSize: 13, fontWeight: 500, minHeight: 18 },
  line2: { fontSize: 11, minHeight: 16, marginTop: 2 },
};
```

- [ ] **Step 2: Update `src/App.tsx` to mount NowPlaying**

Add the import and usage. Replace `src/App.tsx`:

```typescript
import { useMemo, useState } from 'react';
import { SessionList } from './components/SessionList';
import { GraphCanvas } from './components/GraphCanvas';
import { NowPlaying } from './components/NowPlaying';
import { useSession } from './api/hooks';
import { usePlayback } from './playback/usePlayback';
import type { Milestone, SessionMeta } from './parse/types';

type Selected = { projectId: string; sessionId: string } | null;

function collectSubagentIds(root: Milestone): Set<string> {
  const ids = new Set<string>();
  function walk(node: Milestone, inSub: boolean): void {
    if (inSub) ids.add(node.id);
    if (node.kind === 'subagent_spawn' && node.children.length >= 1) {
      walk(node.children[0], true);
      if (node.children[1]) walk(node.children[1], inSub);
      return;
    }
    for (const c of node.children) walk(c, inSub);
  }
  walk(root, false);
  return ids;
}

export default function App() {
  const [selected, setSelected] = useState<Selected>(null);
  const { data: session, isLoading, error } = useSession(
    selected?.projectId ?? null,
    selected?.sessionId ?? null
  );
  const { state: playback } = usePlayback(session?.root ?? null);
  const subagentIds = useMemo(
    () => (session ? collectSubagentIds(session.root) : new Set<string>()),
    [session]
  );

  const currentMilestone = playback.order[playback.index] ?? null;
  const inSubagent = currentMilestone ? subagentIds.has(currentMilestone.id) : false;

  return (
    <div style={styles.shell}>
      <SessionList
        selected={selected}
        onSelect={(s: SessionMeta) => setSelected({ projectId: s.projectId, sessionId: s.sessionId })}
      />
      <main style={styles.main}>
        {!selected && <div style={styles.empty}>SELECT A SESSION</div>}
        {selected && isLoading && <div style={styles.empty}>LOADING…</div>}
        {selected && error && <div style={styles.error}>error: {(error as Error).message}</div>}
        {session && (
          <>
            <div style={styles.sessionHeader} data-testid="session-header">
              <div style={styles.sessionTitle}>SESSION {session.id.slice(0, 8)}</div>
              <div style={styles.sessionCwd}>{session.cwd}</div>
            </div>
            <GraphCanvas session={session} playback={playback} subagentIds={subagentIds} />
            <NowPlaying current={currentMilestone} edgeProgress={playback.edgeProgress} inSubagent={inSubagent} />
          </>
        )}
      </main>
    </div>
  );
}

const styles = {
  shell: { display: 'flex', height: '100%' },
  main: { flex: 1, position: 'relative' as const, overflow: 'hidden' as const },
  empty: {
    position: 'absolute' as const, inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-dim)', letterSpacing: 4,
  },
  error: { padding: 24, color: 'var(--node-failed)' },
  sessionHeader: {
    position: 'absolute' as const,
    top: 16,
    left: 24,
    zIndex: 5,
    pointerEvents: 'none' as const,
  },
  sessionTitle: {
    fontSize: 11,
    letterSpacing: 3,
    color: 'var(--edge-trail)',
    fontFamily: 'ui-monospace, monospace',
  },
  sessionCwd: {
    fontSize: 11,
    color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
    marginTop: 2,
  },
};
```

- [ ] **Step 3: Manual verify**

```bash
npm run dev
```

Open a session. Expected: HUD strip appears at the bottom; summary line types in as trail enters each node; result line follows. Top-left shows session ID and cwd. Stop server.

- [ ] **Step 4: Commit**

```bash
git add src/components/NowPlaying.tsx src/App.tsx
git commit -m "feat(ui): two-line HUD readout with typewriter cadence"
```

---

## Task 19: Playback controls

**Files:**
- Create: `src/components/PlaybackControls.tsx`
- Modify: `src/playback/usePlayback.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Modify `usePlayback` to also export the controls object directly**

The hook already returns `{ state, controls }`. No code change required if you implemented it as in Task 16. Confirm by checking the file.

- [ ] **Step 2: Create `src/components/PlaybackControls.tsx`**

```typescript
import type { PlaybackControls as Controls, PlaybackState, Speed } from '../playback/usePlayback';

type Props = { state: PlaybackState; controls: Controls };

export function PlaybackControls({ state, controls }: Props) {
  return (
    <div style={styles.bar}>
      <button onClick={controls.toggle} style={styles.btn} data-testid="play-toggle">
        {state.playing ? '❚❚' : '▶'}
      </button>
      <div style={styles.speedGroup} role="group" aria-label="speed">
        {([1, 2, 4] as Speed[]).map((s) => (
          <button
            key={s}
            onClick={() => controls.setSpeed(s)}
            style={{
              ...styles.speed,
              ...(state.speed === s ? styles.speedActive : {}),
            }}
            data-testid={`speed-${s}`}
          >
            {s}×
          </button>
        ))}
      </div>
      <button onClick={controls.restart} style={styles.btn} data-testid="restart">↺</button>
    </div>
  );
}

const styles = {
  bar: {
    position: 'absolute' as const,
    left: '50%',
    bottom: 24,
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid var(--edge-idle)',
    padding: '6px 10px',
    fontFamily: 'ui-monospace, monospace',
  },
  btn: {
    background: 'transparent',
    border: '1px solid var(--edge-idle)',
    color: 'var(--text)',
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
  },
  speedGroup: { display: 'flex' },
  speed: {
    background: 'transparent',
    border: '1px solid var(--edge-idle)',
    color: 'var(--text-dim)',
    padding: '4px 8px',
    marginLeft: -1,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
  },
  speedActive: {
    color: 'var(--edge-trail)',
    borderColor: 'var(--edge-trail)',
  },
};
```

- [ ] **Step 3: Wire controls into `src/App.tsx`**

Replace the `usePlayback` line and the JSX to expose controls:

In the imports add:

```typescript
import { PlaybackControls } from './components/PlaybackControls';
```

Replace the usePlayback line:

```typescript
const { state: playback, controls } = usePlayback(session?.root ?? null);
```

And inside the `{session && (` JSX block, add the controls component below `<NowPlaying ... />`:

```typescript
<PlaybackControls state={playback} controls={controls} />
```

- [ ] **Step 4: Manual verify**

```bash
npm run dev
```

Expected: play/pause toggles trail movement; 1×/2×/4× changes speed visibly; restart returns to start. Stop server.

- [ ] **Step 5: Commit**

```bash
git add src/components/PlaybackControls.tsx src/App.tsx
git commit -m "feat(ui): play/pause + speed controls + restart"
```

---

## Task 20: Failure visualization polish

The node and edge components already render `failed` nodes red and pruned branches dim from Task 15+17, BUT pruned tainted branches are not yet styled as pruned (they fall through to `idle`). Fix that.

**Files:**
- Modify: `src/components/GraphCanvas.tsx`
- Modify: `src/parse/failure.ts`

- [ ] **Step 1: Add `tainted` helper that returns the set of milestone ids on tainted branches**

Modify `src/parse/failure.ts` — add a new export at the end:

```typescript
export function collectTaintedIds(root: Milestone): Set<string> {
  const ids = new Set<string>();
  function markSubtree(node: Milestone): void {
    ids.add(node.id);
    for (const c of node.children) markSubtree(c);
  }
  function walk(node: Milestone): void {
    if (node.children.length === 0) return;
    if (node.children.length === 1) {
      if (isTainted(node.children[0])) markSubtree(node.children[0]);
      else walk(node.children[0]);
      return;
    }
    const [sub, next] = node.children;
    if (isTainted(sub)) markSubtree(sub);
    else walk(sub);
    if (isTainted(next)) markSubtree(next);
    else walk(next);
  }
  walk(root);
  return ids;
}
```

- [ ] **Step 2: Update `src/components/GraphCanvas.tsx` to consume tainted ids**

Update the props and the state logic:

```typescript
import { useMemo } from 'react';
import { layoutTree } from '../graph/layout';
import { GraphDefs } from '../theme/Filters';
import { NodeShape } from './NodeShape';
import { EdgePath } from './EdgePath';
import type { Session } from '../parse/types';
import type { PlaybackState } from '../playback/usePlayback';
import { collectTaintedIds } from '../parse/failure';

type Props = { session: Session; playback: PlaybackState; subagentIds: Set<string> };

export function GraphCanvas({ session, playback, subagentIds }: Props) {
  const layout = useMemo(() => layoutTree(session.root), [session]);
  const taintedIds = useMemo(() => collectTaintedIds(session.root), [session]);

  const currentId = playback.order[playback.index]?.id;
  const traversedIds = new Set(playback.order.slice(0, playback.index + 1).map((m) => m.id));
  const successIds = session.successPath;

  const traversedEdgeKey =
    playback.index > 0
      ? `${playback.order[playback.index - 1].id}->${playback.order[playback.index].id}`
      : null;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ display: 'block' }}
    >
      <GraphDefs />
      {layout.edges.map((e) => {
        const key = `${e.sourceId}->${e.targetId}`;
        const isTraversed = traversedIds.has(e.targetId);
        const isCurrent = key === traversedEdgeKey;
        const inSub = subagentIds.has(e.targetId);
        const pruned = taintedIds.has(e.targetId) && !traversedIds.has(e.targetId);
        const state = pruned ? 'pruned' : isCurrent ? 'drawing' : isTraversed ? 'done' : 'idle';
        return (
          <EdgePath
            key={key}
            edge={e}
            state={state}
            progress={isCurrent ? playback.edgeProgress : isTraversed ? 1 : 0}
            inSubagent={inSub}
          />
        );
      })}
      {layout.nodes.map((n) => {
        const inSub = subagentIds.has(n.id);
        let state: 'idle' | 'active' | 'success' | 'failed' | 'pruned';
        if (n.milestone.failed) state = 'failed';
        else if (n.id === currentId) state = 'active';
        else if (taintedIds.has(n.id)) state = 'pruned';
        else if (playback.finished && successIds.has(n.id)) state = 'success';
        else if (traversedIds.has(n.id)) state = 'success';
        else state = 'idle';
        return <NodeShape key={n.id} node={n} state={state} inSubagent={inSub} />;
      })}
    </svg>
  );
}
```

- [ ] **Step 3: Manual verify with a fixture that has a failure**

The real session selection might or might not have a failure. Save this for the E2E pass. For now confirm the app still works on a clean session.

```bash
npm run dev
```

Pick a session, confirm no regression. Stop server.

- [ ] **Step 4: Commit**

```bash
git add src/parse/failure.ts src/components/GraphCanvas.tsx
git commit -m "feat(ui): pruned tainted branches render with --node-pruned"
```

---

## Task 21: Success path glow on completion

**Files:**
- Modify: `src/components/NodeShape.tsx`

- [ ] **Step 1: Add a slow shimmer animation for the `success` state**

Replace the `success` branch in `colorsFor` and add a CSS animation. Update `src/components/NodeShape.tsx`:

```typescript
import type { LaidOutNode } from '../graph/layout';

type Props = {
  node: LaidOutNode;
  state: 'idle' | 'active' | 'success' | 'failed' | 'pruned';
  inSubagent: boolean;
};

function glyphFor(kind: LaidOutNode['milestone']['kind']): string {
  switch (kind) {
    case 'root_prompt': return '>';
    case 'user_followup': return '>';
    case 'assistant_turn': return '·';
    case 'tool_call': return '⚙';
    case 'subagent_spawn': return '⌥';
    case 'completion': return '■';
  }
}

export function NodeShape({ node, state, inSubagent }: Props) {
  const w = 110, h = 28;
  const colors = colorsFor(state, inSubagent);
  const useGlow = state === 'active' || state === 'success';

  return (
    <g transform={`translate(${node.x - w / 2}, ${node.y - h / 2})`} data-id={node.id} data-state={state}>
      <rect
        width={w} height={h} rx={4}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={state === 'success' ? 1.5 : 1}
        filter={useGlow ? 'url(#tg-glow)' : undefined}
        opacity={state === 'pruned' ? 0.35 : 0.95}
        style={state === 'success' ? { animation: 'tg-shimmer 2.4s ease-in-out infinite' } : undefined}
      />
      <text x={8} y={h / 2 + 4} fontSize={11} fill={colors.text} fontFamily="ui-monospace, monospace">
        {glyphFor(node.milestone.kind)}  {node.milestone.label}
      </text>
      {state === 'failed' && (
        <circle cx={w - 6} cy={6} r={3} fill="var(--node-failed)" filter="url(#tg-glow)" />
      )}
    </g>
  );
}

function colorsFor(state: Props['state'], inSubagent: boolean) {
  const stroke = inSubagent ? 'var(--subagent-accent)' : 'var(--edge-idle)';
  switch (state) {
    case 'idle': return { fill: 'var(--node-idle)', stroke, text: 'var(--text)' };
    case 'active': return { fill: 'var(--node-active)', stroke: 'var(--node-active)', text: '#001017' };
    case 'success': return { fill: 'var(--node-idle)', stroke: 'var(--node-success)', text: 'var(--node-success)' };
    case 'failed': return { fill: 'var(--node-idle)', stroke: 'var(--node-failed)', text: 'var(--node-failed)' };
    case 'pruned': return { fill: 'var(--node-pruned)', stroke: 'var(--node-pruned)', text: 'var(--text-dim)' };
  }
}
```

- [ ] **Step 2: Add the shimmer keyframes to `src/index.css`**

Append to `src/index.css`:

```css
@keyframes tg-shimmer {
  0%, 100% { filter: drop-shadow(0 0 4px var(--node-success)); }
  50% { filter: drop-shadow(0 0 14px var(--node-success)); }
}
```

- [ ] **Step 3: Manual verify**

```bash
npm run dev
```

Pick a session and wait for playback to finish. Expected: nodes on the success path softly pulse with cyan-mint glow. Stop server.

- [ ] **Step 4: Commit**

```bash
git add src/components/NodeShape.tsx src/index.css
git commit -m "feat(ui): success path shimmer on playback completion"
```

---

## Task 22: 1000-milestone cap

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Insert overflow guard in `src/App.tsx`**

Inside the `{session && (` JSX block, replace it with a guard:

```typescript
{session && session.totalMilestones > 1000 && (
  <div style={styles.empty}>
    SESSION TOO LARGE FOR POC ({session.totalMilestones} MILESTONES)
  </div>
)}
{session && session.totalMilestones <= 1000 && (
  <>
    <GraphCanvas session={session} playback={playback} subagentIds={subagentIds} />
    <NowPlaying current={currentMilestone} edgeProgress={playback.edgeProgress} inSubagent={inSubagent} />
    <PlaybackControls state={playback} controls={controls} />
  </>
)}
```

- [ ] **Step 2: Manual verify**

```bash
npm run dev
```

Pick a small session — should render. (We'll verify the cap message in E2E later.) Stop server.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): cap at 1000 milestones with overflow message"
```

---

## Task 23: Node tooltip on hover

**Files:**
- Create: `src/components/NodeTooltip.tsx`
- Modify: `src/components/GraphCanvas.tsx`

- [ ] **Step 1: Create `src/components/NodeTooltip.tsx`**

```typescript
import type { Milestone } from '../parse/types';

type Props = { milestone: Milestone; x: number; y: number };

export function NodeTooltip({ milestone, x, y }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x + 12,
        top: y + 12,
        maxWidth: 480,
        background: 'rgba(5,8,13,0.95)',
        border: '1px solid var(--edge-idle)',
        padding: '8px 12px',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 12,
        color: 'var(--text)',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <div style={{ color: 'var(--edge-trail)', marginBottom: 4 }}>{milestone.label}</div>
      <div style={{ marginBottom: 4 }}>{milestone.summary}</div>
      {milestone.result && (
        <div style={{ color: milestone.failed ? 'var(--node-failed)' : 'var(--text-dim)', marginBottom: 4 }}>
          {milestone.result}
        </div>
      )}
      {milestone.detail && (
        <pre style={{
          color: 'var(--text-dim)', whiteSpace: 'pre-wrap',
          margin: 0, maxHeight: 260, overflow: 'auto', fontSize: 11,
        }}>
          {milestone.detail.slice(0, 1200)}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire hover state into `GraphCanvas`**

Replace `src/components/GraphCanvas.tsx`:

```typescript
import { useMemo, useState } from 'react';
import { layoutTree } from '../graph/layout';
import { GraphDefs } from '../theme/Filters';
import { NodeShape } from './NodeShape';
import { EdgePath } from './EdgePath';
import { NodeTooltip } from './NodeTooltip';
import { collectTaintedIds } from '../parse/failure';
import type { Session, Milestone } from '../parse/types';
import type { PlaybackState } from '../playback/usePlayback';

type Props = { session: Session; playback: PlaybackState; subagentIds: Set<string> };

export function GraphCanvas({ session, playback, subagentIds }: Props) {
  const layout = useMemo(() => layoutTree(session.root), [session]);
  const taintedIds = useMemo(() => collectTaintedIds(session.root), [session]);
  const [hover, setHover] = useState<{ milestone: Milestone; x: number; y: number } | null>(null);

  const currentId = playback.order[playback.index]?.id;
  const traversedIds = new Set(playback.order.slice(0, playback.index + 1).map((m) => m.id));
  const successIds = session.successPath;

  const traversedEdgeKey =
    playback.index > 0
      ? `${playback.order[playback.index - 1].id}->${playback.order[playback.index].id}`
      : null;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="xMidYMin meet"
        style={{ display: 'block' }}
      >
        <GraphDefs />
        {layout.edges.map((e) => {
          const key = `${e.sourceId}->${e.targetId}`;
          const isTraversed = traversedIds.has(e.targetId);
          const isCurrent = key === traversedEdgeKey;
          const inSub = subagentIds.has(e.targetId);
          const pruned = taintedIds.has(e.targetId) && !traversedIds.has(e.targetId);
          const state = pruned ? 'pruned' : isCurrent ? 'drawing' : isTraversed ? 'done' : 'idle';
          return (
            <EdgePath
              key={key}
              edge={e}
              state={state}
              progress={isCurrent ? playback.edgeProgress : isTraversed ? 1 : 0}
              inSubagent={inSub}
            />
          );
        })}
        {layout.nodes.map((n) => {
          const inSub = subagentIds.has(n.id);
          let state: 'idle' | 'active' | 'success' | 'failed' | 'pruned';
          if (n.milestone.failed) state = 'failed';
          else if (n.id === currentId) state = 'active';
          else if (taintedIds.has(n.id)) state = 'pruned';
          else if (playback.finished && successIds.has(n.id)) state = 'success';
          else if (traversedIds.has(n.id)) state = 'success';
          else state = 'idle';
          return (
            <g
              key={n.id}
              onMouseEnter={(e) => setHover({ milestone: n.milestone, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => setHover({ milestone: n.milestone, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              <NodeShape node={n} state={state} inSubagent={inSub} />
            </g>
          );
        })}
      </svg>
      {hover && <NodeTooltip milestone={hover.milestone} x={hover.x} y={hover.y} />}
    </div>
  );
}
```

- [ ] **Step 3: Manual verify**

```bash
npm run dev
```

Hover any node. Expected: tooltip appears with label, summary, result, and detail. Stop server.

- [ ] **Step 4: Commit**

```bash
git add src/components/NodeTooltip.tsx src/components/GraphCanvas.tsx
git commit -m "feat(ui): hover tooltip with full milestone detail"
```

---

## Task 24: E2E fixtures

**Files:**
- Create: `tests/fixtures/claude-projects/C--demo-happy/2026-01-01-aaaa.jsonl`
- Create: `tests/fixtures/claude-projects/C--demo-fail/2026-01-02-bbbb.jsonl`
- Create: `tests/fixtures/claude-projects/C--demo-sub/2026-01-03-cccc.jsonl`
- Create: `tests/fixtures/claude-projects/C--demo-sub/2026-01-03-cccc/subagents/agent-sub1.jsonl`

The fixture directory mirrors Claude Code's real layout. Each `*.jsonl` is a hand-crafted minimal session. We point the Vite plugin at this directory by setting `CLAUDE_HOME` when running tests.

- [ ] **Step 1: Create `tests/fixtures/claude-projects/C--demo-happy/2026-01-01-aaaa.jsonl`**

```jsonl
{"uuid":"h1","parentUuid":null,"timestamp":"2026-01-01T00:00:00Z","type":"user","message":{"role":"user","content":"Please print hello world"}}
{"uuid":"h2","parentUuid":"h1","timestamp":"2026-01-01T00:00:01Z","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I will run echo."},{"type":"tool_use","id":"tu_h","name":"Bash","input":{"command":"echo hello"}}]}}
{"uuid":"h3","parentUuid":"h2","timestamp":"2026-01-01T00:00:02Z","type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu_h","content":"<stdout>\nhello\n</stdout>\n<exit_code>0</exit_code>","is_error":false}]}}
{"uuid":"h4","parentUuid":"h3","timestamp":"2026-01-01T00:00:03Z","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Done."}]}}
```

- [ ] **Step 2: Create `tests/fixtures/claude-projects/C--demo-fail/2026-01-02-bbbb.jsonl`**

```jsonl
{"uuid":"f1","parentUuid":null,"timestamp":"2026-01-02T00:00:00Z","type":"user","message":{"role":"user","content":"Read missing file"}}
{"uuid":"f2","parentUuid":"f1","timestamp":"2026-01-02T00:00:01Z","type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_f","name":"Read","input":{"file_path":"/does/not/exist.txt"}}]}}
{"uuid":"f3","parentUuid":"f2","timestamp":"2026-01-02T00:00:02Z","type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu_f","content":"File does not exist","is_error":true}]}}
{"uuid":"f4","parentUuid":"f3","timestamp":"2026-01-02T00:00:03Z","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Aborting."}]}}
```

- [ ] **Step 3: Create `tests/fixtures/claude-projects/C--demo-sub/2026-01-03-cccc.jsonl`**

```jsonl
{"uuid":"m1","parentUuid":null,"timestamp":"2026-01-03T00:00:00Z","type":"user","message":{"role":"user","content":"Delegate exploration"}}
{"uuid":"m2","parentUuid":"m1","timestamp":"2026-01-03T00:00:01Z","type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_sub1","name":"Task","input":{"subagent_type":"Explore","description":"find the auth code","prompt":"please look"}}]}}
{"uuid":"m3","parentUuid":"m2","timestamp":"2026-01-03T00:00:10Z","type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu_sub1","content":"subagent returned: found three matches","is_error":false}]}}
{"uuid":"m4","parentUuid":"m3","timestamp":"2026-01-03T00:00:11Z","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Subagent finished — proceeding."}]}}
```

- [ ] **Step 4: Create `tests/fixtures/claude-projects/C--demo-sub/2026-01-03-cccc/subagents/agent-sub1.jsonl`**

```jsonl
{"uuid":"s1","parentUuid":null,"timestamp":"2026-01-03T00:00:02Z","isSidechain":true,"relatedToolUseId":"tu_sub1","type":"user","message":{"role":"user","content":"please look"}}
{"uuid":"s2","parentUuid":"s1","timestamp":"2026-01-03T00:00:05Z","isSidechain":true,"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_sg","name":"Grep","input":{"pattern":"auth","path":"src"}}]}}
{"uuid":"s3","parentUuid":"s2","timestamp":"2026-01-03T00:00:06Z","isSidechain":true,"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu_sg","content":"Found 3 matches in 1 files","is_error":false}]}}
{"uuid":"s4","parentUuid":"s3","timestamp":"2026-01-03T00:00:07Z","isSidechain":true,"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Found three matches."}]}}
```

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/claude-projects
git commit -m "test(fixtures): add handcrafted JSONLs for happy/fail/subagent paths"
```

---

## Task 25: Playwright setup + Test 1 (discovery & load)

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/discovery-load.spec.ts`
- Modify: `package.json` (test:e2e script already exists; add `test:e2e:install` for browsers)

- [ ] **Step 1: Install Playwright browsers**

```bash
npx playwright install --with-deps chromium
```

Expected: chromium installed.

- [ ] **Step 2: Create `playwright.config.ts`**

```typescript
import { defineConfig } from '@playwright/test';
import path from 'node:path';

const fixtureClaudeHome = path.resolve(__dirname, 'tests/fixtures/claude-projects');

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npm run dev -- --port 5174',
    url: 'http://localhost:5174',
    timeout: 30_000,
    reuseExistingServer: false,
    env: {
      CLAUDE_HOME: fixtureClaudeHome,
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

- [ ] **Step 3: Create `tests/e2e/discovery-load.spec.ts`**

```typescript
import { expect, test } from '@playwright/test';

test('discovery & load: lists fixture sessions and renders a tree', async ({ page }) => {
  await page.goto('/');
  // Sidebar shows the 3 fixture projects
  await expect(page.locator('aside li')).toHaveCount(3);
  // Click the happy-path session
  await page.locator('aside li', { hasText: 'demo-happy' }).click();
  // SVG nodes should render (4 milestones in the happy path)
  await expect(page.locator('svg g[data-id]')).toHaveCount(4, { timeout: 5_000 });
});
```

- [ ] **Step 4: Run the test**

```bash
npm run test:e2e -- discovery-load
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/discovery-load.spec.ts
git commit -m "test(e2e): Playwright setup + discovery & load test"
```

---

## Task 26: E2E Test 2 (playback advances)

**Files:**
- Create: `tests/e2e/playback.spec.ts`

- [ ] **Step 1: Create `tests/e2e/playback.spec.ts`**

```typescript
import { expect, test } from '@playwright/test';

test('playback: auto-advances, pause freezes, resume continues', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo-happy' }).click();
  // Wait for nodes
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();
  // Trail should move through ≥3 nodes within 2 seconds at 1×
  await page.waitForTimeout(2_000);
  const active1 = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  expect(active1).not.toBeNull();
  // Pause
  await page.getByTestId('play-toggle').click();
  const pausedAt = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  await page.waitForTimeout(800);
  const stillAt = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  expect(stillAt).toBe(pausedAt);
  // Resume
  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(1_200);
  // Should eventually finish; success nodes appear
  await expect(page.locator('svg g[data-state="success"]')).toHaveCount(4, { timeout: 5_000 });
});
```

- [ ] **Step 2: Run the test**

```bash
npm run test:e2e -- playback
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/playback.spec.ts
git commit -m "test(e2e): playback advances, pause, resume"
```

---

## Task 27: E2E Test 3 (failure rendering)

**Files:**
- Create: `tests/e2e/failure-rendering.spec.ts`

- [ ] **Step 1: Create `tests/e2e/failure-rendering.spec.ts`**

```typescript
import { expect, test } from '@playwright/test';

test('failure: failed tool_call renders red with red-dot indicator', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo-fail' }).click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();
  // The Read tool call should be in failed state
  await expect(page.locator('svg g[data-state="failed"]')).toHaveCount(1, { timeout: 5_000 });
  // Wait for playback to finish
  await page.waitForTimeout(3_500);
  // Success path should NOT include the failed branch -> success nodes < total nodes
  const total = await page.locator('svg g[data-id]').count();
  const successCount = await page.locator('svg g[data-state="success"]').count();
  expect(successCount).toBeLessThan(total);
});
```

- [ ] **Step 2: Run the test**

```bash
npm run test:e2e -- failure-rendering
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/failure-rendering.spec.ts
git commit -m "test(e2e): failure rendering for is_error tool results"
```

---

## Task 28: E2E Test 4 (subagent branching)

**Files:**
- Create: `tests/e2e/subagent.spec.ts`

- [ ] **Step 1: Create `tests/e2e/subagent.spec.ts`**

```typescript
import { expect, test } from '@playwright/test';

test('subagent: subtree renders, traversal descends first', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo-sub' }).click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();
  // Total milestones: main (4) + subagent (4) = 8
  await expect(page.locator('svg g[data-id]')).toHaveCount(8, { timeout: 5_000 });
  // Subagent traversal should descend into subagent first → at ~1s the active node should be one of the subagent ids
  await page.waitForTimeout(1_000);
  const active = await page.locator('svg g[data-state="active"]').first().getAttribute('data-id');
  expect(active).toMatch(/^(s1|s2#tu_sg|s4)$/);
});
```

- [ ] **Step 2: Run the test**

```bash
npm run test:e2e -- subagent
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/subagent.spec.ts
git commit -m "test(e2e): subagent subtree branches and traverses first"
```

---

## Task 29: E2E Test 5 (HUD readout)

**Files:**
- Modify: `src/components/NowPlaying.tsx` (add data-testid attributes)
- Create: `tests/e2e/hud-readout.spec.ts`

- [ ] **Step 1: Add `data-testid` attributes in `src/components/NowPlaying.tsx`**

Update the two text divs:

```typescript
<div data-testid="hud-summary" style={{ ...styles.line1, color: failed ? 'var(--node-failed)' : 'var(--edge-trail)' }}>
  {summary || ' '}
</div>
<div data-testid="hud-result" style={{ ...styles.line2, color: failed ? 'var(--node-failed)' : 'var(--text-dim)' }}>
  {result || ' '}
</div>
```

- [ ] **Step 2: Create `tests/e2e/hud-readout.spec.ts`**

```typescript
import { expect, test } from '@playwright/test';

test('HUD: summary and result populate as trail enters each node', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo-happy' }).click();
  await expect(page.locator('svg g[data-id]').first()).toBeVisible();
  // After a moment, summary should show the prompt
  await expect(page.getByTestId('hud-summary')).toContainText(/Please print hello world|will run echo|Bash|Done/i, { timeout: 5_000 });
  // After more time, result should show exit code 0 line for the Bash call
  await expect(page.getByTestId('hud-result')).toContainText(/exit 0/, { timeout: 6_000 });
});
```

- [ ] **Step 3: Run the test**

```bash
npm run test:e2e -- hud-readout
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/NowPlaying.tsx tests/e2e/hud-readout.spec.ts
git commit -m "test(e2e): HUD readout summary + result"
```

---

## Task 30: Final verification pass

- [ ] **Step 1: Run all unit tests**

```bash
npm test
```

Expected: all unit suites pass.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Run all E2E tests**

```bash
npm run test:e2e
```

Expected: 5 tests pass.

- [ ] **Step 4: Manual demo run against your real Claude Code data**

```bash
npm run dev
```

Open http://localhost:5173, pick a real session from your sidebar. Visually confirm:
- Tree renders top-down with TRON-styled nodes.
- Trail animates from root downward.
- HUD readout shows summary then result.
- Hover tooltips work.
- Play/pause + speed work.
- If any session has subagents — branches appear in violet with the HUD frame during subagent traversal.
- If any session has tool errors — failed nodes appear red with red-dot indicator; tainted branches are dimmed.

Stop the server.

- [ ] **Step 5: Final commit (any small polish fixes from the manual pass)**

```bash
git add -p   # stage only intended hunks
git commit -m "chore: final polish from manual demo run" # only if there are changes
```

---

## Done

POC complete. Five Playwright E2E tests + ~7 unit suites verify behavior. Manual demo verifies the cool factor.