# ClaudeWatch — Open Questions & Future Analysis Ideas

> A scratchpad of things in a Claude Code session worth surfacing beyond the current
> "what path did the agent take?" view. ClaudeWatch today filters most of the items
> below out as noise (`src/parse/filter.ts`) or ignores them (timestamps are unused for
> ordering). Not a spec — a menu of directions to pick from later.

**Framing:** ClaudeWatch today answers *"what path did the agent take?"* The untapped
layer answers *"how expensive, how reliable, how supervised, and how fast was that path?"*
— performance, cost, trust, and behavior.

## Time & performance
Every event has a `timestamp`, currently used for nothing visual (ordering uses
`parentUuid`).
- **Per-step latency** — how long each Thought took (think time vs tool time); where the
  agent spent wall-clock time.
- **Slow spots** — the one long Bash command, the long pause before a hard decision.
- **Idle gaps** — time waiting on the user vs time actively working.

## Context & token dynamics within a session
The Token Usage page aggregates across sessions; a single session has its own story.
- **Context growth along the trail** — plot `contextSize` per node against the playhead to
  show context pressure building toward the end.
- **Cache efficiency** — `cache_read` vs `cache_creation` per turn.
- **Model switches** — `message.model` per assistant event; Opus→Sonnet mid-session, which
  model made which call, subagent model differences.

## Currently dropped as "noise" but interesting
- **Permission events** (`permission-mode`) — when the agent asked, allow/deny, switches to
  accept-edits. A trust/workflow timeline.
- **Hook outputs** (`attachment`) — pre/post-tool hooks firing, returns, whether one blocked
  a tool.
- **File-history snapshots** (`file-history-snapshot`) — file checkpoints/edits and rewind
  points: "what did this session change on disk?"
- **Queued messages** (`queue-operation`) — typing ahead while the agent worked, or
  interruptions.
- **Slash commands & skills** — stripped as command-wrappers today, but which skills/commands
  drove the session is a real signal.

## Patterns & stats (derived from existing data)
- **Tool histogram** — most-read files, most-run commands, read:edit ratio, # of Bash calls.
- **Retry / self-correction loops** — the same tool hammered after a failure before it
  worked (failures are already detected; the *loop* is the insight).
- **Subagent topology** — count, parallel vs sequential, nesting depth, agent types.
- **TODO evolution** — `TodoWrite` calls trace the agent's own plan and check-offs.
- **Git context** — `gitBranch` / `cwd`: what branch the work happened on, whether it changed.

## Effort note (to assess when we pick this up)
- **Basically free** (data already parsed today): per-step latency, context growth, model
  switches, tool histogram, retry loops, subagent topology, TODO evolution.
- **Needs un-filtering event types** we currently discard: permission events, hook outputs,
  file-history snapshots, queued messages, slash command/skill tracking.
