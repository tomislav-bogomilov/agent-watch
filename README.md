# ClaudeWatch

Watch a Claude Code agent *think*. ClaudeWatch reads Claude Code's own session logs from
your machine and turns each session into a navigable graph: every node is a **Thought** — a
prompt, a decision, a tool call, a subagent spawn, a completion — and edges link each
Thought to the ones that followed. A glowing playhead retraces the agent's path, lighting
up the trail it took, with failures in red, abandoned branches dimmed, and the winning path
brightened. It also shows in-progress sessions live and aggregates token usage across all
your sessions.

No recording or instrumentation needed — run Claude Code as usual, then point ClaudeWatch
at the logs it already wrote.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173  (open in Chrome or Edge)
```

Requires a populated `~/.claude/projects` (i.e. you've used Claude Code locally). Your
sessions appear in the left sidebar automatically.

## Documentation

- **[User Guide](docs/tech_docs/USER_GUIDE.md)** — for anyone using the app: reading the
  graph, playback, live sessions, the Token Usage page. No coding required.
- **[Developer Guide](docs/tech_docs/DEVELOPER_GUIDE.md)** — architecture, the parsing
  pipeline, the data model, rendering/playback, and how to extend it.
- **[`PRD.md`](PRD.md)** — product requirements. **[`docs/superpowers/`](docs/superpowers/)** —
  design specs and implementation plans, by feature.

## Stack

React 19 · TypeScript · Vite 6 · TanStack Query · D3 7. Dev-only (no production build).
Tests: Vitest (unit) + Playwright (e2e, Chromium).