# Context Badge, Click-to-Set Playhead, Responsive Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land three improvements on the ThoughtGraph POC: a per-node context-size badge sourced from the assistant `usage` block, single-click trail repositioning that moves the playhead, and a desktop-responsive shell (1280–3840px) with a stacked gutter, sidebar auto-collapse below 1400px, and centered content cap at 2400px.

**Architecture:** Pure additive changes. Milestone parsing gains optional `usage` and `contextSize` fields populated from the existing `message.usage` field in assistant events. Rendering picks them up in three places (chip on `NodeShape`, hover line in `NodeTooltip`, block in `DetailPanel`). Playback gesture is rewired via a new `onScrubTo` prop on `GraphCanvas`. Layout shell changes happen in `App.tsx`, `NowPlaying.tsx`, and `PlaybackControls.tsx`; no changes to `usePlayback`, `useCamera`, or `layout.ts`.

**Tech Stack:** React 19, TypeScript 5, Vite 6, D3 v7, Vitest 3 (unit), Playwright 1 (E2E). All existing.

---

## File Structure

**Source files to modify:**
- `src/parse/types.ts` — add `ContextUsage` type; add `usage` / `contextSize` to `Milestone`
- `src/parse/milestones.ts` — populate usage when building assistant-derived milestones; propagate to user-prompt milestones
- `src/components/NodeShape.tsx` — render corner-chip when conditions met
- `src/components/NodeTooltip.tsx` — append usage breakdown to hover hint
- `src/components/DetailPanel.tsx` — append `CONTEXT` block when usage present
- `src/components/FilterToggles.tsx` — add `showAllContext` toggle to `Filters`
- `src/components/GraphCanvas.tsx` — wire node click to scrub; respect `showAllContext` and traversed-set when deciding which badges to render
- `src/components/NowPlaying.tsx` — drop fixed flex sizing; span the row
- `src/components/PlaybackControls.tsx` — make `Scrubber` flex
- `src/App.tsx` — stacked gutter; `contentFrame` wrapper with `CONTENT_MAX`; sidebar auto-collapse effect with `NARROW_THRESHOLD`

**Source files to create:**
- `src/util/formatTokens.ts` — `formatTokens(n)` short token-count formatter

**Test files to modify:**
- `tests/unit/parse/milestones.test.ts` — usage extraction + propagation

**Test files to create:**
- `tests/unit/format-tokens.test.ts`
- `tests/e2e/context-badge.spec.ts`
- `tests/e2e/click-scrub.spec.ts`
- `tests/e2e/responsive-shell.spec.ts`

---

## Task 1: `formatTokens` util (TDD)

**Files:**
- Create: `src/util/formatTokens.ts`
- Test: `tests/unit/format-tokens.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/format-tokens.test.ts
import { describe, it, expect } from 'vitest';
import { formatTokens } from '../../src/util/formatTokens';

describe('formatTokens', () => {
  it('renders under-1000 as integer', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(6)).toBe('6');
    expect(formatTokens(947)).toBe('947');
    expect(formatTokens(999)).toBe('999');
  });

  it('renders 1000-9999 with one decimal kilo', () => {
    expect(formatTokens(1000)).toBe('1.0k');
    expect(formatTokens(1234)).toBe('1.2k');
    expect(formatTokens(9499)).toBe('9.5k');
    expect(formatTokens(9999)).toBe('10k');
  });

  it('renders 10000-999999 as integer kilo', () => {
    expect(formatTokens(10000)).toBe('10k');
    expect(formatTokens(47041)).toBe('47k');
    expect(formatTokens(180555)).toBe('181k');
    expect(formatTokens(999499)).toBe('999k');
  });

  it('renders >= 1_000_000 with one decimal mega', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M');
    expect(formatTokens(1_234_567)).toBe('1.2M');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- format-tokens`
Expected: FAIL with module-not-found / `formatTokens is not exported` error.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/util/formatTokens.ts
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) {
    const k = n / 1000;
    const rounded = Math.round(k * 10) / 10;
    if (rounded >= 10) return `${Math.round(rounded)}k`;
    return `${rounded.toFixed(1)}k`;
  }
  if (n < 1_000_000) {
    return `${Math.round(n / 1000)}k`;
  }
  const m = n / 1_000_000;
  const rounded = Math.round(m * 10) / 10;
  return `${rounded.toFixed(1)}M`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- format-tokens`
Expected: PASS (all four `describe` blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/util/formatTokens.ts tests/unit/format-tokens.test.ts
git commit -m "feat(util): formatTokens compact short-form for chip and hover hint"
```

---

## Task 2: Add `ContextUsage` type and optional fields on `Milestone`

**Files:**
- Modify: `src/parse/types.ts`

- [ ] **Step 1: Add the type and fields**

Edit `src/parse/types.ts`. Add `ContextUsage` near the top (after the `MilestoneKind` export, before the `Milestone` export), and add two optional fields to `Milestone`:

```ts
export type ContextUsage = {
  input: number;
  cacheRead: number;
  cacheCreation: number;
  output: number;
};

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
  usage?: ContextUsage;
  contextSize?: number;
};
```

- [ ] **Step 2: Run typecheck to confirm no break**

Run: `npm run typecheck`
Expected: PASS — optional fields don't break existing call sites.

- [ ] **Step 3: Commit**

```bash
git add src/parse/types.ts
git commit -m "feat(parse): add ContextUsage type and optional usage/contextSize on Milestone"
```

---

## Task 3: Populate `usage` from assistant events in `buildMilestones` (TDD)

**Files:**
- Modify: `src/parse/milestones.ts`
- Test: `tests/unit/parse/milestones.test.ts`

- [ ] **Step 1: Add failing test cases**

Append to `tests/unit/parse/milestones.test.ts` inside the existing `describe('buildMilestones', ...)`:

```ts
it('captures usage on an assistant_turn milestone', () => {
  const events: RawEvent[] = [
    userMsg('1', null, 'Hello'),
    {
      uuid: '2',
      parentUuid: '1',
      timestamp: t,
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'hi' }],
        usage: {
          input_tokens: 6,
          cache_read_input_tokens: 18209,
          cache_creation_input_tokens: 28826,
          output_tokens: 389,
        },
      } as unknown as RawEvent['message'],
    },
  ];
  const root = buildMilestones(events);
  // root is root_prompt; its child is the completion (final assistant_turn promoted)
  const assistant = root.children[0];
  expect(assistant.usage).toEqual({ input: 6, cacheRead: 18209, cacheCreation: 28826, output: 389 });
  expect(assistant.contextSize).toBe(6 + 18209 + 28826);
});

it('shares usage across multiple tool_call milestones from the same assistant event', () => {
  const events: RawEvent[] = [
    userMsg('1', null, 'Hi'),
    {
      uuid: '2',
      parentUuid: '1',
      timestamp: t,
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: '/a' } },
          { type: 'tool_use', id: 'tu2', name: 'Grep', input: { pattern: 'x' } },
        ],
        usage: {
          input_tokens: 10,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 200,
          output_tokens: 50,
        },
      } as unknown as RawEvent['message'],
    },
    toolResult('3', '2', 'tu1', 'ok'),
    toolResult('4', '2', 'tu2', 'ok'),
  ];
  const root = buildMilestones(events);
  const t1 = root.children[0];
  const t2 = t1.children[0];
  expect(t1.kind).toBe('tool_call');
  expect(t2.kind).toBe('tool_call');
  const expected = { input: 10, cacheRead: 100, cacheCreation: 200, output: 50 };
  expect(t1.usage).toEqual(expected);
  expect(t2.usage).toEqual(expected);
  expect(t1.contextSize).toBe(310);
  expect(t2.contextSize).toBe(310);
});

it('leaves usage undefined when the assistant event has no usage block', () => {
  const events: RawEvent[] = [
    userMsg('1', null, 'Hi'),
    assistantText('2', '1', 'bare response, no usage field'),
  ];
  const root = buildMilestones(events);
  const child = root.children[0];
  expect(child.usage).toBeUndefined();
  expect(child.contextSize).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test -- milestones`
Expected: 3 new tests FAIL (`expected undefined to equal { input: 6, ... }` etc).

- [ ] **Step 3: Add usage extraction helper and wire it into `buildMilestones`**

Edit `src/parse/milestones.ts`. After the existing `toolResults` helper (around line 30-43), add:

```ts
function extractUsage(ev: RawEvent): { usage: ContextUsage; contextSize: number } | undefined {
  const u = (ev.message as { usage?: Record<string, unknown> } | undefined)?.usage;
  if (!u) return undefined;
  const input = Number(u.input_tokens ?? 0);
  const cacheRead = Number(u.cache_read_input_tokens ?? 0);
  const cacheCreation = Number(u.cache_creation_input_tokens ?? 0);
  const output = Number(u.output_tokens ?? 0);
  if (!Number.isFinite(input + cacheRead + cacheCreation + output)) return undefined;
  return {
    usage: { input, cacheRead, cacheCreation, output },
    contextSize: input + cacheRead + cacheCreation,
  };
}
```

Add a `ContextUsage` import at the top:

```ts
import type { ContextUsage, Milestone, RawContentBlock, RawEvent } from './types';
```

Inside the assistant-event branch of `buildMilestones`, capture usage once per event:

```ts
} else if (ev.type === 'assistant' && ev.message) {
  const text = plainText(ev);
  const tools = toolUses(ev);
  const usageInfo = extractUsage(ev);   // NEW

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
        usage: usageInfo?.usage,                  // NEW
        contextSize: usageInfo?.contextSize,      // NEW
      })
    );
  }
  for (const tu of tools) {
    // …existing code building each tool_call / subagent_spawn milestone…
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
        usage: usageInfo?.usage,                  // NEW
        contextSize: usageInfo?.contextSize,      // NEW
      })
    );
  }
}
```

Note: `makeMilestone` currently takes `Omit<Milestone, 'children'> & { children?: Milestone[] }`. Because `usage` and `contextSize` are optional on `Milestone`, no signature change is needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- milestones`
Expected: all `buildMilestones` tests PASS, including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/parse/milestones.ts tests/unit/parse/milestones.test.ts
git commit -m "feat(parse): extract usage onto assistant-derived milestones"
```

---

## Task 4: Propagate `usage` onto user-prompt milestones (TDD)

**Files:**
- Modify: `src/parse/milestones.ts`
- Test: `tests/unit/parse/milestones.test.ts`

- [ ] **Step 1: Add failing test cases**

Append to `tests/unit/parse/milestones.test.ts`:

```ts
it('propagates the next milestone usage onto a root_prompt', () => {
  const events: RawEvent[] = [
    userMsg('1', null, 'Solve this please'),
    {
      uuid: '2',
      parentUuid: '1',
      timestamp: t,
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'on it' }],
        usage: {
          input_tokens: 5,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 200,
          output_tokens: 10,
        },
      } as unknown as RawEvent['message'],
    },
  ];
  const root = buildMilestones(events);
  expect(root.kind).toBe('root_prompt');
  expect(root.usage).toEqual({ input: 5, cacheRead: 100, cacheCreation: 200, output: 10 });
  expect(root.contextSize).toBe(305);
});

it('propagates next-milestone usage onto a user_followup', () => {
  const events: RawEvent[] = [
    userMsg('1', null, 'Hi'),
    assistantText('2', '1', 'hello'),
    userMsg('3', '2', 'Now do something else'),
    {
      uuid: '4',
      parentUuid: '3',
      timestamp: t,
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        usage: {
          input_tokens: 1,
          cache_read_input_tokens: 2,
          cache_creation_input_tokens: 3,
          output_tokens: 4,
        },
      } as unknown as RawEvent['message'],
    },
  ];
  // root_prompt -> assistant_turn(2) -> user_followup(3) -> completion(4)
  const root = buildMilestones(events);
  const a = root.children[0];
  const u2 = a.children[0];
  expect(u2.kind).toBe('user_followup');
  expect(u2.usage).toEqual({ input: 1, cacheRead: 2, cacheCreation: 3, output: 4 });
  expect(u2.contextSize).toBe(6);
});

it('leaves a trailing user prompt with no following assistant turn without usage', () => {
  // synthetic edge case: user message with no assistant reply afterward
  const events: RawEvent[] = [
    userMsg('1', null, 'Hi'),
  ];
  const root = buildMilestones(events);
  expect(root.kind).toBe('root_prompt');
  expect(root.usage).toBeUndefined();
  expect(root.contextSize).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npm test -- milestones`
Expected: the 3 new tests FAIL (`expected undefined to equal { input: 5, ... }`).

- [ ] **Step 3: Implement propagation pass**

Edit `src/parse/milestones.ts`. After the flat list is built but **before** the chaining loop (around the comment `// Chain flat list into a tree…`), add a propagation pass:

```ts
// Propagate usage from the next milestone onto user-prompt milestones,
// which carry no usage of their own. The next milestone in the flat list
// is also the next in the chain (chain is linear), so this matches
// "context state right after the prompt was appended."
for (let i = 0; i < flat.length - 1; i++) {
  const m = flat[i];
  if (m.kind !== 'root_prompt' && m.kind !== 'user_followup') continue;
  if (m.usage) continue;
  const next = flat[i + 1];
  if (!next.usage) continue;
  flat[i] = { ...m, usage: next.usage, contextSize: next.contextSize };
}
```

Place this **after** the "Promote final assistant_turn to completion" loop so the completion's usage is also visible to any preceding user_followup propagation, and **before** the chaining loop so the in-place `children` linking still works.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- milestones`
Expected: all `buildMilestones` tests PASS, including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/parse/milestones.ts tests/unit/parse/milestones.test.ts
git commit -m "feat(parse): propagate next-milestone usage onto user prompts"
```

---

## Task 5: Add `showAllContext` toggle to `Filters`

**Files:**
- Modify: `src/components/FilterToggles.tsx`
- Modify: `src/App.tsx` — extend the `useState<Filters>` initializer

- [ ] **Step 1: Add the field and checkbox**

Edit `src/components/FilterToggles.tsx`. Extend the `Filters` type and add the checkbox:

```ts
export type Filters = {
  hidePruned: boolean;
  hideSubagents: boolean;
  successOnly: boolean;
  showAllContext: boolean;
};
```

Append a new `<label>` row inside the returned `<div data-testid="filter-toggles">`, just after the success-only row:

```tsx
<label style={styles.row}>
  <input
    type="checkbox"
    checked={value.showAllContext}
    onChange={tg('showAllContext')}
    data-testid="filter-show-all-context"
  />
  <span>show all context</span>
</label>
```

- [ ] **Step 2: Update App.tsx default**

Edit `src/App.tsx`. Update the `useState<Filters>` initializer:

```ts
const [filters, setFilters] = useState<Filters>({
  hidePruned: false,
  hideSubagents: false,
  successOnly: false,
  showAllContext: false,
});
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — no other call site references `Filters` literally.

- [ ] **Step 4: Commit**

```bash
git add src/components/FilterToggles.tsx src/App.tsx
git commit -m "feat(filters): add 'show all context' toggle, default off"
```

---

## Task 6: Render context badge on `NodeShape`

**Files:**
- Modify: `src/components/NodeShape.tsx`

- [ ] **Step 1: Add badge props and rendering**

Edit `src/components/NodeShape.tsx`. Import the formatter at the top:

```ts
import { formatTokens } from '../util/formatTokens';
```

Extend `Props`:

```ts
type Props = {
  node: LaidOutNode;
  state: State;
  inSubagent: boolean;
  pinned?: boolean;
  showContextBadge?: boolean;   // when true and node.milestone.contextSize exists, render the chip
};
```

Inside the component, just before the `pinned` rectangle render (i.e. after the failed-dot block), add the chip:

```tsx
{showContextBadge && node.milestone.contextSize != null && (
  <g data-testid="context-badge" transform={`translate(${W - 28}, -8)`}>
    <rect
      x={0}
      y={0}
      width={32}
      height={12}
      rx={2}
      ry={2}
      fill="rgba(5,8,13,0.92)"
      stroke={colors.stroke}
      strokeWidth={0.75}
      opacity={state === 'pruned' ? 0.45 : 0.95}
    />
    <text
      x={16}
      y={9}
      textAnchor="middle"
      fontSize={9}
      letterSpacing={0.5}
      fontFamily="ui-monospace, monospace"
      fill={colors.text}
      style={{ pointerEvents: 'none' }}
    >
      {formatTokens(node.milestone.contextSize)}
    </text>
  </g>
)}
```

The chip rect is 32×12, anchored so its right edge sits at `W - 4` (4px inside the silhouette's right edge) and its top edge sits 8px above the silhouette's top. `data-testid="context-badge"` enables E2E coverage.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — new prop is optional.

- [ ] **Step 3: Commit**

```bash
git add src/components/NodeShape.tsx
git commit -m "feat(node): render context-size corner chip when prop enabled"
```

---

## Task 7: Wire `showContextBadge` in `GraphCanvas`

**Files:**
- Modify: `src/components/GraphCanvas.tsx`

- [ ] **Step 1: Compute and pass the prop**

Edit `src/components/GraphCanvas.tsx`. In the `layout.nodes.map((n) => ...)` block, just before the existing `<NodeShape … />` call, compute the badge visibility and pass it through:

```tsx
const isTraversed = traversedIds.has(n.id) || n.id === currentId;
const showContextBadge =
  filters.showAllContext || isTraversed;
// …existing isPinned/state derivation stays the same…
return (
  <g ... >
    <NodeShape
      node={n}
      state={state}
      inSubagent={inSub}
      pinned={isPinned}
      showContextBadge={showContextBadge}
    />
  </g>
);
```

Both branches still rely on `node.milestone.contextSize` existing; `NodeShape` itself short-circuits when `contextSize` is undefined.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/GraphCanvas.tsx
git commit -m "feat(graph): show context badge on traversed nodes; honor 'show all' filter"
```

---

## Task 8: Append usage breakdown to `NodeTooltip`

**Files:**
- Modify: `src/components/NodeTooltip.tsx`

- [ ] **Step 1: Add the usage block**

Edit `src/components/NodeTooltip.tsx`. Import the formatter:

```ts
import { formatTokens } from '../util/formatTokens';
```

Replace the body of the returned `<div>` (the two existing inner divs) with:

```tsx
<div style={{ color: 'var(--edge-trail)', marginBottom: 2 }}>{milestone.label}</div>
<div style={{ color: 'var(--text-dim)' }}>{milestone.summary}</div>
{milestone.usage && (
  <div
    data-testid="node-tooltip-context"
    style={{
      marginTop: 6,
      paddingTop: 6,
      borderTop: '1px solid var(--grid)',
      color: 'var(--text-dim)',
      fontSize: 11,
    }}
  >
    <div style={{ color: 'var(--edge-trail)', marginBottom: 2 }}>
      ctx · {formatTokens(milestone.contextSize ?? 0)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 8 }}>
      <span>input</span><span style={{ textAlign: 'right', color: 'var(--text)' }}>{formatTokens(milestone.usage.input)}</span>
      <span>cache</span><span style={{ textAlign: 'right', color: 'var(--text)' }}>{formatTokens(milestone.usage.cacheRead + milestone.usage.cacheCreation)}</span>
      <span>output</span><span style={{ textAlign: 'right', color: 'var(--text)' }}>{formatTokens(milestone.usage.output)}</span>
    </div>
  </div>
)}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/NodeTooltip.tsx
git commit -m "feat(tooltip): append context breakdown when milestone has usage"
```

---

## Task 9: Add `CONTEXT` block to `DetailPanel`

**Files:**
- Modify: `src/components/DetailPanel.tsx`

- [ ] **Step 1: Add the context block**

Edit `src/components/DetailPanel.tsx`. Just before the `{milestone.detail && …}` block, add:

```tsx
{milestone.usage && (
  <div data-testid="detail-context" style={styles.contextBlock}>
    <div style={styles.contextHead}>CONTEXT</div>
    <ContextRow label="total" value={milestone.contextSize ?? 0} bright />
    <ContextRow label="  input" value={milestone.usage.input} />
    <ContextRow label="  cache read" value={milestone.usage.cacheRead} />
    <ContextRow label="  cache write" value={milestone.usage.cacheCreation} />
    <ContextRow label="  output" value={milestone.usage.output} />
  </div>
)}
```

Add the `ContextRow` helper and styles just above (or below) the existing `styles` object, in the same file:

```tsx
function ContextRow({ label, value, bright }: { label: string; value: number; bright?: boolean }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto', fontSize: 11,
      color: bright ? 'var(--text)' : 'var(--text-dim)',
      fontFamily: 'ui-monospace, monospace',
    }}>
      <span>{label}</span>
      <span style={{ color: 'var(--text)' }}>{value.toLocaleString('en-US')}</span>
    </div>
  );
}
```

Extend the `styles` object:

```ts
contextBlock: {
  margin: '0 0 12px 0',
  padding: '6px 10px',
  border: '1px solid var(--grid)',
  background: 'rgba(15,38,50,0.4)',
},
contextHead: {
  fontSize: 10, letterSpacing: 3,
  color: 'var(--edge-trail)', marginBottom: 4,
},
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/DetailPanel.tsx
git commit -m "feat(detail): show full integer context breakdown when usage present"
```

---

## Task 10: Wire single-click → scrub + pin in `GraphCanvas`

**Files:**
- Modify: `src/components/GraphCanvas.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add `onScrubTo` prop and call it from the click handler**

Edit `src/components/GraphCanvas.tsx`. Extend `Props`:

```ts
type Props = {
  session: Session;
  playback: PlaybackState;
  subagentIds: Set<string>;
  pinnedId: string | null;
  onPin: (id: string | null) => void;
  onScrubTo: (index: number) => void;          // NEW
  filters: Filters;
  onCameraReady?: (api: CameraApi) => void;
};
```

Destructure `onScrubTo` alongside the other props in the function signature.

Update the node-click handler inside the `layout.nodes.map` block:

```tsx
onClick={(e) => {
  e.stopPropagation();
  const idx = orderIndex.get(n.id);
  if (idx != null) onScrubTo(idx);
  onPin(isPinned ? null : n.id);
}}
```

- [ ] **Step 2: Pass `followingControls.scrubTo` from `App.tsx`**

Edit `src/App.tsx`. In the `<GraphCanvas …>` element, add the new prop:

```tsx
<GraphCanvas
  session={effectiveSession}
  playback={playback}
  subagentIds={subagentIds}
  pinnedId={pinnedId}
  onPin={setPinnedId}
  onScrubTo={followingControls.scrubTo}    // NEW
  filters={filters}
  onCameraReady={(api) => { cameraRef.current = api; }}
/>
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/GraphCanvas.tsx src/App.tsx
git commit -m "feat(graph): click a node to scrub the playhead, in addition to pin"
```

---

## Task 11: Stack the gutter (vertical layout)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/NowPlaying.tsx`
- Modify: `src/components/PlaybackControls.tsx`

- [ ] **Step 1: Convert the gutter to a column**

Edit `src/App.tsx`. Remove the `GUTTER_HEIGHT` constant. Replace the `gutter` style:

```ts
gutter: {
  flexShrink: 0,
  borderTop: '1px solid var(--grid)',
  background: 'rgba(5,8,13,0.5)',
  display: 'flex' as const,
  flexDirection: 'column' as const,
  gap: 6,
  padding: '8px 16px',
  minWidth: 0,
  overflow: 'hidden' as const,
},
```

(`alignItems` and the fixed `height` go away; the gutter is now a column flex.)

- [ ] **Step 2: Make `NowPlaying` span the row**

Edit `src/components/NowPlaying.tsx`. Update `styles.frame`:

```ts
frame: {
  minWidth: 0,
  width: '100%',
  maxHeight: 94,
  overflowY: 'auto' as const,
  background: 'rgba(5,8,13,0.92)',
  border: '1px solid',
  padding: '8px 14px',
  fontFamily: 'ui-monospace, monospace',
  backdropFilter: 'blur(2px)',
},
```

(Removed `flex: '1 1 380px'` and `maxWidth: 720`; added `width: '100%'`.)

- [ ] **Step 3: Make the scrubber flex in `PlaybackControls`**

Edit `src/components/PlaybackControls.tsx`. Inside the `Scrubber` component, change the inline `style={...}` block on the outer `<div>`:

```tsx
style={{
  position: 'relative',
  height: 6,
  flex: '1 1 auto',
  minWidth: 80,
  background: 'rgba(26,58,74,0.6)',
  border: '1px solid var(--edge-idle)',
  cursor: 'pointer',
  marginRight: 8,
}}
```

(Replaced `width: 320` with `flex: '1 1 auto', minWidth: 80`.)

- [ ] **Step 4: Visual sanity check**

Run: `npm run dev`. Open the URL it prints. Load any session. Confirm:
- HUD frame (`NowPlaying`) spans the full gutter width (row 1)
- Below it, controls row reads `[‹][▶][›]  [══ flex scrubber ══]  [⌥][⚙][⊘][■]  [↺]`
- Scrubber grows when window is resized wider; shrinks (but stays ≥ 80px) when narrowed.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/NowPlaying.tsx src/components/PlaybackControls.tsx
git commit -m "feat(layout): stack the gutter and flex the scrubber"
```

---

## Task 12: Sidebar auto-collapse below 1400px

**Files:**
- Modify: `src/App.tsx`
- Modify: `playwright.config.ts`

- [ ] **Step 1: Add the threshold constant and effect**

Edit `src/App.tsx`. Add near the top, beside the existing constants:

```ts
const NARROW_THRESHOLD = 1400;
```

Add this `useEffect` inside the `App` component, after the existing `useEffect`s but before the `pinnedMilestone` `useMemo`:

```ts
useEffect(() => {
  let lastBucket: 'narrow' | 'wide' =
    window.innerWidth < NARROW_THRESHOLD ? 'narrow' : 'wide';
  setSidebarCollapsed(lastBucket === 'narrow');
  const onResize = () => {
    const next: 'narrow' | 'wide' =
      window.innerWidth < NARROW_THRESHOLD ? 'narrow' : 'wide';
    if (next !== lastBucket) {
      lastBucket = next;
      setSidebarCollapsed(next === 'narrow');
    }
  };
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}, []);
```

This:
- runs once on mount to align the initial state with the viewport,
- listens for resize and only fires on bucket *crossings* (not every pixel change),
- leaves `setSidebarCollapsed` un-overridden inside a bucket, so user toggles via the sidebar `«»` button stick.

- [ ] **Step 2: Bump the Playwright default viewport to a wide bucket**

The current default viewport in `playwright.config.ts` is `{ width: 1280, height: 800 }`. With auto-collapse engaging below 1400px, that default would put every existing E2E test into the narrow bucket — silently auto-collapsing the sidebar at session start and breaking any test that interacts with the library panel. Move the default to a wide-bucket size; the new responsive test sets its own viewport per case.

Edit `playwright.config.ts`. Change the `viewport` value:

```ts
use: {
  baseURL: 'http://localhost:5174',
  headless: true,
  viewport: { width: 1600, height: 900 },
},
```

- [ ] **Step 3: Visual sanity check**

Run: `npm run dev`. With the dev tools open, toggle device emulation to width 1280 → sidebar collapses. Resize to width 1500 → sidebar expands again. Manually click `»` to expand at 1280 → it stays expanded. Resize to 1500 → it stays expanded. Resize back to 1280 → it auto-collapses again on the crossing.

- [ ] **Step 4: Quick regression — existing E2E still passes**

Run: `npx playwright test`
Expected: all existing tests PASS at the new 1600×900 default viewport. If any fail, the new viewport caused the regression — adjust within that test rather than weakening the default.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx playwright.config.ts
git commit -m "feat(layout): auto-collapse sidebar on viewport crossings below 1400px"
```

---

## Task 13: Content cap and centering on wide displays

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the cap constant**

Edit `src/App.tsx`. Beside `NARROW_THRESHOLD`:

```ts
const CONTENT_MAX = 2400;
```

- [ ] **Step 2: Restructure the `<main>` body**

In the returned JSX, wrap the existing children of `<main>` in a new `<div style={styles.contentFrame}>`. Move the `paddingRight` reservation from `<main>` onto the new wrapper:

```tsx
<main style={styles.main}>
  <div style={{
    ...styles.contentFrame,
    paddingRight: displayedMilestone ? detailWidth : 0,
  }}>
    {!selected && <div style={styles.empty}>SELECT A SESSION</div>}
    {selected && isLoading && <div style={styles.empty}>LOADING…</div>}
    {selected && error && <div style={styles.error}>error: {(error as Error).message}</div>}
    {isMissingSlice && <div style={styles.empty} data-testid="prompt-not-found">PROMPT NOT FOUND</div>}
    {effectiveSession && needsConfirm && ( /* …overflow block unchanged… */ )}
    {effectiveSession && !needsConfirm && (
      <div style={styles.canvasSlot}>
        {/* sessionHeader, GraphCanvas, FilterToggles, Legend — all unchanged */}
      </div>
    )}
    {effectiveSession && !needsConfirm && (
      <div data-testid="chrome-gutter" style={styles.gutter}>
        <NowPlaying … />
        <PlaybackControls … />
      </div>
    )}
    <DetailPanel … />
  </div>
</main>
```

Update `styles.main` to drop the now-unused `paddingRight` logic and add `styles.contentFrame`:

```ts
main: {
  flex: 1,
  position: 'relative' as const,
  overflow: 'hidden' as const,
  display: 'flex' as const,
  flexDirection: 'column' as const,
},
contentFrame: {
  maxWidth: CONTENT_MAX,
  width: '100%',
  margin: '0 auto',
  flex: 1,
  display: 'flex' as const,
  flexDirection: 'column' as const,
  position: 'relative' as const,
  minHeight: 0,
},
```

- [ ] **Step 3: Visual sanity check on a wide window (or emulated 3840×2160)**

Run: `npm run dev`. With dev tools, set the viewport to 3840 wide. Confirm:
- The canvas + gutter visibly center inside `<main>`, with the TRON grid showing in the side bands on left and right.
- The `DetailPanel` (after clicking a node) anchors to the right edge of the centered frame, not the right edge of the window.
- Pan/zoom continues to work (drag canvas, scroll-wheel zoom).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(layout): cap canvas+gutter+detail at 2400px and center on wide displays"
```

---

## Task 14: E2E — context badge default visibility + toggle reveal

**Files:**
- Modify: `tests/fixtures/claude-projects/C--demo-happy/2026-01-01-aaaa.jsonl`
- Create: `tests/e2e/context-badge.spec.ts`

- [ ] **Step 1: Add `usage` blocks to the `demo/happy` fixture**

The existing demo fixture's assistant events carry no `usage` field, which means after the parse changes from Tasks 3–4, every milestone in demo/happy still has `contextSize === undefined` and the new badge would never render in E2E. Extend the fixture so each assistant event carries a small, realistic, monotonically-growing usage block.

Overwrite `tests/fixtures/claude-projects/C--demo-happy/2026-01-01-aaaa.jsonl` with the following 9 lines (one JSON object per line — preserve the trailing newline so the parser doesn't trip on EOF):

```jsonl
{"uuid":"h1","parentUuid":null,"timestamp":"2026-01-01T00:00:00Z","type":"user","message":{"role":"user","content":"Please print hello world"}}
{"uuid":"h1b","parentUuid":"h1","timestamp":"2026-01-01T00:00:00.5Z","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I will run echo."}],"usage":{"input_tokens":6,"cache_read_input_tokens":1200,"cache_creation_input_tokens":800,"output_tokens":12}}}
{"uuid":"h2","parentUuid":"h1b","timestamp":"2026-01-01T00:00:01Z","type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_h","name":"Bash","input":{"command":"echo hello"}}],"usage":{"input_tokens":8,"cache_read_input_tokens":2300,"cache_creation_input_tokens":900,"output_tokens":20}}}
{"uuid":"h3","parentUuid":"h2","timestamp":"2026-01-01T00:00:02Z","type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu_h","content":"<stdout>\nhello\n</stdout>\n<exit_code>0</exit_code>","is_error":false}]}}
{"uuid":"h4","parentUuid":"h3","timestamp":"2026-01-01T00:00:03Z","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Done."}],"usage":{"input_tokens":10,"cache_read_input_tokens":3500,"cache_creation_input_tokens":1000,"output_tokens":6}}}
{"uuid":"h5","parentUuid":"h4","timestamp":"2026-01-01T00:00:04Z","type":"user","message":{"role":"user","content":"Now print goodbye"}}
{"uuid":"h6","parentUuid":"h5","timestamp":"2026-01-01T00:00:05Z","type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_h2","name":"Bash","input":{"command":"echo goodbye"}}],"usage":{"input_tokens":12,"cache_read_input_tokens":4800,"cache_creation_input_tokens":1100,"output_tokens":18}}}
{"uuid":"h7","parentUuid":"h6","timestamp":"2026-01-01T00:00:06Z","type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu_h2","content":"<stdout>\ngoodbye\n</stdout>\n<exit_code>0</exit_code>","is_error":false}]}}
{"uuid":"h8","parentUuid":"h7","timestamp":"2026-01-01T00:00:07Z","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Goodbye said."}],"usage":{"input_tokens":14,"cache_read_input_tokens":6000,"cache_creation_input_tokens":1200,"output_tokens":8}}}
```

This gives demo/happy ten DFS-order milestones with monotonically growing context sizes (~2k → ~7k), so the badge displays values like `2.0k`, `3.2k`, `4.5k`, `5.9k`, `7.2k` across traversed nodes.

- [ ] **Step 2: Verify the existing demo/happy unit/E2E tests still pass with the fixture change**

Run: `npm test && npx playwright test tests/e2e/hud-readout.spec.ts tests/e2e/playback.spec.ts`
Expected: PASS — adding the `usage` field is additive and doesn't change DFS order, labels, summaries, or exit codes the existing tests assert.

- [ ] **Step 3: Write the failing E2E**

```ts
// tests/e2e/context-badge.spec.ts
import { test, expect } from '@playwright/test';

async function loadDemoHappy(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).first().click();
  await page.locator('svg g[data-id]').first().waitFor();
  await page.getByTestId('chrome-gutter').waitFor();
}

test.describe('context badge', () => {
  test('badge appears on the current/root node by default; multiplies as playback advances', async ({ page }) => {
    await loadDemoHappy(page);

    const badges = page.getByTestId('context-badge');
    const initialCount = await badges.count();
    // Root and propagated user prompts have contextSize via Task 4, plus the
    // current playhead always shows; expect at least 1.
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // Play, wait long enough to cross several edges at default 0.25x
    // (1600 ms/node), then pause.
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(4800);
    await page.getByTestId('play-toggle').click();

    const after = await badges.count();
    expect(after).toBeGreaterThan(initialCount);
  });

  test('show-all-context toggle reveals badges on every milestone with usage', async ({ page }) => {
    await loadDemoHappy(page);
    const before = await page.getByTestId('context-badge').count();
    await page.getByTestId('filter-show-all-context').check();
    // Allow React state to flush.
    await page.waitForTimeout(50);
    const after = await page.getByTestId('context-badge').count();
    expect(after).toBeGreaterThan(before);
  });
});
```

- [ ] **Step 4: Run it**

Run: `npx playwright test tests/e2e/context-badge.spec.ts`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/claude-projects/C--demo-happy/2026-01-01-aaaa.jsonl tests/e2e/context-badge.spec.ts
git commit -m "test(e2e): context-badge default visibility and show-all toggle"
```

---

## Task 15: E2E — click a node to scrub the playhead

**Files:**
- Create: `tests/e2e/click-scrub.spec.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/e2e/click-scrub.spec.ts
import { test, expect } from '@playwright/test';

test('clicking a graph node moves the playhead and pins the detail panel', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).first().click();
  await page.locator('svg g[data-id]').first().waitFor();
  await page.getByTestId('chrome-gutter').waitFor();

  // Read scrubber percentage at index 0.
  const startPct = Number(
    await page.getByTestId('scrubber-handle').getAttribute('data-pct')
  );

  // Click the 4th rendered node (NodeShape inner <g> has data-id, data-kind, data-state).
  const someNode = page.locator('g[data-id][data-kind][data-state]').nth(3);
  await someNode.click();

  // Detail panel should be visible.
  await expect(page.getByTestId('detail-panel')).toBeVisible();

  // Scrubber should have moved forward.
  await page.waitForTimeout(50);
  const movedPct = Number(
    await page.getByTestId('scrubber-handle').getAttribute('data-pct')
  );
  expect(movedPct).toBeGreaterThan(startPct);
});

test('after a click, pressing play resumes from the clicked node', async ({ page }) => {
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).first().click();
  await page.locator('svg g[data-id]').first().waitFor();
  await page.getByTestId('chrome-gutter').waitFor();

  // Click the 3rd node, then press play, wait a tick, pause.
  await page.locator('g[data-id][data-kind][data-state]').nth(2).click();
  const afterClickPct = Number(
    await page.getByTestId('scrubber-handle').getAttribute('data-pct')
  );

  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(1600);                 // ~1 node at 0.25x speed
  await page.getByTestId('play-toggle').click();

  const afterPlayPct = Number(
    await page.getByTestId('scrubber-handle').getAttribute('data-pct')
  );
  expect(afterPlayPct).toBeGreaterThan(afterClickPct);
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/click-scrub.spec.ts`
Expected: PASS (both tests).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/click-scrub.spec.ts
git commit -m "test(e2e): node click moves the playhead and pins detail panel"
```

---

## Task 16: E2E — responsive shell (narrow auto-collapse, wide cap)

**Files:**
- Create: `tests/e2e/responsive-shell.spec.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/e2e/responsive-shell.spec.ts
import { test, expect } from '@playwright/test';

test('sidebar auto-collapses below 1400px and re-expands above', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.getByTestId('session-list').waitFor();

  // Wide: sidebar should be expanded (filter input visible).
  await expect(page.getByTestId('session-filter')).toBeVisible();

  // Resize narrow → auto-collapse: filter input removed, only the collapse stub remains.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByTestId('session-filter')).toHaveCount(0);
  await expect(page.getByTestId('sidebar-toggle')).toBeVisible();

  // Manually expand at narrow width.
  await page.getByTestId('sidebar-toggle').click();
  await expect(page.getByTestId('session-filter')).toBeVisible();

  // Resize wide again — sidebar stays expanded.
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(page.getByTestId('session-filter')).toBeVisible();
});

test('canvas+gutter are capped and centered above 2400px wide', async ({ page }) => {
  await page.setViewportSize({ width: 3400, height: 1000 });
  await page.goto('/');
  await page.locator('aside li', { hasText: 'demo/happy' }).first().click();
  await page.locator('svg g[data-id]').first().waitFor();
  await page.getByTestId('chrome-gutter').waitFor();

  // The gutter is inside contentFrame; its bounding rect width must be <= CONTENT_MAX.
  const gutter = page.getByTestId('chrome-gutter');
  const box = await gutter.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(2400 + 1);

  // The frame should be visually centered within <main>:
  // sidebar sits on the left; the frame's left edge should sit strictly to the right
  // of (sidebar right edge + a noticeable side-band).
  const sidebarBox = await page.getByTestId('session-list').boundingBox();
  expect(sidebarBox).not.toBeNull();
  expect(box!.x).toBeGreaterThan(sidebarBox!.x + sidebarBox!.width + 50);
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/responsive-shell.spec.ts`
Expected: both tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/responsive-shell.spec.ts
git commit -m "test(e2e): sidebar auto-collapse threshold and wide-display content cap"
```

---

## Task 17: Final sweep — typecheck, unit, E2E

- [ ] **Step 1: Run the full local check**

```bash
npm run typecheck && npm test && npx playwright test
```

Expected: typecheck PASS; all unit tests PASS; all Playwright tests PASS.

- [ ] **Step 2: Visual confirmation in the running app**

```bash
npm run dev
```

Open the URL it prints. With a session loaded:
1. Press ▶ — context badges appear on traversed nodes as the playhead advances.
2. Hover an already-traversed node — tooltip shows `ctx · NNk` plus the input/cache/output breakdown.
3. Open detail panel via single click on a node — see the `CONTEXT` block with full integer values; confirm the playhead jumped to that node.
4. Press `space` — playback resumes from the clicked node.
5. Toggle `show all context` — badges appear on idle/future nodes too.
6. Resize the window narrow (~1280 wide) — sidebar collapses, gutter stays two-row, scrubber narrows but stays usable.
7. Maximize on a wide display (or set window ≥3000 wide) — canvas + gutter centered with grid side-bands; detail panel still anchors to the centered frame's right edge.

- [ ] **Step 3: No further commit unless something needs fixing.**

If any failure surfaces in this sweep, the fix is its own task — write a failing test first, fix, commit.

---

## Acceptance criteria (recap from spec)

1. **Context badge**
   - Chip on every traversed node + current node by default. ✓ Tasks 6–7, 14
   - `Show all context` toggle reveals chip on every node with `contextSize`. ✓ Tasks 5, 14
   - Hover shows breakdown. ✓ Task 8
   - Detail panel shows full integer breakdown. ✓ Task 9
   - User-prompt nodes show propagated next-milestone context size. ✓ Task 4

2. **Click to set start point**
   - Click → playhead jumps + panel pins. ✓ Task 10
   - Playback does not auto-start; pressing ▶ plays forward. ✓ Inherent in `usePlayback.scrubTo`; Task 15
   - Trail visually truncates. ✓ Inherent in existing `traversedIds` derivation
   - Camera centers via follow. ✓ Inherent in `followingControls.scrubTo`

3. **Responsive layout**
   - Sidebar auto-collapse on threshold crossing. ✓ Task 12, 16
   - Stacked gutter at all widths. ✓ Task 11
   - Flex scrubber. ✓ Task 11
   - Canvas + gutter + detail panel cap at 2400px centered above that. ✓ Task 13, 16
   - Pan/zoom unaffected. ✓ Inherent in `ResizeObserver` on `GraphCanvas`
