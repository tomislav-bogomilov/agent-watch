# Live Pause & Steer — Design

**Date:** 2026-06-13
**Status:** Approved (brainstorm 2026-06-12/13)
**Branch:** `feature/live-pause-steer`

## Summary

Add the ability to pause a running Claude Code agent — the main agent, an
individual subagent, or all of them — from ThoughtGraph's LIVE view, inspect
its state, and optionally inject a steering note that the agent reads when
resumed. Today ThoughtGraph is a read-only viewer; this feature gives it a
control channel into running sessions via a Claude Code `PreToolUse` hook
that gates every tool call through ThoughtGraph's server.

Out of scope for v1: steering a running agent without pausing it
(live-steer). The gate architecture supports it; it was deliberately
deferred until the pause flow proves itself.

## Core principle: fail-open

Every failure mode unpauses. ThoughtGraph not running, server restart,
network error, timeout, unknown agent — in all cases the tool call is
allowed through and the session behaves as if the feature didn't exist.
ThoughtGraph being closed must never leave an agent stuck.

## Mechanism

Pause lands at **tool-call boundaries**: a `PreToolUse` hook blocks before
the agent's next tool call. It cannot interrupt mid-text-generation. The UI
must therefore show a "pause pending" state between the user's click and the
gate actually catching the agent.

Steering is delivered through the hook's output: resuming with a note makes
the gate answer `permissionDecision: "deny"` with
`permissionDecisionReason` = the user's note (plus boilerplate: "re-issue
the held tool call if still appropriate"). The model reads the reason and
acts on it. Resuming without a note answers a plain allow and the held tool
call proceeds untouched.

## Components

### 1. Gate hook script — `hooks/thoughtgraph-gate.mjs`

A dependency-free Node script living in the ThoughtGraph repo, registered
as a global `PreToolUse` hook with matcher `*`.

Per tool call:

1. Read hook input JSON from stdin (`session_id`, `tool_use_id`,
   `tool_name`, `tool_input`).
2. POST it to `http://127.0.0.1:<port>/api/control/gate` with a ~300ms
   connect timeout. The port defaults to 5173 (Vite's default for
   `npm run dev`); the installer bakes the actual dev-server port into the
   hook command as `--port <port>`, so a port change only requires
   re-running the installer. A gate pointed at a dead port no-ops
   (fail-open).
3. Connection refused / any error → exit 0 (allow). This is the no-op path
   when ThoughtGraph isn't running.
4. Response `{"action":"allow"}` → exit 0.
5. Response `{"action":"deny","reason":...}` → print PreToolUse JSON output
   (`hookSpecificOutput.permissionDecision: "deny"` +
   `permissionDecisionReason`) and exit 0.
6. While paused the server holds each gate response up to ~55s; the script
   loops on long-polls. No model turns and no token burn while paused.
7. Self-renew: the settings entry sets `timeout: 14400` (4h, undocumented
   max — verify empirically). Nearing its own deadline the script denies
   with "Paused by user in ThoughtGraph — re-issue this exact tool call",
   which re-enters the gate on the retry and keeps the pause alive at the
   cost of one model turn per 4h window.

Accepted tradeoff: a command hook spawns a Node process per tool call
(~50–100ms) for every Claude Code session on the machine while the hook is
installed.

> Implementation note: the gate script uses Node's built-in `http` module
> rather than global `fetch`. On Windows + Node v24, calling `process.exit()`
> while an undici `AbortSignal.timeout` timer is still pending crashes with
> `STATUS_STACK_BUFFER_OVERRUN`; `node:http` with a native socket timeout
> avoids this. The script remains dependency-free and its external contract
> is unchanged.

### 2. Control server — `server/vite-plugin-control.ts`

New Vite dev-server plugin alongside `vite-plugin-sessions.ts`.

State (in-memory only — server restart drops all pauses and errors out all
held gate requests, which fail open):

```ts
Map<sessionId, {
  all: boolean,
  main: boolean,
  agents: Map<agentFileId, boolean>,   // e.g. "agent-0"
  pendingNotes: Map<target, string>,   // delivered on resume
  held: Map<tool_use_id, {target, tool_name, tool_input, heldSince}>
}>
```

Endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/control/gate` | POST | Hook long-poll. Correlate caller, hold while paused (≤55s per request), answer allow / deny+note. |
| `/api/control/pause` | POST | `{projectId, sessionId, target}` where target = `all` \| `main` \| agentFileId. |
| `/api/control/resume` | POST | Same shape + optional `note`. Releases held gate requests for the target. |
| `/api/control/state` | GET | Per-session pause flags, held tool calls (name, input summary, heldSince), hook-installed status. |
| `/api/control/install-hook` | POST | Surgical hook install (below). |

Path/input validation follows the existing session-endpoint hardening
(path-traversal guards, commit `183969b`).

### 3. Per-subagent correlation

Claude Code's `PreToolUse` input does not identify the calling agent
(known gap, claude-code#40140). The server correlates instead: look up the
gate request's `tool_use_id` in the session's transcript files — found in
`agent-N.jsonl` → that subagent; found in the main session JSONL → main.

Write-lag race: the assistant message containing the `tool_use_id` may not
be flushed when the hook fires. Retry ~3×300ms; if still unknown:

- session paused via **all** → hold anyway (no correlation needed),
- **targeted** pause (main or one agent) → allow through (fail-open,
  rather than risk freezing the wrong agent).

UI panes are keyed by spawn-node id; the existing `subagentEntries`
spawn↔file mapping translates to `agentFileId` for control targets.

### 4. Hook installer

`POST /api/control/install-hook`:

1. Read `~/.claude/settings.json` (create minimal file if absent).
2. Write timestamped backup (`settings.json.bak-<ISO>`) next to it.
3. Parse JSON, append exactly one entry to `hooks.PreToolUse`
   (creating only the missing keys along that path):
   `{matcher: "*", hooks: [{type: "command", command: "node <abs path>/hooks/thoughtgraph-gate.mjs", timeout: 14400}]}`.
4. **Touch nothing else** — all other keys, hooks, and entries are
   preserved exactly. Idempotent: if our entry already exists, do nothing
   and report `already-installed`.

Hooks hot-reload, so already-running sessions pick the gate up without
restart. The UI offers installation the first time the user tries to pause
and the gate isn't installed.

## UI — slim status bar (chosen layout: B2, with B3 detail in rows)

Lives under the canvas, LIVE view only.

**Collapsed (default):** one line — status dot per agent (cyan main,
violet subagents, amber paused), "N running", `⏸ ALL` button, expand
caret. Auto-expands when anything is paused.

**Expanded dock:** one row per agent — dot, name + task summary,
pause/resume toggle. Paused rows additionally show:

- the held tool call, e.g. `holding: Bash("npm run e2e")`,
- paused-elapsed timer,
- steer input + `▶ RESUME` (resume-with-note if text entered, plain resume
  otherwise).

Bottom row: `⏸ PAUSE ALL` / `▶ RESUME ALL`.

**Pane echo:** paused agent's pane border turns amber with a `PAUSED` chip
(reuse existing pane status styling). The existing view-freeze
`frozen`/`onToggleFreeze` props in `LivePane.tsx` are unrelated
(view-freeze, not agent-pause) and stay untouched.

**State sync:** UI polls `/api/control/state` on the existing 7s LIVE
cadence plus an immediate refetch after any pause/resume action. Between
the user's click and the gate catching the agent, the row shows
**pause pending**.

## Edge cases

- **Hook not installed:** first pause attempt shows an inline dock prompt
  ("install gate hook — writes one entry to `~/.claude/settings.json`,
  backup taken"). One click installs, then the pause proceeds.
- **Agent finishes while pause is pending:** no further tool calls reach
  the gate; the row shows completion and the pause clears.
- **ThoughtGraph closed while paused:** held gate requests error → hooks
  fail open → agents resume. Stated in UI copy near PAUSE controls.
- **Multiple LIVE sessions:** state is keyed by session; the bar commands
  only the session being viewed.
- **Non-LIVE sessions:** no bar; gate answers allow immediately unless a
  pause is active for that specific session.

## Testing

- **Unit:** installer merge (preserves unrelated keys/hooks byte-for-byte
  aside from the one addition; idempotent; backup written), correlation
  lookup (main vs agent-N vs not-found fallbacks), gate state machine
  (hold/release/deny-with-note/55s re-poll).
- **Integration:** fake hook client (plain HTTP) against the dev server —
  pause → held; resume → allow; resume+note → deny with note as reason;
  server restart → client error (fail-open).
- **E2E (Playwright, fixtures):** bar renders collapsed, expands on pause,
  paused row shows held call + timer, resume flow works. Mind the
  port-5174 stray-dev-server gotcha; 7 hologram/playback specs are the
  known-failing baseline on main.
- **Manual:** one real Claude Code session end-to-end, explicitly
  verifying the undocumented 4h hook timeout and the self-renew deny path.

## Decisions log

| Decision | Choice |
|---|---|
| Steering depth | Pause + inject note on resume (no pending-tool-call intervention UI) |
| Live-steer without pause | Deferred (not in v1) |
| Hook install | ThoughtGraph installs via surgical merge; never disturbs other settings |
| Control channel | HTTP long-poll to dev server; in-memory state; fail-open everywhere |
| UI layout | B2 slim status bar → expanding dock, with B3 held-call/timer detail |
| Per-subagent targeting | Server-side `tool_use_id` → transcript correlation, with fail-open fallback |
