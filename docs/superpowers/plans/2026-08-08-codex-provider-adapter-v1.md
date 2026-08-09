# ClaudeWatch Codex Provider Adapter v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only Codex session discovery and replay, including visible reasoning, tool calls, and recursively nested subagents, without changing existing Claude behavior.

**Architecture:** A server-side provider registry discovers native Claude and Codex sessions and returns discriminated payloads. Provider-specific client parsers convert those payloads into the existing `Session`/`Milestone` model, so graph layout, playback, filtering, and details remain shared. Provider-qualified identity prevents collisions while capability checks keep Claude-only features unavailable for Codex.

**Tech Stack:** TypeScript, React 19, Vite middleware, TanStack Query, Vitest, Testing Library, Playwright, Node.js filesystem APIs.

## Global Constraints

- Keep the product name `ClaudeWatch` in v1.
- Codex support is read-only: never write to `CODEX_HOME`, rollout files, or Codex configuration.
- Codex Prompts, Usage, Memory, narration, live monitoring, and pause/steer are out of scope and must be recorded in `future_developments.md`.
- Claude behavior, endpoints other than session reads, live controls, narration, usage, prompts, and memory must remain operational.
- Introduce no new npm or host dependencies.
- Resolve Codex sessions from `${CODEX_HOME}/sessions`, defaulting `CODEX_HOME` to `path.join(os.homedir(), '.codex')`.
- Treat a missing provider root as an empty provider; show a warning only for an existing root that cannot be read or for skipped malformed rollouts.
- Preserve the currently untracked `docs/Screenshot 2026-08-01 *.png` files unchanged.
- Use `npm.cmd` for project commands in PowerShell.

---

## File Structure

- `server/providers/types.ts`: server adapter contract and provider-list result.
- `server/providers/claude.ts`: extracted Claude discovery and payload reading.
- `server/providers/codex.ts`: Codex rollout indexing, safe lookup, and descendant collection.
- `server/providers/registry.ts`: concurrent provider listing and provider-qualified reads.
- `src/parse/types.ts`: shared provider IDs, discriminated payloads, metadata, and normalized session types.
- `src/parse/codex.ts`: native Codex JSONL to `Session`/`Milestone` conversion.
- `src/parse/index.ts`: provider parser dispatcher while preserving the Claude parser.
- `src/session-identity.ts`: provider-qualified keys used by selections, caching, titles, and React.
- Existing API, library, liveness, inspector, and app components: provider-aware routing and capability gating.
- Provider fixtures and tests: native-format Codex rollout fixtures plus mixed-provider UI/E2E coverage.

---

### Task 1: Preserve the baseline and lock provider contracts

**Files:**
- Modify: `src/parse/types.ts`
- Create: `src/session-identity.ts`
- Create: `tests/unit/session-identity.test.ts`
- Modify: representative existing parse/server/component fixtures that construct `SessionMeta`, `Session`, or `SessionPayload`

**Interfaces:**
- Produces: `ProviderId`, `ProviderWarning`, `SessionListResponse`, `ClaudeSessionPayload`, `CodexSessionPayload`, `ProviderSessionPayload`, provider-tagged `SessionMeta` and `Session`.
- Produces: `sessionKey(ref): string` and `sessionTitleKey(ref): string`.

- [ ] **Step 1: Record the pre-change baseline.**

  Run:

  ```powershell
  npm.cmd run typecheck
  npm.cmd test
  npm.cmd run test:e2e -- tests/e2e/discovery-load.spec.ts tests/e2e/playback.spec.ts tests/e2e/subagent.spec.ts
  ```

  Expected: record exact pass/fail counts. If failures occur, confirm they reproduce before editing and do not classify them as feature regressions later.

- [ ] **Step 2: Write failing identity and type-consumer tests.**

  In `tests/unit/session-identity.test.ts`, assert hand-written literals:

  ```ts
  expect(sessionKey({ provider: 'claude', projectId: 'p', sessionId: 's' }))
    .toBe('claude/p/s');
  expect(sessionKey({ provider: 'codex', projectId: 'p', sessionId: 's' }))
    .toBe('codex/p/s');
  expect(sessionTitleKey({ provider: 'codex', projectId: 'p', sessionId: 's' }))
    .toBe('codex/p/s');
  ```

  The production change these tests catch is removing the provider or project from identity and reintroducing cross-provider collisions.

- [ ] **Step 3: Run the focused test and confirm RED.**

  Run: `npm.cmd test -- tests/unit/session-identity.test.ts`

  Expected: FAIL because `src/session-identity.ts` does not exist.

- [ ] **Step 4: Add the contracts and minimal key helpers.**

  Define these exact public shapes in `src/parse/types.ts`:

  ```ts
  export type ProviderId = 'claude' | 'codex';

  export type ProviderWarning = {
    provider: ProviderId;
    message: string;
  };

  export type SessionListResponse = {
    sessions: SessionMeta[];
    warnings: ProviderWarning[];
  };

  export type SessionRef = {
    provider: ProviderId;
    projectId: string;
    sessionId: string;
  };

  export type ClaudeSessionPayload = SessionRef & {
    provider: 'claude';
    cwd: string;
    jsonl: string;
    subagents: { id: string; jsonl: string; lastUpdatedAt: string }[];
  };

  export type CodexSubagentPayload = {
    threadId: string;
    parentThreadId: string;
    agentPath?: string;
    agentNickname?: string;
    startedAt: string;
    lastUpdatedAt: string;
    jsonl: string;
  };

  export type CodexSessionPayload = SessionRef & {
    provider: 'codex';
    cwd: string;
    jsonl: string;
    subagents: CodexSubagentPayload[];
  };

  export type ProviderSessionPayload = ClaudeSessionPayload | CodexSessionPayload;
  ```

  Add `provider: ProviderId` to `SessionMeta` and `Session`. Implement both key helpers as `${provider}/${projectId}/${sessionId}`. Update existing test literals to use `provider: 'claude'`; do not change their expected Claude behavior.

- [ ] **Step 5: Verify GREEN and type consistency.**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/session-identity.test.ts
  npm.cmd run typecheck
  ```

  Expected: PASS and zero TypeScript errors.

- [ ] **Step 6: Commit the contract.**

  ```powershell
  git add src/parse/types.ts src/session-identity.ts tests/unit/session-identity.test.ts tests/unit
  git commit -m "refactor(sessions): add provider-qualified session identity"
  ```

---

### Task 2: Extract Claude behind a provider adapter

**Files:**
- Create: `server/providers/types.ts`
- Create: `server/providers/claude.ts`
- Create: `server/providers/registry.ts`
- Modify: `server/vite-plugin-sessions.ts`
- Modify: `tests/unit/server/vite-plugin-sessions.test.ts`
- Create: `tests/unit/server/provider-registry.test.ts`

**Interfaces:**
- Consumes: `ProviderId`, `ProviderSessionPayload`, `SessionMeta`, `ProviderWarning` from Task 1.
- Produces: `SessionProviderAdapter` with `id`, `listSessions()`, and `readSession(projectId, sessionId)`.
- Produces: `createClaudeSessionAdapter(root)` and `createProviderRegistry(adapters)`.

- [ ] **Step 1: Write failing registry and Claude regression tests.**

  Test that two small in-memory adapters are merged newest-first, one rejected adapter becomes one `ProviderWarning`, and a provider-qualified read calls only the matching adapter. Update the containment tests to call `createClaudeSessionAdapter(ROOT).readSession(...)` and assert returned payloads include `provider: 'claude'`.

  The production changes these tests catch are sequential/fail-fast provider discovery, routing a read to the wrong provider, or weakening the existing containment guard.

- [ ] **Step 2: Confirm RED.**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/server/provider-registry.test.ts tests/unit/server/vite-plugin-sessions.test.ts
  ```

  Expected: FAIL because the provider modules and factories do not exist.

- [ ] **Step 3: Implement the adapter contract and registry.**

  Use these exact interfaces:

  ```ts
  export type ProviderListResult = {
    sessions: SessionMeta[];
    warnings: ProviderWarning[];
  };

  export interface SessionProviderAdapter {
    readonly id: ProviderId;
    listSessions(): Promise<ProviderListResult>;
    readSession(projectId: string, sessionId: string): Promise<ProviderSessionPayload>;
  }
  ```

  `createProviderRegistry(adapters)` must expose `listSessions()` and `readSession(provider, projectId, sessionId)`. Listing uses `Promise.allSettled`, concatenates successful results, converts rejected adapters to warnings, and sorts by descending `startedAt`. Reads reject unknown providers without consulting another adapter.

- [ ] **Step 4: Move Claude discovery without behavioral edits.**

  Move the current title extraction, assistant-turn filtering, `listSessions`, and `readSessionPayload` logic into `createClaudeSessionAdapter(root)`. Preserve `assertInsideRoot` checks for both the main session file and subagent directory. Add `provider: 'claude'` to metadata and payloads. Keep prompts, token usage, and memory middleware in `vite-plugin-sessions.ts` and keep them bound to the Claude root.

- [ ] **Step 5: Wire the registry into session middleware.**

  `GET /api/sessions` returns `{ sessions, warnings }`. Session reads become `GET /api/sessions/:provider/:projectId/:sessionId`; validate all three segments, then call the registry. Preserve 404 handling for absent or out-of-root sessions.

- [ ] **Step 6: Verify GREEN and Claude regressions.**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/server/provider-registry.test.ts tests/unit/server/vite-plugin-sessions.test.ts
  npm.cmd test -- tests/unit/parse tests/unit/server/aggregate-token-usage.test.ts tests/unit/server/memory-store.test.ts
  npm.cmd run typecheck
  ```

  Expected: all focused tests pass and typecheck exits 0.

- [ ] **Step 7: Commit the Claude adapter extraction.**

  ```powershell
  git add server/providers server/vite-plugin-sessions.ts tests/unit/server src/parse/types.ts
  git commit -m "refactor(server): isolate Claude session provider"
  ```

---

### Task 3: Discover and safely read Codex rollout trees

**Files:**
- Create: `server/providers/codex.ts`
- Create: `tests/unit/server/codex-provider.test.ts`
- Create: `tests/unit/server/fixtures/codex-home/sessions/2026/08/08/*.jsonl`
- Modify: `server/plugin-shared.ts`
- Modify: `server/vite-plugin-sessions.ts`

**Interfaces:**
- Consumes: `SessionProviderAdapter` from Task 2 and Codex payload types from Task 1.
- Produces: `codexHome()`, `codexSessionsRoot()`, `codexProjectId(cwd)`, and `createCodexSessionAdapter(root)`.

- [ ] **Step 1: Create minimal native Codex fixtures.**

  Add hand-written JSONL fixtures for one main task, one nested child, one guardian-style child without a `sub_agent_activity` start event, one malformed rollout, and one unrelated cwd. Metadata must exercise `id`, `parent_thread_id`, `cwd`, `thread_source`, `source.subagent.thread_spawn`, nickname, and agent path without copying real user content.

- [ ] **Step 2: Write failing discovery tests.**

  Assert that:

  - only main tasks appear in `listSessions()`;
  - metadata carries `provider: 'codex'`, the exact cwd, stable base64url project ID, file timestamps, size, and first real user message as title;
  - `readSession()` returns the main JSONL and every recursive descendant with parent metadata;
  - a mismatched project ID returns not found;
  - a missing root returns empty sessions and no warning;
  - a malformed file is skipped and produces one aggregated Codex warning.

  The production changes these tests catch are leaking child sessions into the library, trusting URL IDs as paths, dropping descendants, or turning one corrupt rollout into total discovery failure.

- [ ] **Step 3: Confirm RED.**

  Run: `npm.cmd test -- tests/unit/server/codex-provider.test.ts`

  Expected: FAIL because the Codex adapter does not exist.

- [ ] **Step 4: Implement Codex root resolution and indexing.**

  `codexHome()` returns `process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex')`; `codexSessionsRoot()` appends `sessions`. Recursively scan only files named `rollout-*.jsonl`. Read enough JSONL to find a valid `session_meta`; malformed lines are ignored, while files with no valid metadata are counted as skipped.

  Classify `thread_source === 'subagent'` as child. Use metadata `id` as `threadId`, `parent_thread_id` as the immediate parent, and `cwd` as the project source. Encode `path.normalize(cwd)` using `Buffer.from(value, 'utf8').toString('base64url')` for `projectId`.

- [ ] **Step 5: Implement safe reads and descendant collection.**

  Build the index from files discovered beneath the configured root; retain resolved file paths internally. A read first resolves `{projectId, sessionId}` against indexed main metadata, then reads that exact indexed file and recursively gathers children whose `parentThreadId` matches the main or another descendant. Never construct a rollout path from request segments.

- [ ] **Step 6: Register Codex beside Claude.**

  Instantiate both adapters in `sessionsPlugin()`. Do not pass Codex roots to prompt, usage, memory, control, or narrative code.

- [ ] **Step 7: Verify GREEN.**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/server/codex-provider.test.ts tests/unit/server/provider-registry.test.ts tests/unit/server/vite-plugin-sessions.test.ts
  npm.cmd run typecheck
  ```

  Expected: all focused tests pass and typecheck exits 0.

- [ ] **Step 8: Commit Codex discovery.**

  ```powershell
  git add server/providers/codex.ts server/plugin-shared.ts server/vite-plugin-sessions.ts tests/unit/server
  git commit -m "feat(codex): discover local rollout sessions"
  ```

---

### Task 4: Parse Codex messages, reasoning, tools, and recursive subagents

**Files:**
- Create: `src/parse/codex.ts`
- Create: `tests/unit/parse/codex.test.ts`
- Modify: `src/parse/index.ts`

**Interfaces:**
- Consumes: `CodexSessionPayload` from Task 1.
- Produces: `parseCodexSession(payload): Session`.
- Changes: `parseSession(payload: ProviderSessionPayload): Session` dispatches on `payload.provider`.

- [ ] **Step 1: Write failing parser tests against literal JSONL.**

  Cover separate tests for:

  - first user message as `root_prompt`, later user message as `user_followup`, assistant output, and final assistant output promoted to `completion`;
  - environment/plugin envelope-only user records and developer/system messages being omitted;
  - `event_msg.agent_reasoning` becoming one `assistant_turn` labeled `Decided`;
  - response reasoning summaries used only when the rollout has no visible reasoning events;
  - `function_call`/`function_call_output` and `custom_tool_call`/`custom_tool_call_output` paired by `call_id`;
  - explicit failed status or nonzero `Exit code:` marking a tool failed, while arbitrary error-like prose does not;
  - malformed/unknown records being skipped;
  - a started child, nested grandchild, and guardian fallback each attaching beneath a `subagent_spawn` milestone.

  Assert exact milestone kinds, labels, order, child placement, result text, and stable IDs such as `codex:<threadId>:<recordId-or-lineNumber>`.

- [ ] **Step 2: Confirm RED.**

  Run: `npm.cmd test -- tests/unit/parse/codex.test.ts`

  Expected: FAIL because `parseCodexSession` does not exist.

- [ ] **Step 3: Implement line parsing and native event extraction.**

  Preserve file order and line numbers. Ignore malformed lines. Use response messages as the canonical user/assistant source and ignore mirrored `event_msg.user_message`/`agent_message`. Extract `input_text` for user messages and `output_text` for assistant messages. Treat content consisting only of `<environment_context>` or `<recommended_plugins>` envelopes as metadata noise.

- [ ] **Step 4: Implement reasoning and tool milestones.**

  If any non-empty `event_msg.agent_reasoning.text` exists, use those records and ignore response reasoning summaries for that rollout. Otherwise join non-empty `response_item.reasoning.summary[].text`. Parse string tool inputs as JSON when possible and retain the original string on failure. Correlate outputs by `call_id`; stringify structured output for details/results.

  Failure is true only for explicit `status: 'failed'`, `is_error: true`, an error result object, or an `Exit code:` integer other than zero. Do not search arbitrary prose for words such as “error” or “failed.”

- [ ] **Step 5: Build and attach recursive child trees.**

  Turn each `sub_agent_activity` record with `kind: 'started'` into a `subagent_spawn` milestone keyed by `agent_thread_id`. Parse each child rollout recursively and attach it to the matching spawn. For a child without a start event, synthesize a spawn at `startedAt`, insert it into the parent sequence by timestamp, and label it from nickname, final agent-path segment, or `subagent` in that order. Detect repeated thread IDs and stop recursion to prevent malformed cycles.

  Build the parent flow as a chain; a spawn node has the child root first and the continuing parent node second, matching the existing Claude subagent tree shape.

- [ ] **Step 6: Dispatch without rewriting Claude parsing.**

  Rename the existing body to an internal `parseClaudeSession(payload: ClaudeSessionPayload)` and make exported `parseSession` switch on `provider`. Add `provider` to the returned normalized session in both branches.

- [ ] **Step 7: Verify GREEN and Claude parser regression.**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/parse/codex.test.ts tests/unit/parse
  npm.cmd run typecheck
  ```

  Expected: all parse tests pass and typecheck exits 0.

- [ ] **Step 8: Commit native Codex parsing.**

  ```powershell
  git add src/parse tests/unit/parse
  git commit -m "feat(codex): parse rollout graphs and subagents"
  ```

---

### Task 5: Make API hooks, selections, liveness, and titles provider-aware

**Files:**
- Modify: `src/api/client.ts`
- Modify: `src/api/hooks.ts`
- Modify: `src/components/live/liveness.ts`
- Modify: `src/components/library/LibraryPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `tests/unit/live/liveness.test.ts`
- Create: `tests/unit/components/SessionsList.provider.test.tsx`
- Modify: `tests/unit/App-mode-routing.test.tsx`

**Interfaces:**
- Consumes: provider-tagged metadata/payloads and `sessionKey` from Tasks 1–4.
- Changes: `fetchSessionPayload(provider, projectId, sessionId)` and `useSession(provider, projectId, sessionId, live)`.
- Changes: session selections include `provider`; prompt selections remain implicitly Claude by setting `provider: 'claude'` when loading their session.

- [ ] **Step 1: Write failing liveness and session-list tests.**

  Add literal metadata proving a just-modified Claude session is live and an equally recent Codex session is not. Render two sessions with identical project/session IDs but different providers and assert distinct badges, selection state, observable test IDs, and rename callbacks.

  The production changes these tests catch are accidental Codex polling/control activation and cross-provider UI identity collisions.

- [ ] **Step 2: Write failing App/API behavior tests.**

  Assert a Codex selection requests `/api/sessions/codex/<project>/<session>`, a Claude selection requests the Claude route, and memory-origin jumps choose only `provider === 'claude'`. Supply `{ sessions, warnings }` from the query mock and assert a provider warning appears in Sessions mode without hiding healthy sessions.

- [ ] **Step 3: Confirm RED.**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/live/liveness.test.ts tests/unit/components/SessionsList.provider.test.tsx tests/unit/App-mode-routing.test.tsx
  ```

  Expected: FAIL because metadata, selection, and routes are not provider-aware.

- [ ] **Step 4: Update API and TanStack Query identity.**

  Return `SessionListResponse` from `fetchSessionList()` and update consumers to read `query.data.sessions` and `query.data.warnings`. Include provider in session URLs and query keys: `['session', provider, projectId, sessionId]`. Pass provider to `parseSession`. Keep `/api/prompts`, `/api/token-usage`, `/api/memory`, `/api/control`, and `/api/narrative` unchanged.

- [ ] **Step 5: Update selections and liveness.**

  Add provider to session/prompt selections and every lookup key. `isLiveMeta(meta)` must return `false` before timestamp arithmetic when `meta.provider !== 'claude'`. Filter `knownSessionIds` and memory-origin lookup candidates to Claude metadata.

- [ ] **Step 6: Implement provider-qualified titles.**

  Resolve titles in this order: qualified key, legacy bare session ID only for Claude, server title, cwd basename. Rename writes the qualified key and removes that Claude session’s legacy bare key. Do not rewrite expansion or project-order storage because those are cwd-grouped.

- [ ] **Step 7: Render provider warnings without blocking sessions.**

  In Sessions mode, render each warning once above the project groups with `data-testid="provider-warning-<provider>"`. Keep healthy sessions selectable. Do not render a warning for an absent root because adapters return no warning for `ENOENT`.

- [ ] **Step 8: Verify GREEN.**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/live/liveness.test.ts tests/unit/components/SessionsList.provider.test.tsx tests/unit/App-mode-routing.test.tsx
  npm.cmd run typecheck
  ```

  Expected: focused tests pass and typecheck exits 0.

- [ ] **Step 9: Commit provider-aware client identity.**

  ```powershell
  git add src/api src/components/live/liveness.ts src/components/library src/App.tsx tests/unit
  git commit -m "feat(ui): route and identify sessions by provider"
  ```

---

### Task 6: Add provider badges and hide Claude-only controls for Codex

**Files:**
- Modify: `src/components/library/SessionsList.tsx`
- Modify: `src/components/narrative/InspectorTabs.tsx`
- Modify: `src/App.tsx`
- Modify: `src/theme/header-nav.css` or colocated component styles, following the existing component pattern
- Modify: `tests/unit/components/inspector-tabs.test.tsx`
- Modify: `tests/unit/components/SessionsList.provider.test.tsx`

**Interfaces:**
- Produces: `InspectorTabsProps.narrativeEnabled: boolean`.
- Produces: provider badge test IDs scoped inside each session item and `data-testid="session-provider"` in the selected-session header.

- [ ] **Step 1: Write failing capability and badge tests.**

  Assert that a Codex row displays `CODEX`, a Claude row displays `CLAUDE`, and a selected Codex session header displays `CODEX`. Render `InspectorTabs` with `narrativeEnabled={false}` and assert `tab-narrative` is absent while Details still opens; render with `true` and preserve current tab behavior.

  The production changes these tests catch are presenting unavailable narration for Codex or obscuring the active provider.

- [ ] **Step 2: Confirm RED.**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/components/SessionsList.provider.test.tsx tests/unit/components/inspector-tabs.test.tsx
  ```

  Expected: FAIL because badges and `narrativeEnabled` do not exist.

- [ ] **Step 3: Implement badges using existing theme tokens.**

  Render compact uppercase provider text beside date/size. Use existing cyan for Claude and subagent-accent purple for Codex; do not add a new theme system. Include provider in row test IDs so duplicate native IDs remain addressable.

- [ ] **Step 4: Gate narration and header controls.**

  Pass `narrativeEnabled={effectiveSession.provider === 'claude'}`. When false, `InspectorTabs` renders only Details and never mounts `NarrativeTab`. The LIVE button and `LivePanes` remain governed by the provider-aware `isLiveMeta`, so no Codex control API requests can occur.

- [ ] **Step 5: Verify GREEN and component regressions.**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/components/SessionsList.provider.test.tsx tests/unit/components/inspector-tabs.test.tsx tests/unit/components/LivePanes.test.tsx tests/unit/App-mode-routing.test.tsx
  npm.cmd run typecheck
  ```

  Expected: focused tests pass and typecheck exits 0.

- [ ] **Step 6: Commit capability-aware UI.**

  ```powershell
  git add src/components src/App.tsx src/theme tests/unit/components tests/unit/App-mode-routing.test.tsx
  git commit -m "feat(ui): label providers and gate Claude-only features"
  ```

---

### Task 7: Prove mixed-provider discovery and nested replay end to end

**Files:**
- Create: `tests/fixtures/codex-home/sessions/2026/08/08/*.jsonl`
- Modify: `playwright.config.ts`
- Create: `tests/e2e/codex-provider.spec.ts`
- Modify: `tests/e2e/discovery-load.spec.ts`

**Interfaces:**
- Consumes: the production API, provider fixtures, graph DOM, playback controls, and session library.
- Produces: browser-level acceptance coverage for mixed providers and nested Codex branches.

- [ ] **Step 1: Add deterministic Codex E2E fixtures.**

  Use a main rollout whose cwd matches one Claude fixture project, containing a user prompt, visible reasoning, one tool call/output, one child start activity, and a final assistant response. Add the matching child rollout and a guardian-style child without a start activity. Use timestamps older than the live threshold.

- [ ] **Step 2: Write the failing Playwright spec.**

  Assert that:

  - the shared cwd group contains both Claude and Codex badges;
  - selecting the Codex row renders the expected root, reasoning, tool, completion, and two nested branches;
  - playback reaches Codex nodes in source order;
  - the header says `CODEX`;
  - LIVE and Logical Steps are absent;
  - selecting the Claude row still shows its existing graph and Claude capabilities.

- [ ] **Step 3: Confirm RED.**

  Add `CODEX_HOME: path.resolve(__dirname, 'tests/fixtures/codex-home')` to the Playwright server environment only after the first run establishes that the new Codex assertions fail for missing integration.

  Run: `npm.cmd run test:e2e -- tests/e2e/codex-provider.spec.ts`

  Expected: FAIL before the environment and full UI wiring are present.

- [ ] **Step 4: Complete fixture wiring and update discovery counts.**

  Point `CODEX_HOME` at the fixture root. Update existing discovery count assertions to include only the new main Codex session; child rollouts must not appear as library rows.

- [ ] **Step 5: Verify mixed-provider E2E GREEN.**

  Run:

  ```powershell
  npm.cmd run test:e2e -- tests/e2e/codex-provider.spec.ts tests/e2e/discovery-load.spec.ts tests/e2e/playback.spec.ts tests/e2e/subagent.spec.ts tests/e2e/control-bar.spec.ts tests/e2e/narrative.spec.ts
  ```

  Expected: all selected specs pass.

- [ ] **Step 6: Commit end-to-end coverage.**

  ```powershell
  git add tests/fixtures/codex-home tests/e2e playwright.config.ts
  git commit -m "test(e2e): cover mixed Claude and Codex replay"
  ```

---

### Task 8: Document deferred versions and perform final verification

**Files:**
- Create: `future_developments.md`
- Create: `docs/superpowers/specs/2026-08-08-codex-provider-adapter-v1-design.md`
- Modify: `README.md`

**Interfaces:**
- Documents: supported providers, default roots and overrides, v1 capabilities, and deferred work.

- [ ] **Step 1: Write the approved design record.**

  Capture the approved architecture, Codex mapping rules, nested-agent fallback, UI capability gates, failure handling, and acceptance criteria. Do not introduce requirements absent from this plan.

- [ ] **Step 2: Add `future_developments.md`.**

  Record exactly these deferred areas:

  - provider-neutral product rename;
  - Codex Prompts indexing;
  - Codex token, usage, pricing, and cost reporting;
  - provider-neutral Logical Steps narration;
  - Codex live monitoring;
  - Codex pause/steer controls;
  - Codex memory integration if a stable equivalent becomes available.

- [ ] **Step 3: Update README capability wording.**

  Explain that ClaudeWatch reads Claude and Codex local sessions, that Codex v1 is read-only replay, and that Claude remains the provider for Prompts, Usage, Memory, Logical Steps, live monitoring, and controls. Document `CLAUDE_HOME` and `CODEX_HOME` overrides without implying live Codex support.

- [ ] **Step 4: Run the complete verification gate.**

  Run fresh commands:

  ```powershell
  npm.cmd run typecheck
  npm.cmd test
  npm.cmd run test:e2e
  git diff --check
  git status --short
  ```

  Expected: typecheck exits 0; unit and E2E suites introduce no failures relative to the recorded baseline; `git diff --check` is clean; only planned files plus the pre-existing untracked screenshots appear in status.

- [ ] **Step 5: Review requirements against evidence.**

  Manually verify from test output and diff that provider roots are read-only, nested children do not become library rows, Codex never becomes live, Claude-only endpoints remain unchanged, every provider-sensitive identity includes provider, and every deferred feature appears in `future_developments.md`.

- [ ] **Step 6: Commit documentation and final integration.**

  ```powershell
  git add README.md future_developments.md docs/superpowers/specs/2026-08-08-codex-provider-adapter-v1-design.md docs/superpowers/plans/2026-08-08-codex-provider-adapter-v1.md
  git commit -m "docs: document Codex replay support and future work"
  ```

---

## Execution Notes

- Create or enter an isolated worktree before Task 1; do not implement directly on `main` without explicit user consent.
- Follow strict red-green-refactor within each task. A new behavior is not implemented until its focused test has failed for the expected missing behavior.
- Do not stage the pre-existing screenshot files.
- If baseline or final commands fail, report the exact failing tests and distinguish pre-existing failures from regressions before continuing.
