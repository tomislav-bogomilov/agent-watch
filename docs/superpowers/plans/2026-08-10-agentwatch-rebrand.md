# AgentWatch Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the product and publishable package metadata to AgentWatch without changing compatibility-sensitive internals or provider behavior.

**Architecture:** The existing header remains structurally identical; only its displayed copy changes. Current product documents and package manifests receive the new name, while internal ClaudeWatch identifiers and archive documents are deliberately retained. Deferred work is clarified as provider-neutral feature parity rather than a pending rename.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, npm.

## Global Constraints

- Work only in `D:\projects\react\ClaudeWatch-public`.
- Use `AgentWatch` for product references and `AGENTWATCH` for the header wordmark.
- Use the tagline `watch agents think`.
- Keep provider names factual: Claude Code and Codex are integrations, not product names.
- Do not rename `ClaudeWatchMark`, source filenames, CSS classes, storage keys, hook protocol messages, filesystem paths, or `docs/superpowers/` archive records.
- Do not add dependencies or change provider behavior.

---

### Task 1: Update visible header branding with its regression test

**Files:**
- Modify: `tests/unit/components/AppHeader.test.tsx`
- Modify: `src/components/AppHeader.tsx`

**Interfaces:**
- Consumes: `AppHeader({ mode, onModeChange })` and its `app-header` / `app-tagline` test IDs.
- Produces: the AgentWatch wordmark and `watch agents think` visible tagline.

- [ ] **Step 1: Update the branding assertions**

```tsx
it('renders the AGENTWATCH wordmark', () => {
  render(<AppHeader mode="sessions" onModeChange={() => {}} />);
  const header = screen.getByTestId('app-header');
  expect(header.textContent).toContain('AGENT');
  expect(header.textContent).toContain('WATCH');
});

it('renders the tagline reading "watch agents think"', () => {
  render(<AppHeader mode="sessions" onModeChange={() => {}} />);
  expect(screen.getByTestId('app-tagline').textContent).toBe('watch agents think');
});
```

- [ ] **Step 2: Run the focused test to establish the expected failure**

Run: `npm.cmd test -- AppHeader.test.tsx`

Expected: FAIL because the current component still renders `CLAUDEWATCH` and `watch claude think`.

- [ ] **Step 3: Change only displayed header copy**

```tsx
<span style={styles.wordmark}>
  AGENT<span style={styles.accent}>WATCH</span>
</span>
...
<span style={styles.tagWatch}>watch</span>{' '}
<span style={styles.tagClaude}>agents</span>{' '}
<span style={styles.tagThink}>think</span>
```

Keep `ClaudeWatchMark`, style property names, and layout untouched.

- [ ] **Step 4: Run the focused test**

Run: `npm.cmd test -- AppHeader.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the tested header change**

```powershell
git add src/components/AppHeader.tsx tests/unit/components/AppHeader.test.tsx
git commit -m "feat(brand): show AgentWatch header"
```

### Task 2: Rename publishable metadata and current product copy

**Files:**
- Modify: `index.html`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `PRD.md`
- Modify: `USER_GUIDE.md`
- Modify: `docs/tech_docs/USER_GUIDE.md`
- Modify: `docs/tech_docs/DEVELOPER_GUIDE.md`
- Modify: `docs/tech_docs/open_questions.md`

**Interfaces:**
- Consumes: package root metadata and prose that distinguishes the product from Claude Code and Codex.
- Produces: consistent public-facing AgentWatch naming without changing commands, provider paths, or integration descriptions.

- [ ] **Step 1: Update browser and package metadata**

Set `<title>AgentWatch</title>` in `index.html`. Set both root `name` values in `package.json` and `package-lock.json` to `agentwatch`; do not alter versions, scripts, or dependencies.

- [ ] **Step 2: Replace product-name prose, preserving provider names**

Replace current product references such as `ClaudeWatch reads Claude Code's own session logs` with `AgentWatch reads Claude Code's own session logs`. Change README image alt text to AgentWatch. Retain terms such as `Claude Code`, `~/.claude`, `CLAUDE_HOME`, `Codex`, and `CODEX_HOME`, since these identify external providers and their real paths.

- [ ] **Step 3: Update the legacy root guide's product reference**

Change the root guide heading to `# AgentWatch User Guide` and its fail-open sentence to refer to AgentWatch, while retaining `~/.claude/settings.json` and the gate semantics.

- [ ] **Step 4: Verify there are no stale current-surface product names**

Run:

```powershell
rg -n -i 'ClaudeWatch|ThoughtGraph' README.md PRD.md USER_GUIDE.md index.html package.json package-lock.json docs/tech_docs
```

Expected: no product-name matches; valid provider-specific `Claude` terms may remain without the product name.

- [ ] **Step 5: Commit metadata and documentation**

```powershell
git add index.html package.json package-lock.json README.md PRD.md USER_GUIDE.md docs/tech_docs
git commit -m "docs(brand): rename public surfaces to AgentWatch"
```

### Task 3: Record the deferred provider-neutral capability work

**Files:**
- Modify: `future_developments.md`

**Interfaces:**
- Consumes: the existing Codex-provider v1 deferral list.
- Produces: an accurate roadmap that distinguishes finished product naming from unfinished cross-provider capability parity.

- [ ] **Step 1: Replace the completed rename item**

Replace `Provider-neutral product rename.` with `Provider-neutral feature parity: controls, prompts, usage, logical-step narration, and memory across supported providers.` Keep the remaining specific deferred items.

- [ ] **Step 2: Inspect the resulting roadmap**

Run: `Get-Content future_developments.md`

Expected: the file no longer lists the rename as deferred and explicitly states the functionality gap behind the provider-neutral product name.

- [ ] **Step 3: Commit the roadmap clarification**

```powershell
git add future_developments.md
git commit -m "docs: clarify provider-neutral roadmap"
```

### Task 4: Verify the cosmetic rebrand and guard compatibility boundaries

**Files:**
- Verify: `src/components/ClaudeWatchMark.tsx`
- Verify: `hooks/thoughtgraph-gate.mjs`
- Verify: `docs/superpowers/`

**Interfaces:**
- Consumes: unchanged compatibility-sensitive symbols and the completed public-facing changes.
- Produces: evidence that product copy changed without renaming integration behavior or archives.

- [ ] **Step 1: Confirm internal compatibility surfaces are unchanged**

Run:

```powershell
git diff HEAD~3..HEAD -- src/components/ClaudeWatchMark.tsx hooks/thoughtgraph-gate.mjs docs/superpowers
```

Expected: no output for those paths, except the new AgentWatch design and implementation-plan documents.

- [ ] **Step 2: Run typechecking and production build**

Run:

```powershell
npm.cmd run typecheck
npm.cmd run build
```

Expected: both commands exit 0.

- [ ] **Step 3: Run the full unit suite and classify any failures**

Run: `npm.cmd test`

Expected: the suite passes with the configured Node 25 jsdom compatibility. If `localStorage.clear is not a function` recurs, report it as a pre-existing test-environment problem rather than a rebrand regression.

- [ ] **Step 4: Inspect final scope**

Run:

```powershell
git status --short
git log -3 --oneline
git diff --check HEAD~3..HEAD
```

Expected: three focused commits, no whitespace errors, and no uncommitted rebrand files.
