# Codex Rollout Activity Timestamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep actively appended Codex main and subagent rollouts visible in Live on Windows even when their filesystem modification time is stale.

**Architecture:** Extend the existing Codex rollout scan to retain the newest valid top-level JSONL record timestamp and expose it as `lastUpdatedAt`. Keep filesystem mtime as the fallback, preserving the existing provider contract, cache invalidation, polling, and Live lifecycle.

**Tech Stack:** TypeScript, Node.js filesystem APIs, Vitest, Playwright, React/Vite.

## Global Constraints

- Do not write to Claude or Codex session data.
- Do not add dependencies or change the three-minute Live threshold.
- Apply the timestamp rule only inside the Codex adapter.
- Ignore malformed, missing, and invalid record timestamps; fall back to filesystem mtime when none are valid.
- Unknown record types may contribute a valid top-level activity timestamp without becoming renderable milestones.

---

### Task 1: Derive Codex rollout activity from JSONL records

**Files:**
- Modify: `server/providers/codex.ts:73-148`
- Test: `tests/unit/server/codex-provider.test.ts`

**Interfaces:**
- Consumes: `parseRollout(filePath, jsonl, stat)` and the existing `RolloutRecord.lastUpdatedAt: string` contract.
- Produces: `RolloutRecord.lastUpdatedAt` as the newest valid record timestamp in normalized ISO-8601 form, or `stat.mtime.toISOString()` when no valid record timestamp exists.

- [ ] **Step 1: Write the failing stale-mtime regression test**

Add this test inside `describe('Codex session provider', ...)`:

```ts
it('uses the newest valid record timestamp when rollout mtime is stale', async () => {
  const root = await tempRoot();
  const cwd = path.resolve('D:/projects/example');
  const main = await rollout(root, '2026/08/08/rollout-main.jsonl', [
    meta('main-thread', cwd),
    { ...assistant('main active'), timestamp: '2026-08-08T08:03:00.000Z' },
  ]);
  const child = await rollout(root, '2026/08/08/rollout-child.jsonl', [
    meta('child-thread', cwd, {
      parent_thread_id: 'main-thread',
      thread_source: 'subagent',
      agent_nickname: 'Franklin',
    }),
    { ...assistant('child active'), timestamp: '2026-08-08T08:04:00.000Z' },
  ]);
  const staleTime = new Date('2026-08-08T07:00:00.000Z');
  await Promise.all([
    fs.utimes(main, staleTime, staleTime),
    fs.utimes(child, staleTime, staleTime),
  ]);

  const adapter = createCodexSessionAdapter(root);
  const list = await adapter.listSessions();
  expect(list.sessions[0].lastUpdatedAt).toBe('2026-08-08T08:03:00.000Z');

  const payload = await adapter.readSession(list.sessions[0].projectId, 'main-thread');
  expect(payload.provider).toBe('codex');
  if (payload.provider !== 'codex') throw new Error('expected Codex payload');
  expect(payload.subagents[0].lastUpdatedAt).toBe('2026-08-08T08:04:00.000Z');
});
```

- [ ] **Step 2: Write the failing invalid-timestamp fallback test**

Add this second test:

```ts
it('falls back to rollout mtime when no record has a valid timestamp', async () => {
  const root = await tempRoot();
  const cwd = path.resolve('D:/projects/example');
  const file = await rollout(root, '2026/08/08/rollout-main.jsonl', [
    { type: 'session_meta', payload: { id: 'main-thread', cwd } },
    {
      timestamp: 'not-a-date',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'done' }],
      },
    },
  ]);
  const fallbackTime = new Date('2026-08-08T07:00:00.000Z');
  await fs.utimes(file, fallbackTime, fallbackTime);

  const result = await createCodexSessionAdapter(root).listSessions();
  expect(result.sessions[0].lastUpdatedAt).toBe(fallbackTime.toISOString());
});
```

- [ ] **Step 3: Run the provider tests and verify the regression is RED**

Run:

```powershell
npm.cmd test -- tests/unit/server/codex-provider.test.ts
```

Expected: the stale-mtime regression fails because `lastUpdatedAt` still equals filesystem mtime; the fallback characterization passes because it preserves the existing fallback behavior.

- [ ] **Step 4: Implement the minimal timestamp derivation**

In `parseRollout`, initialize an activity accumulator before the JSONL loop:

```ts
let latestRecordTimestampMs: number | undefined;
```

Immediately after validating each parsed record object, inspect its top-level timestamp:

```ts
const recordTimestamp = string(record.timestamp);
if (recordTimestamp) {
  const timestampMs = Date.parse(recordTimestamp);
  if (Number.isFinite(timestampMs)
    && (latestRecordTimestampMs === undefined || timestampMs > latestRecordTimestampMs)) {
    latestRecordTimestampMs = timestampMs;
  }
}
```

Replace the current `lastUpdatedAt` assignment with:

```ts
lastUpdatedAt: latestRecordTimestampMs === undefined
  ? stat.mtime.toISOString()
  : new Date(latestRecordTimestampMs).toISOString(),
```

- [ ] **Step 5: Run the provider tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/server/codex-provider.test.ts
```

Expected: all Codex provider tests pass.

- [ ] **Step 6: Run complete automated verification**

Run:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e -- tests/e2e/codex-live.spec.ts tests/e2e/codex-provider.spec.ts --workers=1
git diff --check
```

Expected: typecheck passes, 610 existing tests plus the two new tests pass, both focused Playwright specs pass, and the diff check is clean.

- [ ] **Step 7: Verify the real Live view**

Use the running app with real `CODEX_HOME`, select session `019fdb99`, pass the large-session gate if shown, and confirm the active child pane is present while the child's filesystem mtime is older than its newest JSONL record timestamp. Confirm MAIN remains visible and no Codex control bar appears.

- [ ] **Step 8: Commit**

```powershell
git add -- server/providers/codex.ts tests/unit/server/codex-provider.test.ts
git commit -m "fix: track Codex rollout activity timestamps"
```
