# GitHub CI and Production Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a conventional production build command and have GitHub verify install, typecheck, unit tests, and the production build for every push to `main` and every pull request.

**Architecture:** Keep the local build contract in `package.json` and add one repository-level GitHub Actions workflow with a single Ubuntu/Node.js 22 job. Documentation will describe the verified commands, while bundle splitting remains explicitly deferred.

**Tech Stack:** npm, Vite 6, TypeScript, Vitest, GitHub Actions, Node.js 22

## Global Constraints

- Use Node.js 22 in GitHub Actions.
- Use `npm ci` for deterministic dependency installation.
- Run typechecking, unit tests, and the production build in that order.
- Do not add Playwright, deployment, artifact publishing, branch-protection configuration, or code splitting.
- Preserve the existing Vite large-chunk warning as informational.
- Work on `codex/github-ci-build` in `D:\projects\react\ClaudeWatch-public`; do not merge to `main` without user confirmation.

---

### Task 1: Production build command and GitHub Actions workflow

**Files:**
- Modify: `package.json`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the existing `package-lock.json`, `typecheck`, and `test` npm scripts
- Produces: an `npm run build` command and a GitHub check named `CI / verify`

- [ ] **Step 1: Confirm the missing build contract**

Run:

```powershell
npm.cmd run build
```

Expected: FAIL with `Missing script: "build"`.

- [ ] **Step 2: Add the minimal build script**

Add this entry after `dev` in `package.json`:

```json
"build": "vite build",
```

- [ ] **Step 3: Add the GitHub Actions workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Run unit tests
        run: npm test

      - name: Build production bundle
        run: npm run build
```

- [ ] **Step 4: Verify the local quality gates**

Run:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Expected: all three commands exit 0. The build may print the known large-chunk warning, which does not fail this task.

- [ ] **Step 5: Review and commit the build and CI change**

Run:

```powershell
git diff --check
git diff -- package.json .github/workflows/ci.yml
git add package.json .github/workflows/ci.yml
git diff --cached --check
git commit -m "ci: verify production build"
```

Expected: the commit contains only `package.json` and `.github/workflows/ci.yml`.

---

### Task 2: Release-readiness documentation

**Files:**
- Modify: `README.md`
- Modify: `future_developments.md`

**Interfaces:**
- Consumes: the `npm run build` and GitHub Actions workflow delivered by Task 1
- Produces: current contributor commands and a future-work list that retains only unfinished release-readiness work

- [ ] **Step 1: Update README setup and verification commands**

In the setup command block, add:

```text
npm run build      # production bundle in dist/
```

Replace the statement `Dev-only (no production build).` with:

```text
Development uses Vite; `npm run build` creates the production bundle in `dist/`.
```

Replace the verification sentence with:

```text
Run `npm run typecheck` for the TypeScript project, `npm test` for the unit suite, and `npm run build` for the production bundle. GitHub Actions runs all three checks for pull requests and pushes to `main`.
```

- [ ] **Step 2: Narrow the future-development item**

Replace:

```text
- Release readiness: add an `npm run build` script and production CI verification; assess code-splitting for the current 506 kB minified JavaScript chunk.
```

with:

```text
- Release readiness: assess code-splitting for the current 506 kB minified JavaScript chunk.
```

- [ ] **Step 3: Verify documentation and rerun the production build**

Run:

```powershell
rg -n "npm run build|GitHub Actions|code-splitting" README.md future_developments.md
npm.cmd run build
git diff --check
```

Expected: README documents the build and CI, future developments retains code splitting, the build exits 0, and `git diff --check` reports no errors.

- [ ] **Step 4: Review and commit the documentation**

Run:

```powershell
git diff -- README.md future_developments.md
git add README.md future_developments.md
git diff --cached --check
git commit -m "docs: document build verification"
```

Expected: the commit contains only `README.md` and `future_developments.md`.

---

### Task 3: Final branch verification and GitHub handoff

**Files:**
- Verify only; no planned file changes

**Interfaces:**
- Consumes: Tasks 1 and 2
- Produces: local evidence that the branch is ready for review and a clear first-run GitHub Actions handoff

- [ ] **Step 1: Run the complete local verification sequence**

Run:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Expected: all commands exit 0; record the test file/test counts and build output size.

- [ ] **Step 2: Confirm branch scope and cleanliness**

Run:

```powershell
git status --short --branch
git log --oneline main..HEAD
git diff --check main...HEAD
git diff --stat main...HEAD
```

Expected: the working tree is clean and the branch contains the design, CI/build, and documentation commits only.

- [ ] **Step 3: Hand off the GitHub check**

Do not push or merge without user authorization. Explain that after the branch is pushed or a pull request is opened, GitHub should automatically start `CI / verify`; if Actions are disabled, the repository owner must enable them under **Settings > Actions > General**.
