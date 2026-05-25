# Token Usage Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `#/tokens` page showing per-model token spend (input/output/cached) plus a d3 stacked-bar chart of daily usage across all Claude Code sessions, filterable by project with `7D / 30D / 90D / ALL` presets.

**Architecture:** Server-side aggregation walks `~/.claude/projects/**/*.jsonl` (main + subagent files), groups by `(projectId, modelId, isSubagent, day)`, returns flat rows. Client renders two framed sections (per-model spend list + d3 stacked-bar chart) inside the existing TRON shell. Hash-based routing (`#/tokens`) keeps it dependency-free.

**Tech Stack:** TypeScript, React 19, TanStack Query, d3 v7, Vite plugin middleware, Vitest (unit), Playwright (e2e). No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-25-token-usage-page-design.md`

**Conventions observed in this codebase:**
- Unit tests live in `tests/unit/**/*.test.{ts,tsx}` (not next to source files). The vitest `include` glob makes this load-bearing.
- E2E tests in `tests/e2e/*.spec.ts`. `playwright.config.ts` sets `CLAUDE_HOME=tests/fixtures/claude-projects` for the dev server it launches.
- d3 SVG components mount via `useRef` + `useEffect` and manipulate DOM imperatively (see `src/graph/layout.ts`, `src/graph/useCamera.ts`).
- React component styles are inline `style={...}` objects with a `const styles = {...}` at the bottom of the file (no CSS modules in this repo).
- Style tokens via CSS variables: `--edge-trail` (cyan accent), `--text`, `--text-dim`, `--grid`, `--node-failed`.

**File map:**

New files:
- `server/aggregate-token-usage.ts` — pure aggregation function (no Vite/middleware deps).
- `src/api/types.ts` — *not new*, see Modified.
- `src/tokens/aggregate.ts` — pure client utilities (filter, densify, stack data, summaries).
- `src/tokens/palette.ts` — model→color mapping with subagent variants.
- `src/tokens/DailyUsageChart.tsx` — d3 SVG stacked bar chart.
- `src/tokens/OverallSpendList.tsx` — Section A rows.
- `src/tokens/TokensPage.tsx` — page shell glue.
- `src/util/useHashRoute.ts` — `hashchange`-driven hook.
- `tests/unit/server/aggregate-token-usage.test.ts`
- `tests/unit/tokens/aggregate.test.ts`
- `tests/unit/tokens/palette.test.ts`
- `tests/unit/tokens/DailyUsageChart.test.tsx`
- `tests/unit/tokens/OverallSpendList.test.tsx`
- `tests/unit/util/useHashRoute.test.ts`
- `tests/fixtures/claude-projects/C--demo-tokens/2026-05-20-tok1.jsonl`
- `tests/fixtures/claude-projects/C--demo-tokens/2026-05-23-tok2.jsonl`
- `tests/fixtures/claude-projects/C--demo-tokens/2026-05-23-tok2/subagents/agent-tok-sub.jsonl`
- `tests/e2e/tokens-page.spec.ts`

Modified files:
- `server/vite-plugin-sessions.ts` — register `/api/token-usage` middleware that calls `aggregateTokenUsage()`.
- `src/api/client.ts` — add `fetchTokenUsage()` + shared types.
- `src/api/hooks.ts` — add `useTokenUsage()`.
- `src/App.tsx` — read hash route; render `<TokensPage />` instead of canvas content when route === `'tokens'`.
- `src/components/library/LibraryPanel.tsx` — add `TOKENS` link in the header row.
- `tests/e2e/discovery-load.spec.ts` — bump expected fixture session count from 4 to 5 (we add `C--demo-tokens`).

---

## Task 1: Server aggregation function (pure, no middleware)

Build the pure function first so we can TDD it without the Vite plumbing. The function takes a root directory and returns the aggregated response.

**Files:**
- Create: `server/aggregate-token-usage.ts`
- Create: `tests/unit/server/aggregate-token-usage.test.ts`
- Create: `tests/unit/server/fixtures/tokens-root/C--demo-a/2026-05-20-aaa.jsonl`
- Create: `tests/unit/server/fixtures/tokens-root/C--demo-a/2026-05-21-bbb.jsonl`
- Create: `tests/unit/server/fixtures/tokens-root/C--demo-a/2026-05-21-bbb/subagents/sub1.jsonl`
- Create: `tests/unit/server/fixtures/tokens-root/C--demo-b/2026-05-22-ccc.jsonl`

- [ ] **Step 1: Create the unit-test fixture directory (a tree the test points at via the `root` parameter — isolated from the real `tests/fixtures/claude-projects/` used by playwright).**

Write `tests/unit/server/fixtures/tokens-root/C--demo-a/2026-05-20-aaa.jsonl`:

```jsonl
{"uuid":"a1","parentUuid":null,"timestamp":"2026-05-20T10:00:00Z","type":"user","message":{"role":"user","content":"hi"}}
{"uuid":"a2","parentUuid":"a1","timestamp":"2026-05-20T10:00:01Z","type":"assistant","message":{"role":"assistant","model":"claude-opus-4-7","usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":200,"cache_creation_input_tokens":300}}}
{"uuid":"a3","parentUuid":"a2","timestamp":"2026-05-20T11:00:00Z","type":"assistant","message":{"role":"assistant","model":"claude-opus-4-7","usage":{"input_tokens":10,"output_tokens":5,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}
```

Write `tests/unit/server/fixtures/tokens-root/C--demo-a/2026-05-21-bbb.jsonl`:

```jsonl
{"uuid":"b1","parentUuid":null,"timestamp":"2026-05-21T08:00:00Z","type":"user","message":{"role":"user","content":"hi"}}
{"uuid":"b2","parentUuid":"b1","timestamp":"2026-05-21T08:00:01Z","type":"assistant","message":{"role":"assistant","model":"claude-sonnet-4-6","usage":{"input_tokens":7,"output_tokens":3,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}
{"uuid":"b3","parentUuid":"b2","timestamp":"2026-05-21T08:00:02Z","type":"assistant","message":{"role":"assistant"}}
```

Note the last line: an assistant event with no `usage` and no `model` — must be skipped by the aggregator.

Write `tests/unit/server/fixtures/tokens-root/C--demo-a/2026-05-21-bbb/subagents/sub1.jsonl`:

```jsonl
{"uuid":"s1","parentUuid":null,"timestamp":"2026-05-21T08:30:00Z","type":"assistant","message":{"role":"assistant","model":"claude-opus-4-7","usage":{"input_tokens":2,"output_tokens":1,"cache_read_input_tokens":5,"cache_creation_input_tokens":5}}}
```

Write `tests/unit/server/fixtures/tokens-root/C--demo-b/2026-05-22-ccc.jsonl`:

```jsonl
{"uuid":"c1","parentUuid":null,"timestamp":"2026-05-22T10:00:00Z","type":"assistant","message":{"role":"assistant","model":"claude-haiku-4-5-20251001","usage":{"input_tokens":1,"output_tokens":1,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}
not-valid-json
{"uuid":"c2","parentUuid":"c1","timestamp":"","type":"assistant","message":{"role":"assistant","model":"claude-haiku-4-5-20251001","usage":{"input_tokens":99,"output_tokens":99}}}
```

The middle line tests bad-JSON skipping; the last line tests empty-timestamp skipping.

- [ ] **Step 2: Write the failing test file.**

Create `tests/unit/server/aggregate-token-usage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateTokenUsage } from '../../../server/aggregate-token-usage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(__dirname, 'fixtures', 'tokens-root');

describe('aggregateTokenUsage', () => {
  it('returns empty payload when root does not exist', async () => {
    const out = await aggregateTokenUsage(path.join(FIXTURE_ROOT, 'does-not-exist'));
    expect(out).toEqual({ projects: [], rows: [] });
  });

  it('lists every project directory under root, even if empty of usage rows', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const ids = out.projects.map((p) => p.id).sort();
    expect(ids).toEqual(['C--demo-a', 'C--demo-b']);
  });

  it('decodes project ids into cwds', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const a = out.projects.find((p) => p.id === 'C--demo-a')!;
    expect(a.cwd).toBe('C:/demo/a');
  });

  it('groups main-session rows by (projectId, modelId, isSubagent, day)', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const aMain = out.rows.filter(
      (r) => r.projectId === 'C--demo-a' && !r.isSubagent && r.modelId === 'claude-opus-4-7' && r.day === '2026-05-20'
    );
    expect(aMain).toHaveLength(1);
    expect(aMain[0]).toEqual({
      projectId: 'C--demo-a',
      modelId: 'claude-opus-4-7',
      isSubagent: false,
      day: '2026-05-20',
      input: 110,
      output: 55,
      cached: 500,
    });
  });

  it('sums cache_read + cache_creation into a single cached bucket', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const row = out.rows.find(
      (r) => r.projectId === 'C--demo-a' && !r.isSubagent && r.day === '2026-05-20'
    )!;
    expect(row.cached).toBe(500); // 200 read + 300 creation
  });

  it('marks subagent file rows with isSubagent=true', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const sub = out.rows.find((r) => r.projectId === 'C--demo-a' && r.isSubagent);
    expect(sub).toBeDefined();
    expect(sub!.modelId).toBe('claude-opus-4-7');
    expect(sub!.day).toBe('2026-05-21');
  });

  it('skips assistant events missing model or usage', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const bMain = out.rows.filter((r) => r.projectId === 'C--demo-a' && r.modelId === 'claude-sonnet-4-6');
    expect(bMain).toHaveLength(1);
    expect(bMain[0].input).toBe(7);
  });

  it('skips lines that are not valid JSON without throwing', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const b = out.rows.filter((r) => r.projectId === 'C--demo-b');
    expect(b).toHaveLength(1);
    expect(b[0].modelId).toBe('claude-haiku-4-5-20251001');
    expect(b[0].input).toBe(1);
  });

  it('skips events with empty timestamps', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const b = out.rows.filter((r) => r.projectId === 'C--demo-b' && r.input === 99);
    expect(b).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the test — it should fail because the module does not exist yet.**

Run: `npm test -- aggregate-token-usage`
Expected: Failure — `Cannot find module '../../../server/aggregate-token-usage'`.

- [ ] **Step 4: Implement `server/aggregate-token-usage.ts`.**

Create the file with this exact content:

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type TokenUsageRow = {
  projectId: string;
  modelId: string;
  isSubagent: boolean;
  day: string; // YYYY-MM-DD (UTC)
  input: number;
  output: number;
  cached: number; // cache_read + cache_creation
};

export type TokenUsageProject = {
  id: string;
  cwd: string;
};

export type TokenUsageResponse = {
  projects: TokenUsageProject[];
  rows: TokenUsageRow[];
};

function decodeProjectId(id: string): string {
  // Mirrors server/vite-plugin-sessions.ts decodeProjectId.
  if (/^[A-Za-z]--/.test(id)) {
    const driveLetter = id[0];
    const rest = id.slice(3).replace(/-/g, '/');
    return `${driveLetter}:/${rest}`;
  }
  return id.replace(/-/g, '/');
}

type AssistantEvent = {
  type?: string;
  timestamp?: string;
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
};

async function listDirSafe(p: string): Promise<string[]> {
  try {
    return await fs.readdir(p);
  } catch {
    return [];
  }
}

async function statSafe(p: string): Promise<import('node:fs').Stats | null> {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

async function readFileSafe(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

function accumulate(
  acc: Map<string, TokenUsageRow>,
  projectId: string,
  isSubagent: boolean,
  jsonl: string,
): void {
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let ev: AssistantEvent;
    try { ev = JSON.parse(trimmed) as AssistantEvent; } catch { continue; }
    if (ev.type !== 'assistant') continue;
    const ts = ev.timestamp;
    if (!ts || ts.length < 10) continue;
    const day = ts.slice(0, 10);
    const model = ev.message?.model;
    const u = ev.message?.usage;
    if (!model || !u) continue;
    const input = Number(u.input_tokens ?? 0);
    const output = Number(u.output_tokens ?? 0);
    const cached = Number(u.cache_read_input_tokens ?? 0) + Number(u.cache_creation_input_tokens ?? 0);
    if (!Number.isFinite(input + output + cached)) continue;
    const key = `${projectId}|${model}|${isSubagent ? 1 : 0}|${day}`;
    const prev = acc.get(key);
    if (prev) {
      prev.input += input;
      prev.output += output;
      prev.cached += cached;
    } else {
      acc.set(key, { projectId, modelId: model, isSubagent, day, input, output, cached });
    }
  }
}

export async function aggregateTokenUsage(root: string): Promise<TokenUsageResponse> {
  const projectDirs = await listDirSafe(root);
  if (projectDirs.length === 0) return { projects: [], rows: [] };

  const projects: TokenUsageProject[] = [];
  const acc = new Map<string, TokenUsageRow>();

  for (const projectId of projectDirs) {
    const projectDir = path.join(root, projectId);
    const stat = await statSafe(projectDir);
    if (!stat?.isDirectory()) continue;
    projects.push({ id: projectId, cwd: decodeProjectId(projectId) });

    const entries = await listDirSafe(projectDir);
    for (const name of entries) {
      const full = path.join(projectDir, name);
      if (name.endsWith('.jsonl')) {
        const content = await readFileSafe(full);
        if (content) accumulate(acc, projectId, false, content);
        continue;
      }
      // Subagent JSONLs live at <sessionId>/subagents/*.jsonl
      const subStat = await statSafe(full);
      if (!subStat?.isDirectory()) continue;
      const subagentsDir = path.join(full, 'subagents');
      const subFiles = await listDirSafe(subagentsDir);
      for (const subName of subFiles) {
        if (!subName.endsWith('.jsonl')) continue;
        const content = await readFileSafe(path.join(subagentsDir, subName));
        if (content) accumulate(acc, projectId, true, content);
      }
    }
  }

  projects.sort((a, b) => a.id.localeCompare(b.id));
  const rows = Array.from(acc.values());
  return { projects, rows };
}
```

- [ ] **Step 5: Run the test — it should pass.**

Run: `npm test -- aggregate-token-usage`
Expected: PASS (9 tests).

- [ ] **Step 6: Run the full unit-test suite to confirm no regressions.**

Run: `npm test`
Expected: All existing tests still PASS plus the 9 new tests.

- [ ] **Step 7: Commit.**

```bash
git add server/aggregate-token-usage.ts tests/unit/server/aggregate-token-usage.test.ts tests/unit/server/fixtures
git commit -m "feat(tokens): server-side aggregation for token usage"
```

---

## Task 2: Wire `/api/token-usage` middleware

Hook the aggregator into the existing Vite plugin so the browser can call it.

**Files:**
- Modify: `server/vite-plugin-sessions.ts`

- [ ] **Step 1: Open `server/vite-plugin-sessions.ts` and add an import at the top of the import block.**

Add after the existing `import os from 'node:os';` line:

```ts
import { aggregateTokenUsage } from './aggregate-token-usage';
```

- [ ] **Step 2: Add a new middleware registration inside `configureServer(server)`, after the existing `server.middlewares.use('/api/prompts', ...)` block, before the closing `}` of `configureServer`.**

The new block:

```ts
server.middlewares.use('/api/token-usage', async (req, res, next) => {
  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method not allowed' });
      return;
    }
    const url = req.url ?? '/';
    if (url !== '/' && url !== '') {
      sendJson(res, 400, { error: 'expected /api/token-usage' });
      return;
    }
    const payload = await aggregateTokenUsage(root);
    sendJson(res, 200, payload);
  } catch (err) {
    next(err as Error);
  }
});
```

- [ ] **Step 3: Confirm typecheck passes.**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 4: Manual smoke test the endpoint.**

Run: `npm run dev -- --port 5174` in one terminal. In another:

```bash
curl -s http://localhost:5174/api/token-usage | head -c 400
```

Expected: JSON like `{"projects":[{"id":"C--Users-...","cwd":"C:/Users/..."}, ...],"rows":[{"projectId":"...","modelId":"claude-opus-4-7","isSubagent":false,"day":"2026-05-25","input":...,"output":...,"cached":...}, ...]}`. Stop the dev server (Ctrl+C).

- [ ] **Step 5: Commit.**

```bash
git add server/vite-plugin-sessions.ts
git commit -m "feat(tokens): expose /api/token-usage endpoint"
```

---

## Task 3: Client API client + hook

**Files:**
- Modify: `src/api/client.ts`
- Modify: `src/api/hooks.ts`

- [ ] **Step 1: Open `src/api/client.ts`. Add a re-export of the server types so the client uses the same shape (single source of truth).**

Replace the import block at the top:

```ts
import type { PromptMeta, SessionMeta, SessionPayload } from '../parse/types';
```

with:

```ts
import type { PromptMeta, SessionMeta, SessionPayload } from '../parse/types';
import type { TokenUsageResponse } from '../../server/aggregate-token-usage';

export type { TokenUsageResponse, TokenUsageRow, TokenUsageProject } from '../../server/aggregate-token-usage';
```

- [ ] **Step 2: Add `fetchTokenUsage` at the bottom of `src/api/client.ts`.**

Append:

```ts
export async function fetchTokenUsage(): Promise<TokenUsageResponse> {
  const res = await fetch('/api/token-usage');
  if (!res.ok) throw new Error(`token usage fetch failed: ${res.status}`);
  return (await res.json()) as TokenUsageResponse;
}
```

- [ ] **Step 3: Add `useTokenUsage` in `src/api/hooks.ts`.**

Append after `usePromptList`:

```ts
import { fetchTokenUsage } from './client';
import type { TokenUsageResponse } from './client';

export function useTokenUsage() {
  return useQuery<TokenUsageResponse>({
    queryKey: ['token-usage'],
    queryFn: fetchTokenUsage,
    staleTime: 60_000,
  });
}
```

(Note: keep imports at the top of the file — move the new imports up next to the existing ones rather than mid-file. If the engineer prefers, fold `fetchTokenUsage` into the existing client import line.)

- [ ] **Step 4: Typecheck.**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 5: Commit.**

```bash
git add src/api/client.ts src/api/hooks.ts
git commit -m "feat(tokens): client API for /api/token-usage"
```

---

## Task 4: Hash-route hook

A tiny hook so `App.tsx` can switch on the current route.

**Files:**
- Create: `src/util/useHashRoute.ts`
- Create: `tests/unit/util/useHashRoute.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `tests/unit/util/useHashRoute.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHashRoute } from '../../../src/util/useHashRoute';

describe('useHashRoute', () => {
  beforeEach(() => { window.location.hash = ''; });
  afterEach(() => { window.location.hash = ''; });

  it('returns "main" for empty hash', () => {
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toBe('main');
  });

  it('returns "tokens" for #/tokens', () => {
    window.location.hash = '#/tokens';
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toBe('tokens');
  });

  it('reacts to hashchange events', () => {
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toBe('main');
    act(() => {
      window.location.hash = '#/tokens';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toBe('tokens');
    act(() => {
      window.location.hash = '';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toBe('main');
  });

  it('treats unknown hashes as "main"', () => {
    window.location.hash = '#/something-else';
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toBe('main');
  });
});
```

- [ ] **Step 2: Run the test — should fail (module not found).**

Run: `npm test -- useHashRoute`
Expected: FAIL.

- [ ] **Step 3: Implement the hook.**

Create `src/util/useHashRoute.ts`:

```ts
import { useEffect, useState } from 'react';

export type Route = 'main' | 'tokens';

function read(): Route {
  if (typeof window === 'undefined') return 'main';
  return window.location.hash === '#/tokens' ? 'tokens' : 'main';
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const onChange = (): void => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
```

- [ ] **Step 4: Run the test — should pass.**

Run: `npm test -- useHashRoute`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/util/useHashRoute.ts tests/unit/util/useHashRoute.test.ts
git commit -m "feat(tokens): useHashRoute hook"
```

---

## Task 5: Client-side aggregate utilities

Pure functions consumed by the page and the chart. TDD them in isolation.

**Files:**
- Create: `src/tokens/aggregate.ts`
- Create: `tests/unit/tokens/aggregate.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `tests/unit/tokens/aggregate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  presetCutoff,
  filterRows,
  densifyDays,
  modelKeysSorted,
  modelKey,
  stackData,
  summariesPerModel,
} from '../../../src/tokens/aggregate';
import type { TokenUsageRow } from '../../../src/api/client';

const rows: TokenUsageRow[] = [
  { projectId: 'p1', modelId: 'opus', isSubagent: false, day: '2026-05-20', input: 100, output: 50, cached: 200 },
  { projectId: 'p1', modelId: 'opus', isSubagent: false, day: '2026-05-22', input: 10, output: 5, cached: 0 },
  { projectId: 'p2', modelId: 'sonnet', isSubagent: false, day: '2026-05-21', input: 7, output: 3, cached: 0 },
  { projectId: 'p1', modelId: 'opus', isSubagent: true, day: '2026-05-21', input: 2, output: 1, cached: 10 },
];

describe('presetCutoff', () => {
  it('all → 0000-01-01', () => {
    expect(presetCutoff('all', '2026-05-25')).toBe('0000-01-01');
  });
  it('7d → today - 7 UTC days', () => {
    expect(presetCutoff('7d', '2026-05-25')).toBe('2026-05-18');
  });
  it('30d → today - 30 UTC days', () => {
    expect(presetCutoff('30d', '2026-05-25')).toBe('2026-04-25');
  });
  it('90d → today - 90 UTC days', () => {
    expect(presetCutoff('90d', '2026-05-25')).toBe('2026-02-24');
  });
});

describe('filterRows', () => {
  it('filters by projectId when not "all"', () => {
    const out = filterRows(rows, 'p1', '0000-01-01');
    expect(out).toHaveLength(3);
    expect(out.every((r) => r.projectId === 'p1')).toBe(true);
  });
  it('keeps all projects for "all"', () => {
    const out = filterRows(rows, 'all', '0000-01-01');
    expect(out).toHaveLength(4);
  });
  it('drops rows with day < cutoffDay', () => {
    const out = filterRows(rows, 'all', '2026-05-21');
    expect(out).toHaveLength(3); // 2026-05-20 row dropped
  });
});

describe('densifyDays', () => {
  it('returns a continuous day list with no gaps', () => {
    const days = densifyDays('2026-05-20', '2026-05-22');
    expect(days).toEqual(['2026-05-20', '2026-05-21', '2026-05-22']);
  });
  it('handles single-day ranges', () => {
    expect(densifyDays('2026-05-20', '2026-05-20')).toEqual(['2026-05-20']);
  });
  it('returns empty when from > to', () => {
    expect(densifyDays('2026-05-22', '2026-05-20')).toEqual([]);
  });
});

describe('modelKey + modelKeysSorted', () => {
  it('modelKey appends |sub for subagents', () => {
    expect(modelKey('opus', false)).toBe('opus');
    expect(modelKey('opus', true)).toBe('opus|sub');
  });
  it('sorts keys by total tokens descending', () => {
    // opus main total = 100+50+200 + 10+5+0 = 365
    // opus sub total  = 2+1+10 = 13
    // sonnet total    = 7+3+0 = 10
    const keys = modelKeysSorted(rows);
    expect(keys).toEqual(['opus', 'opus|sub', 'sonnet']);
  });
});

describe('stackData', () => {
  it('produces dense day rows with zeros for missing keys/days', () => {
    const days = ['2026-05-20', '2026-05-21', '2026-05-22'];
    const keys = ['opus', 'opus|sub', 'sonnet'];
    const out = stackData(rows, days, keys, 'total');
    expect(out).toHaveLength(3);
    // 2026-05-20: only opus has 100+50+200 = 350
    expect(out[0]).toEqual({ day: '2026-05-20', values: { opus: 350, 'opus|sub': 0, sonnet: 0 } });
    // 2026-05-21: opus|sub = 13, sonnet = 10
    expect(out[1]).toEqual({ day: '2026-05-21', values: { opus: 0, 'opus|sub': 13, sonnet: 10 } });
    // 2026-05-22: opus = 15
    expect(out[2]).toEqual({ day: '2026-05-22', values: { opus: 15, 'opus|sub': 0, sonnet: 0 } });
  });
  it('extracts individual metric buckets when metric != "total"', () => {
    const out = stackData(rows, ['2026-05-20'], ['opus'], 'cached');
    expect(out[0].values.opus).toBe(200);
  });
});

describe('summariesPerModel', () => {
  it('returns one entry per (modelId, isSubagent) sorted desc by total', () => {
    const out = summariesPerModel(rows);
    expect(out).toEqual([
      { modelId: 'opus', isSubagent: false, input: 110, output: 55, cached: 200, total: 365 },
      { modelId: 'opus', isSubagent: true,  input: 2,   output: 1,  cached: 10,  total: 13 },
      { modelId: 'sonnet', isSubagent: false, input: 7, output: 3,  cached: 0,   total: 10 },
    ]);
  });
});
```

- [ ] **Step 2: Run — should fail (module missing).**

Run: `npm test -- tokens/aggregate`
Expected: FAIL.

- [ ] **Step 3: Implement `src/tokens/aggregate.ts`.**

Create the file:

```ts
import type { TokenUsageRow } from '../api/client';

export type RangePreset = '7d' | '30d' | '90d' | 'all';
export type Metric = 'total' | 'input' | 'output' | 'cached';

export function modelKey(modelId: string, isSubagent: boolean): string {
  return isSubagent ? `${modelId}|sub` : modelId;
}

export function presetCutoff(preset: RangePreset, today: string): string {
  if (preset === 'all') return '0000-01-01';
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  const t = new Date(`${today}T00:00:00.000Z`);
  t.setUTCDate(t.getUTCDate() - days);
  return t.toISOString().slice(0, 10);
}

export function filterRows(
  rows: TokenUsageRow[],
  projectId: string | 'all',
  cutoffDay: string,
): TokenUsageRow[] {
  return rows.filter((r) => {
    if (projectId !== 'all' && r.projectId !== projectId) return false;
    if (r.day < cutoffDay) return false;
    return true;
  });
}

export function densifyDays(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  const cur = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function modelKeysSorted(rows: TokenUsageRow[]): string[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const k = modelKey(r.modelId, r.isSubagent);
    totals.set(k, (totals.get(k) ?? 0) + r.input + r.output + r.cached);
  }
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

function metricValue(r: TokenUsageRow, m: Metric): number {
  if (m === 'input') return r.input;
  if (m === 'output') return r.output;
  if (m === 'cached') return r.cached;
  return r.input + r.output + r.cached;
}

export type DayRow = { day: string; values: Record<string, number> };

export function stackData(
  rows: TokenUsageRow[],
  days: string[],
  keys: string[],
  metric: Metric,
): DayRow[] {
  const dayMap = new Map<string, DayRow>();
  for (const d of days) {
    const values: Record<string, number> = {};
    for (const k of keys) values[k] = 0;
    dayMap.set(d, { day: d, values });
  }
  for (const r of rows) {
    const slot = dayMap.get(r.day);
    if (!slot) continue;
    const k = modelKey(r.modelId, r.isSubagent);
    if (!(k in slot.values)) continue;
    slot.values[k] += metricValue(r, metric);
  }
  return days.map((d) => dayMap.get(d)!);
}

export type ModelSummary = {
  modelId: string;
  isSubagent: boolean;
  input: number;
  output: number;
  cached: number;
  total: number;
};

export function summariesPerModel(rows: TokenUsageRow[]): ModelSummary[] {
  const acc = new Map<string, ModelSummary>();
  for (const r of rows) {
    const k = modelKey(r.modelId, r.isSubagent);
    const prev = acc.get(k);
    if (prev) {
      prev.input += r.input;
      prev.output += r.output;
      prev.cached += r.cached;
      prev.total = prev.input + prev.output + prev.cached;
    } else {
      acc.set(k, {
        modelId: r.modelId,
        isSubagent: r.isSubagent,
        input: r.input,
        output: r.output,
        cached: r.cached,
        total: r.input + r.output + r.cached,
      });
    }
  }
  return Array.from(acc.values()).sort((a, b) => b.total - a.total);
}
```

- [ ] **Step 4: Run — should pass.**

Run: `npm test -- tokens/aggregate`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/tokens/aggregate.ts tests/unit/tokens/aggregate.test.ts
git commit -m "feat(tokens): client aggregate utilities"
```

---

## Task 6: Palette

A small color mapper. Subagent variants get the same hue at reduced lightness, so the chart legend visually pairs them with their parent model.

**Files:**
- Create: `src/tokens/palette.ts`
- Create: `tests/unit/tokens/palette.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `tests/unit/tokens/palette.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { colorFor } from '../../../src/tokens/palette';

describe('colorFor', () => {
  const keys = ['opus', 'sonnet', 'haiku'];

  it('returns the same color for the same key', () => {
    expect(colorFor('opus', keys)).toBe(colorFor('opus', keys));
  });

  it('returns different colors for different keys', () => {
    expect(colorFor('opus', keys)).not.toBe(colorFor('sonnet', keys));
  });

  it('subagent variant uses a different color than its main', () => {
    // |sub suffix is a recognized convention from modelKey()
    const c = colorFor('opus', [...keys, 'opus|sub']);
    const s = colorFor('opus|sub', [...keys, 'opus|sub']);
    expect(c).not.toBe(s);
  });

  it('returns a fallback color for keys not in the input list', () => {
    expect(colorFor('unknown', keys)).toMatch(/^#|^rgb/);
  });
});
```

- [ ] **Step 2: Run — should fail.**

Run: `npm test -- tokens/palette`
Expected: FAIL.

- [ ] **Step 3: Implement `src/tokens/palette.ts`.**

```ts
const BASE = [
  '#00E5FF', // cyan (matches --edge-trail accent)
  '#FF4FD8', // magenta
  '#FFB547', // amber
  '#5BE6B5', // mint
  '#B47FF6', // violet
  '#FF6E6E', // coral
  '#7FE0FF', // pale cyan
  '#E5E07F', // pale gold
];

const SUB = [
  '#0A7383',
  '#7B2967',
  '#7B5921',
  '#2D7359',
  '#5A3D7B',
  '#7B3535',
  '#3F7283',
  '#73703F',
];

const FALLBACK = '#9CA3AF';

export function colorFor(key: string, keys: string[]): string {
  const idx = keys.indexOf(key);
  if (idx < 0) return FALLBACK;
  const palette = key.endsWith('|sub') ? SUB : BASE;
  return palette[idx % palette.length];
}
```

- [ ] **Step 4: Run — should pass.**

Run: `npm test -- tokens/palette`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/tokens/palette.ts tests/unit/tokens/palette.test.ts
git commit -m "feat(tokens): color palette"
```

---

## Task 7: OverallSpendList component (Section A)

**Files:**
- Create: `src/tokens/OverallSpendList.tsx`
- Create: `tests/unit/tokens/OverallSpendList.test.tsx`

- [ ] **Step 1: Write the failing test.**

Create `tests/unit/tokens/OverallSpendList.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverallSpendList } from '../../../src/tokens/OverallSpendList';
import type { ModelSummary } from '../../../src/tokens/aggregate';

const summaries: ModelSummary[] = [
  { modelId: 'opus', isSubagent: false, input: 100, output: 50, cached: 200, total: 350 },
  { modelId: 'opus', isSubagent: true,  input: 2,   output: 1,  cached: 10,  total: 13 },
];

describe('OverallSpendList', () => {
  it('renders one row per summary with the model label', () => {
    render(<OverallSpendList summaries={summaries} />);
    expect(screen.getByTestId('model-row-opus')).toBeInTheDocument();
    expect(screen.getByTestId('model-row-opus|sub')).toBeInTheDocument();
  });

  it('renders an empty-state message when there are no summaries', () => {
    render(<OverallSpendList summaries={[]} />);
    expect(screen.getByText(/NO USAGE/i)).toBeInTheDocument();
  });

  it('marks the subagent row with a "subagent" indicator', () => {
    render(<OverallSpendList summaries={summaries} />);
    const row = screen.getByTestId('model-row-opus|sub');
    expect(row).toHaveTextContent(/subagent/i);
  });
});
```

- [ ] **Step 2: Run — should fail.**

Run: `npm test -- OverallSpendList`
Expected: FAIL.

- [ ] **Step 3: Implement the component.**

Create `src/tokens/OverallSpendList.tsx`:

```tsx
import { useMemo } from 'react';
import type { ModelSummary } from './aggregate';
import { modelKey } from './aggregate';
import { colorFor } from './palette';
import { formatTokens } from '../util/formatTokens';

type Props = { summaries: ModelSummary[] };

export function OverallSpendList({ summaries }: Props) {
  const maxTotal = useMemo(
    () => summaries.reduce((m, s) => Math.max(m, s.total), 0),
    [summaries],
  );
  const keys = useMemo(
    () => summaries.map((s) => modelKey(s.modelId, s.isSubagent)),
    [summaries],
  );

  if (summaries.length === 0) {
    return <div style={styles.empty}>NO USAGE IN RANGE</div>;
  }

  return (
    <div style={styles.list}>
      {summaries.map((s) => {
        const k = modelKey(s.modelId, s.isSubagent);
        const widthPct = maxTotal > 0 ? (s.total / maxTotal) * 100 : 0;
        const inputPct = s.total > 0 ? (s.input / s.total) * widthPct : 0;
        const outputPct = s.total > 0 ? (s.output / s.total) * widthPct : 0;
        const cachedPct = s.total > 0 ? (s.cached / s.total) * widthPct : 0;
        return (
          <div key={k} data-testid={`model-row-${k}`} style={styles.row}>
            <div style={styles.rowTop}>
              <span style={styles.modelName}>
                {s.modelId}
                {s.isSubagent && <span style={styles.subTag}> · subagent</span>}
              </span>
              <span style={styles.breakdown}>
                IN {formatTokens(s.input)} · OUT {formatTokens(s.output)} · CACHED {formatTokens(s.cached)}
              </span>
              <span style={styles.total}>{formatTokens(s.total)}</span>
            </div>
            <div style={styles.barTrack} aria-hidden>
              <div style={{ ...styles.barSeg, width: `${inputPct}%`,  background: colorFor(k, keys) }} />
              <div style={{ ...styles.barSeg, width: `${outputPct}%`, background: colorFor(k, keys), opacity: 0.65 }} />
              <div style={{ ...styles.barSeg, width: `${cachedPct}%`, background: colorFor(k, keys), opacity: 0.35 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  list: { display: 'flex' as const, flexDirection: 'column' as const, gap: 10, padding: 12, overflowY: 'auto' as const },
  row: { display: 'flex' as const, flexDirection: 'column' as const, gap: 4 },
  rowTop: {
    display: 'flex' as const,
    alignItems: 'baseline' as const,
    gap: 12,
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
  },
  modelName: { color: 'var(--text)', letterSpacing: 1, flexShrink: 0 },
  subTag: { color: 'var(--text-dim)' },
  breakdown: { color: 'var(--text-dim)', flex: 1, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const },
  total: { color: 'var(--edge-trail)', flexShrink: 0 },
  barTrack: {
    display: 'flex' as const,
    height: 8,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(110,224,238,0.18)',
  },
  barSeg: { height: '100%' },
  empty: {
    padding: 24,
    color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
    letterSpacing: 3,
    fontSize: 11,
    textAlign: 'center' as const,
  },
};
```

- [ ] **Step 4: Run — should pass.**

Run: `npm test -- OverallSpendList`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/tokens/OverallSpendList.tsx tests/unit/tokens/OverallSpendList.test.tsx
git commit -m "feat(tokens): OverallSpendList component"
```

---

## Task 8: DailyUsageChart component (Section B)

The d3 stacked bar chart. Smaller test surface than the unit tests above — we check structural output, not pixel positions.

**Files:**
- Create: `src/tokens/DailyUsageChart.tsx`
- Create: `tests/unit/tokens/DailyUsageChart.test.tsx`

- [ ] **Step 1: Write the failing test.**

Create `tests/unit/tokens/DailyUsageChart.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DailyUsageChart } from '../../../src/tokens/DailyUsageChart';
import type { TokenUsageRow } from '../../../src/api/client';

const rows: TokenUsageRow[] = [
  { projectId: 'p1', modelId: 'opus', isSubagent: false, day: '2026-05-20', input: 100, output: 50, cached: 200 },
  { projectId: 'p1', modelId: 'opus', isSubagent: false, day: '2026-05-22', input: 10, output: 5, cached: 0 },
  { projectId: 'p1', modelId: 'sonnet', isSubagent: false, day: '2026-05-21', input: 7, output: 3, cached: 0 },
];

describe('DailyUsageChart', () => {
  it('renders one <rect> per (day, modelKey) for non-empty data', () => {
    render(
      <DailyUsageChart
        rows={rows}
        projectId="all"
        preset="all"
        today="2026-05-22"
        metric="total"
      />
    );
    // 3 days × 2 model keys = 6 stack rects (zero-height ones still rendered)
    const rects = document.querySelectorAll('svg [data-role="bar"]');
    expect(rects.length).toBe(6);
  });

  it('renders "NO USAGE IN RANGE" when no rows match the filter', () => {
    render(
      <DailyUsageChart
        rows={[]}
        projectId="all"
        preset="all"
        today="2026-05-22"
        metric="total"
      />
    );
    expect(screen.getByText(/NO USAGE IN RANGE/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — should fail.**

Run: `npm test -- DailyUsageChart`
Expected: FAIL.

- [ ] **Step 3: Implement the chart (with tooltip + clickable legend).**

Create `src/tokens/DailyUsageChart.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { TokenUsageRow } from '../api/client';
import {
  presetCutoff,
  filterRows,
  densifyDays,
  modelKeysSorted,
  stackData,
  type RangePreset,
  type Metric,
  type DayRow,
} from './aggregate';
import { colorFor } from './palette';
import { formatTokens } from '../util/formatTokens';

type Props = {
  rows: TokenUsageRow[];
  projectId: string | 'all';
  preset: RangePreset;
  today: string;
  metric: Metric;
};

type Hover = { day: string; key: string; value: number; cx: number; cy: number } | null;

const MARGIN = { top: 16, right: 16, bottom: 28, left: 56 };

export function DailyUsageChart({ rows, projectId, preset, today, metric }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(320);
  const [hover, setHover] = useState<Hover>(null);
  const [disabled, setDisabled] = useState<Set<string>>(new Set());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setWidth(Math.max(200, Math.floor(r.width)));
      setHeight(Math.max(160, Math.floor(r.height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // allKeys is every model key present in the filtered data; activeKeys
  // is the subset to actually stack (legend toggles flip membership).
  const { days, allKeys, activeKeys, data, hasData } = useMemo(() => {
    const cutoff = presetCutoff(preset, today);
    const filtered = filterRows(rows, projectId, cutoff);
    if (filtered.length === 0) {
      return { days: [] as string[], allKeys: [] as string[], activeKeys: [] as string[], data: [] as DayRow[], hasData: false };
    }
    const earliest = filtered.reduce((m, r) => (r.day < m ? r.day : m), filtered[0].day);
    const from = earliest > cutoff ? earliest : cutoff;
    const days = densifyDays(from, today);
    const allKeys = modelKeysSorted(filtered);
    const activeKeys = allKeys.filter((k) => !disabled.has(k));
    const data = stackData(filtered, days, activeKeys, metric);
    return { days, allKeys, activeKeys, data, hasData: true };
  }, [rows, projectId, preset, today, metric, disabled]);

  useEffect(() => {
    if (!hasData || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const innerW = Math.max(10, width - MARGIN.left - MARGIN.right);
    const innerH = Math.max(10, height - MARGIN.top - MARGIN.bottom);

    const x = d3.scaleBand<string>()
      .domain(days)
      .range([MARGIN.left, MARGIN.left + innerW])
      .padding(0.2);

    const stacker = d3.stack<DayRow>()
      .keys(activeKeys)
      .value((d, k) => d.values[k] ?? 0);
    const series = stacker(data);

    const maxY = d3.max(series, (s) => d3.max(s, (d) => d[1])) ?? 0;
    const y = d3.scaleLinear()
      .domain([0, Math.max(1, maxY)])
      .nice()
      .range([MARGIN.top + innerH, MARGIN.top]);

    // grid lines
    svg.append('g')
      .attr('transform', `translate(${MARGIN.left},0)`)
      .call(
        d3.axisLeft(y)
          .ticks(4)
          .tickSize(-innerW)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', 'rgba(110,224,238,0.08)');

    // y axis
    svg.append('g')
      .attr('transform', `translate(${MARGIN.left},0)`)
      .call(
        d3.axisLeft(y)
          .ticks(4)
          .tickFormat((d) => formatTokens(d as number))
      )
      .call((g) => {
        g.selectAll('text').attr('fill', 'var(--text-dim)').style('font-family', 'ui-monospace, monospace').style('font-size', '10px');
        g.selectAll('line').attr('stroke', 'rgba(110,224,238,0.25)');
        g.select('.domain').attr('stroke', 'rgba(110,224,238,0.25)');
      });

    // x axis (thinned to ~8 ticks)
    const tickEvery = Math.max(1, Math.ceil(days.length / 8));
    const xTickValues = days.filter((_, i) => i % tickEvery === 0);
    svg.append('g')
      .attr('transform', `translate(0,${MARGIN.top + innerH})`)
      .call(
        d3.axisBottom(x).tickValues(xTickValues).tickFormat((d) => String(d).slice(5))
      )
      .call((g) => {
        g.selectAll('text').attr('fill', 'var(--text-dim)').style('font-family', 'ui-monospace, monospace').style('font-size', '10px');
        g.selectAll('line').attr('stroke', 'rgba(110,224,238,0.25)');
        g.select('.domain').attr('stroke', 'rgba(110,224,238,0.25)');
      });

    // bars (with hover handlers) — one <g> per series, closure captures the key
    const barsG = svg.append('g');
    series.forEach((s) => {
      barsG.append('g')
        .attr('fill', colorFor(s.key, allKeys))
        .selectAll('rect')
        .data(s)
        .join('rect')
        .attr('data-role', 'bar')
        .attr('data-key', s.key)
        .attr('data-day', (d) => d.data.day)
        .attr('x', (d) => x(d.data.day) ?? 0)
        .attr('y', (d) => y(d[1]))
        .attr('height', (d) => Math.max(0, y(d[0]) - y(d[1])))
        .attr('width', x.bandwidth())
        .style('cursor', 'crosshair')
        .on('mouseenter', (_event, d) => {
          const rx = (x(d.data.day) ?? 0) + x.bandwidth() / 2;
          const ry = y(d[1]);
          setHover({ day: d.data.day, key: s.key, value: d[1] - d[0], cx: rx, cy: ry });
        })
        .on('mouseleave', () => setHover(null));
    });
  }, [hasData, width, height, days, allKeys, activeKeys, data]);

  function toggleKey(k: string): void {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  return (
    <div ref={containerRef} style={styles.container}>
      {!hasData && <div style={styles.empty}>NO USAGE IN RANGE</div>}
      {hasData && <svg ref={svgRef} width={width} height={height} />}
      {hover && (
        <div
          data-testid="chart-tooltip"
          style={{ ...styles.tooltip, left: hover.cx + 8, top: Math.max(0, hover.cy - 36) }}
        >
          <div>{hover.day}</div>
          <div style={{ color: colorFor(hover.key, allKeys) }}>{hover.key}</div>
          <div>{formatTokens(hover.value)}</div>
        </div>
      )}
      {hasData && allKeys.length > 0 && (
        <div style={styles.legend} data-testid="chart-legend">
          {allKeys.map((k) => {
            const off = disabled.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKey(k)}
                style={{ ...styles.chip, opacity: off ? 0.35 : 1 }}
                data-testid={`legend-chip-${k}`}
                aria-pressed={!off}
              >
                <span style={{ ...styles.swatch, background: colorFor(k, allKeys) }} aria-hidden />
                {k}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { width: '100%', height: '100%', position: 'relative' as const, minHeight: 200 },
  empty: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-dim)',
    letterSpacing: 3,
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
  },
  tooltip: {
    position: 'absolute' as const,
    background: 'rgba(5,8,13,0.95)',
    border: '1px solid rgba(110,224,238,0.6)',
    color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 10,
    letterSpacing: 1,
    padding: '4px 8px',
    pointerEvents: 'none' as const,
    whiteSpace: 'nowrap' as const,
    zIndex: 4,
  },
  legend: {
    position: 'absolute' as const,
    bottom: 4,
    right: 8,
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    pointerEvents: 'auto' as const,
  },
  chip: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid rgba(110, 224, 238, 0.4)',
    color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 10,
    letterSpacing: 1,
    padding: '2px 6px',
    cursor: 'pointer' as const,
  },
  swatch: { width: 10, height: 10, display: 'inline-block' as const },
};
```

- [ ] **Step 4: Run — should pass.**

Run: `npm test -- DailyUsageChart`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/tokens/DailyUsageChart.tsx tests/unit/tokens/DailyUsageChart.test.tsx
git commit -m "feat(tokens): DailyUsageChart d3 stacked bar"
```

---

## Task 9: TokensPage shell

The page glue: query the endpoint, own filter state, render the two sections.

**Files:**
- Create: `src/tokens/TokensPage.tsx`

(No standalone test for this component — it's mostly glue. The e2e test in Task 11 covers it end-to-end.)

- [ ] **Step 1: Implement `src/tokens/TokensPage.tsx`.**

```tsx
import { useMemo, useState } from 'react';
import { useTokenUsage } from '../api/hooks';
import {
  presetCutoff,
  filterRows,
  summariesPerModel,
  type RangePreset,
  type Metric,
} from './aggregate';
import { OverallSpendList } from './OverallSpendList';
import { DailyUsageChart } from './DailyUsageChart';
import { formatPath } from '../util/formatPath';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TokensPage() {
  const [projectId, setProjectId] = useState<string | 'all'>('all');
  const [preset, setPreset] = useState<RangePreset>('all');
  const [metric, setMetric] = useState<Metric>('total');
  const query = useTokenUsage();
  const today = todayUtc();

  const summaries = useMemo(() => {
    if (!query.data) return [];
    const cutoff = presetCutoff(preset, today);
    return summariesPerModel(filterRows(query.data.rows, projectId, cutoff));
  }, [query.data, projectId, preset, today]);

  return (
    <div style={styles.page} data-testid="tokens-page">
      <div style={styles.chrome}>
        <div style={styles.title}>TOKEN USAGE</div>
        <select
          data-testid="tokens-project-filter"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          style={styles.select}
          aria-label="project filter"
        >
          <option value="all">ALL PROJECTS</option>
          {query.data?.projects.map((p) => (
            <option key={p.id} value={p.id}>{formatPath(p.cwd)}</option>
          ))}
        </select>
        <div style={styles.presetGroup}>
          {(['7d', '30d', '90d', 'all'] as RangePreset[]).map((p) => (
            <button
              key={p}
              type="button"
              data-testid={`tokens-preset-${p}`}
              onClick={() => setPreset(p)}
              style={{ ...styles.presetBtn, ...(preset === p ? styles.presetBtnOn : null) }}
              aria-pressed={preset === p}
            >{p.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {query.isLoading && <div style={styles.muted}>LOADING…</div>}
      {query.error && (
        <div style={styles.error}>FAILED TO LOAD USAGE: {(query.error as Error).message}</div>
      )}
      {query.data && query.data.projects.length === 0 && (
        <div style={styles.muted}>NO SESSIONS FOUND</div>
      )}
      {query.data && query.data.projects.length > 0 && (
        <>
          <div style={styles.panelTop}>
            <OverallSpendList summaries={summaries} />
          </div>
          <div style={styles.panelBottom}>
            <div style={styles.subHeader}>
              <div style={styles.subTitle}>DAILY USAGE</div>
              <div style={styles.presetGroup}>
                {(['total', 'input', 'output', 'cached'] as Metric[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-testid={`tokens-metric-${m}`}
                    onClick={() => setMetric(m)}
                    style={{ ...styles.presetBtn, ...(metric === m ? styles.presetBtnOn : null) }}
                    aria-pressed={metric === m}
                  >{m.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <div style={styles.chartHost}>
              <DailyUsageChart
                rows={query.data.rows}
                projectId={projectId}
                preset={preset}
                metric={metric}
                today={today}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  page: {
    flex: 1,
    minHeight: 0,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 8,
    padding: '12px 16px',
    overflow: 'hidden' as const,
  },
  chrome: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 12,
    flexShrink: 0,
  },
  title: {
    fontSize: 11,
    letterSpacing: 3,
    color: 'var(--edge-trail)',
    fontFamily: 'ui-monospace, monospace',
  },
  select: {
    background: 'transparent',
    border: '1px solid var(--edge-idle)',
    color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    letterSpacing: 1,
    padding: '4px 8px',
  },
  presetGroup: {
    display: 'flex' as const,
    gap: 6,
    marginLeft: 'auto',
    flexShrink: 0,
  },
  presetBtn: {
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
  presetBtnOn: {
    background: 'rgba(0,229,255,0.10)',
    color: 'var(--edge-trail)',
    borderColor: 'var(--edge-trail)',
  },
  panelTop: {
    border: '1px solid rgba(0,229,255,0.55)',
    background: 'rgba(5,8,13,0.6)',
    minHeight: 200,
    maxHeight: '40%',
    overflow: 'auto' as const,
    flexShrink: 0,
  },
  panelBottom: {
    border: '1px solid rgba(0,229,255,0.55)',
    background: 'rgba(5,8,13,0.6)',
    flex: 1,
    minHeight: 0,
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  subHeader: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: '8px 12px',
    borderBottom: '1px solid rgba(110,224,238,0.18)',
    flexShrink: 0,
  },
  subTitle: {
    fontSize: 11,
    letterSpacing: 3,
    color: 'var(--edge-trail)',
    fontFamily: 'ui-monospace, monospace',
  },
  chartHost: { flex: 1, minHeight: 0 },
  muted: { padding: 24, color: 'var(--text-dim)', letterSpacing: 4, fontFamily: 'ui-monospace, monospace' },
  error: { padding: 24, color: 'var(--node-failed)', fontFamily: 'ui-monospace, monospace' },
};
```

- [ ] **Step 2: Typecheck.**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit.**

```bash
git add src/tokens/TokensPage.tsx
git commit -m "feat(tokens): TokensPage shell"
```

---

## Task 10: Wire routing in App + LibraryPanel link

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/library/LibraryPanel.tsx`

- [ ] **Step 1: Open `src/App.tsx`. Add imports near the top of the import block.**

Add after the `import { Legend } from './components/Legend';` line (preserving alphabetical-ish grouping the file already uses):

```ts
import { TokensPage } from './tokens/TokensPage';
import { useHashRoute } from './util/useHashRoute';
```

- [ ] **Step 2: Inside `App()`, just after the existing hooks (after `const promptsQuery = usePromptList();`), add:**

```ts
const route = useHashRoute();
```

- [ ] **Step 3: Swap the centerpiece on the tokens route.**

In `src/App.tsx`, inside the JSX returned by `App()`, the `<div style={styles.contentFrame}>` (around line 212) currently contains 7 sibling expressions (`{!selected && ...}`, `{selected && isLoading && ...}`, ..., `<DetailPanel ... />`). Wrap them all in a route conditional.

Edit the file so the section transforms from:

```tsx
<main style={styles.main}>
  <div style={styles.contentFrame}>
    {!selected && <div style={styles.empty}>SELECT A SESSION</div>}
```

to:

```tsx
<main style={styles.main}>
  <div style={styles.contentFrame}>
    {route === 'tokens' ? <TokensPage /> : (<>
    {!selected && <div style={styles.empty}>SELECT A SESSION</div>}
```

…and the closing of the same `<div style={styles.contentFrame}>` from:

```tsx
          <DetailPanel
            milestone={displayedMilestone}
            onClose={handleDetailClose}
            width={detailWidth}
            onResize={(d) => setDetailWidth((w) => w + d)}
          />
        </div>
      </main>
```

to:

```tsx
          <DetailPanel
            milestone={displayedMilestone}
            onClose={handleDetailClose}
            width={detailWidth}
            onResize={(d) => setDetailWidth((w) => w + d)}
          />
        </>)}
        </div>
      </main>
```

Net effect: a single `{route === 'tokens' ? <TokensPage /> : (<>...existing body...</>)}` wrapper around the existing siblings, leaving them otherwise untouched.

- [ ] **Step 4: Open `src/components/library/LibraryPanel.tsx`. Add the `TOKENS` link in the header `<div style={styles.header}>` row.**

Find:

```tsx
<div style={styles.header}>
  <span style={styles.dropdownWrap}>
    <select ... />
  </span>
  <button
    onClick={onToggleCollapsed}
    ...
  >«</button>
</div>
```

Insert a new button between the dropdown wrap and the collapse button:

```tsx
<button
  type="button"
  data-testid="tokens-link"
  onClick={() => {
    window.location.hash = window.location.hash === '#/tokens' ? '' : '#/tokens';
  }}
  style={{
    ...styles.tokensLink,
    ...(typeof window !== 'undefined' && window.location.hash === '#/tokens' ? styles.tokensLinkOn : null),
  }}
  aria-label="tokens"
  title="token usage"
>TOKENS</button>
```

- [ ] **Step 5: Add new style entries to the styles block at the bottom of `LibraryPanel.tsx`.**

Inside `const styles = { ... }`, add:

```ts
tokensLink: {
  background: 'transparent',
  border: '1px solid var(--edge-idle)',
  color: 'var(--text)',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 10,
  letterSpacing: 2,
  padding: '4px 8px',
  cursor: 'pointer' as const,
},
tokensLinkOn: {
  borderColor: 'var(--edge-trail)',
  color: 'var(--edge-trail)',
  background: 'rgba(0,229,255,0.10)',
},
```

- [ ] **Step 6: Typecheck + unit tests.**

Run: `npm run typecheck && npm test`
Expected: No errors; all tests pass.

- [ ] **Step 7: Manual smoke test.**

Run: `npm run dev -- --port 5174`. Open `http://localhost:5174` in a browser:
- Confirm app renders normally.
- Click `TOKENS` in the sidebar header. URL hash becomes `#/tokens`. Page shows TOKEN USAGE chrome with model rows (your real sessions).
- Click `TOKENS` again. Returns to main view, sidebar still present.
- Press browser back. Hash clears. Returns to main view.

Stop the dev server.

- [ ] **Step 8: Commit.**

```bash
git add src/App.tsx src/components/library/LibraryPanel.tsx
git commit -m "feat(tokens): wire #/tokens route + sidebar link"
```

---

## Task 11: E2E test + fixtures

**Files:**
- Create: `tests/fixtures/claude-projects/C--demo-tokens/2026-05-20-tok1.jsonl`
- Create: `tests/fixtures/claude-projects/C--demo-tokens/2026-05-23-tok2.jsonl`
- Create: `tests/fixtures/claude-projects/C--demo-tokens/2026-05-23-tok2/subagents/agent-tok-sub.jsonl`
- Create: `tests/e2e/tokens-page.spec.ts`
- Modify: `tests/e2e/discovery-load.spec.ts`

- [ ] **Step 1: Create fixture session 1 (uses model A on day 1).**

Write `tests/fixtures/claude-projects/C--demo-tokens/2026-05-20-tok1.jsonl`:

```jsonl
{"uuid":"t1","parentUuid":null,"timestamp":"2026-05-20T10:00:00Z","type":"user","message":{"role":"user","content":"hi"}}
{"uuid":"t2","parentUuid":"t1","timestamp":"2026-05-20T10:00:01Z","type":"assistant","message":{"role":"assistant","model":"claude-opus-4-7","content":[{"type":"text","text":"hello"}],"usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":200,"cache_creation_input_tokens":300}}}
```

- [ ] **Step 2: Create fixture session 2 (uses model B + has a subagent, on day 2).**

Write `tests/fixtures/claude-projects/C--demo-tokens/2026-05-23-tok2.jsonl`:

```jsonl
{"uuid":"t3","parentUuid":null,"timestamp":"2026-05-23T10:00:00Z","type":"user","message":{"role":"user","content":"hi"}}
{"uuid":"t4","parentUuid":"t3","timestamp":"2026-05-23T10:00:01Z","type":"assistant","message":{"role":"assistant","model":"claude-sonnet-4-6","content":[{"type":"text","text":"hi"}],"usage":{"input_tokens":7,"output_tokens":3,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}
```

Write `tests/fixtures/claude-projects/C--demo-tokens/2026-05-23-tok2/subagents/agent-tok-sub.jsonl`:

```jsonl
{"uuid":"sub1","parentUuid":null,"timestamp":"2026-05-23T10:30:00Z","type":"assistant","message":{"role":"assistant","model":"claude-opus-4-7","content":[{"type":"text","text":"sub"}],"usage":{"input_tokens":2,"output_tokens":1,"cache_read_input_tokens":5,"cache_creation_input_tokens":5}}}
```

- [ ] **Step 3: Update the discovery-load test count from 4 to 5 (we added a 5th fixture project).**

In `tests/e2e/discovery-load.spec.ts`, change:

```ts
await expect(page.locator('aside li[data-testid^="session-item"]')).toHaveCount(4);
```

to:

```ts
await expect(page.locator('aside li[data-testid^="session-item"]')).toHaveCount(5);
```

- [ ] **Step 4: Write the e2e test.**

Create `tests/e2e/tokens-page.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('tokens page: shows per-model rows and stacked-bar chart from fixtures', async ({ page }) => {
  await page.goto('/#/tokens');

  // Page chrome present
  await expect(page.getByTestId('tokens-page')).toBeVisible();
  await expect(page.getByText('TOKEN USAGE')).toBeVisible();

  // Fixtures contribute two model rows (opus main + opus sub + sonnet main = 3)
  await expect(page.getByTestId('model-row-claude-opus-4-7')).toBeVisible();
  await expect(page.getByTestId('model-row-claude-opus-4-7|sub')).toBeVisible();
  await expect(page.getByTestId('model-row-claude-sonnet-4-6')).toBeVisible();

  // Chart renders bars (3 model keys × N days)
  const initialRects = await page.locator('svg [data-role="bar"]').count();
  expect(initialRects).toBeGreaterThan(0);

  // 7D preset narrows the window — bar count must change (fixture days are
  // 2026-05-20 and 2026-05-23; "today" is whatever the test runner's date is
  // when invoked, so the assertion is "count changes" not "count equals N").
  await page.getByTestId('tokens-preset-7d').click();
  await expect.poll(async () => page.locator('svg [data-role="bar"]').count())
    .not.toBe(initialRects);

  // Metric switcher should still produce some bars when there's any data
  // in the current window. (If the 7d window contained no data, the empty
  // state is shown instead — that's also a valid outcome.)
  await page.getByTestId('tokens-preset-all').click();
  await page.getByTestId('tokens-metric-input').click();
  await expect(page.locator('svg [data-role="bar"]')).toHaveCount(initialRects);
});
```

- [ ] **Step 5: Run unit + e2e tests.**

Run: `npm test && npm run test:e2e`
Expected: Unit tests pass. E2E tests pass (existing 16 specs + new tokens spec, with discovery-load updated).

- [ ] **Step 6: Commit.**

```bash
git add tests/fixtures/claude-projects/C--demo-tokens tests/e2e/tokens-page.spec.ts tests/e2e/discovery-load.spec.ts
git commit -m "test(tokens): e2e + fixtures for token-usage page"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run the full quality bar.**

Run: `npm run typecheck && npm test && npm run test:e2e`
Expected: All green.

- [ ] **Step 2: Manual end-to-end smoke.**

Run: `npm run dev` (no `CLAUDE_HOME` override → uses real `~/.claude/projects`).

In the browser:
1. Confirm sidebar header has the new TOKENS button.
2. Click TOKENS → URL hash becomes `#/tokens`, page renders with at least one model row from your real sessions.
3. Switch project filter to a specific project → rows update.
4. Click `7D` / `30D` / `90D` / `ALL` → chart re-renders, bar counts change.
5. Click `IN` / `OUT` / `CACHED` / `TOTAL` → chart re-renders (same x-axis days).
6. Click TOKENS again → returns to main view.
7. Browser back / forward → respects hash route.

Stop the dev server.

- [ ] **Step 3: Report status to the user.**

Summarize: which tasks were done, what was verified locally, on what branch (`feature/token-usage-page`). Do not merge to `main` — that requires explicit user authorization per repo convention.