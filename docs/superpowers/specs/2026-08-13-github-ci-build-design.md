# GitHub CI and Production Build Design

**Date:** 2026-08-13

## Goal

Close the small release-readiness gap around production builds. AgentWatch should
have a conventional local build command and GitHub should verify every proposed
change with the same deterministic checks.

## Scope

- Add `npm run build`, implemented as `vite build`.
- Add one GitHub Actions workflow for pushes to `main` and pull requests.
- Run dependency installation, typechecking, unit tests, and the production
  build on Node.js 22.
- Update the README commands and remove the completed build/CI work from
  `future_developments.md` while retaining the separate code-splitting item.

Playwright, deployment, artifact publishing, branch-protection configuration,
and code splitting are outside this change.

## Workflow

The workflow will use a single Ubuntu job with `actions/checkout`,
`actions/setup-node`, and npm dependency caching. It will run, in order:

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`

A failed command stops the job and makes the GitHub check fail. The existing
Vite large-chunk warning remains informational; reducing the bundle is a
separate future-development task.

## Verification

Before handoff, run the same typecheck, unit-test, and build commands locally.
Review the workflow YAML and repository diff, then confirm the first real
GitHub Actions run after the branch is pushed. GitHub Actions normally requires
no external service setup; repository Actions must only be enabled if the owner
has disabled them.
