# ClaudeWatch Codex Provider Adapter v1 Design

## Goal

Add read-only discovery and replay for local Codex Desktop/CLI rollouts while preserving all Claude behavior. Claude and Codex sessions appear in one cwd-grouped library, with provider identity carried through the server, client cache, selection state, persisted titles, and React keys.

## Architecture

The server owns a registry of provider adapters. Each adapter lists provider-tagged session metadata and reads a discriminated payload. Listing uses independent provider results, merges healthy results newest-first, and returns non-blocking warnings so one unavailable source cannot hide the other.

Claude discovery and payload reading retain the existing JSONL and subagent-file behavior behind the Claude adapter. Codex discovery recursively scans `${CODEX_HOME}/sessions` for `rollout-*.jsonl`, with `CODEX_HOME` defaulting to `~/.codex`. A missing root is normal. An unreadable root becomes a provider warning. Malformed records or rollout files are skipped without stopping discovery.

Codex project IDs are the base64url encoding of the normalized cwd. Reads resolve `{projectId, sessionId}` only through the adapter's discovered metadata index. Request segments are never converted into filesystem paths.

## Codex normalization

Records remain in JSONL order. Every milestone ID is prefixed by its rollout thread ID.

- User response messages become root or follow-up milestones.
- Assistant output messages become assistant milestones; the final output is promoted to completion.
- Visible `event_msg.agent_reasoning` records become `Decided` milestones.
- Response reasoning summaries are used only when the session has no visible reasoning event in any rollout.
- Function and custom tool calls become tool milestones and outputs are correlated by `call_id`.
- Tools fail only from structured failed/error status, an explicit error field, or a structured nonzero exit code.
- Developer/system content, mirrored messages, encrypted reasoning, world state, envelopes, unknown records, and malformed lines do not render.

`sub_agent_activity(kind: "started")` creates a spawn keyed by `agent_thread_id`. Child rollouts attach recursively by `parent_thread_id`, labeled by nickname or agent path. When metadata identifies a child but the parent has no matching start event, a spawn is synthesized at the child's start time. The existing graph convention is preserved: a spawn's child branch is first and the continuing parent flow is second.

## Product behavior

Rows and selected-session headers show `CLAUDE` or `CODEX`. Both providers share cwd groups, graph layout, playback, filters, minimap, and details. Codex is always historical in v1, even when its files are recent; live mode, pause/steer controls, and Logical Steps are unavailable. Prompts, Usage, Memory, narration, monitoring, and control endpoints remain Claude-only. Memory-origin session lookup considers only Claude sessions.

Custom titles use `provider/project/session`. When a qualified Claude title is absent, the old bare-session key remains readable; future edits are stored under the qualified key. Existing cwd-based expansion and ordering preferences are unchanged.

## Acceptance criteria

- Neither provider's data is written by discovery or replay.
- No new host or npm dependency is introduced.
- Claude parsing, replay, live controls, prompts, usage, memory, and narration do not regress.
- Codex reasoning, tools, nested children, and guardian-style children replay correctly.
- Either provider may be absent or partially malformed without blocking the other.
