# AgentWatch User Guide

## Pausing & steering live agents

In a LIVE session, the slim **AGENTS** bar under the canvas controls the
running agents. Expand it (▴) for one row per agent.

- **⏸** pauses that agent at its **next tool call** (it can't interrupt
  mid-response — the row shows "engaging…" until the gate catches it, then
  the held tool call and a paused timer).
- **▶ RESUME** lets the agent **continue** its work. If you typed a note in
  **steer ›**, it's delivered as guidance the agent reads as it continues
  (it does not block the held action). Resume with an empty field just lets
  the held call proceed untouched.
- **⏸ ALL / ▶ RESUME ALL** cover every agent, including subagents the UI
  can't individually target.

First use installs a `PreToolUse` gate hook into `~/.claude/settings.json`
(one entry, timestamped backup taken, nothing else touched). The gate
**fails open**: if AgentWatch isn't running — or you close it while
something is paused — every agent resumes. Pause state lives in server
memory only; restarting the dev server unpauses everything.

Limits: pause lands on tool-call boundaries; pausing longer than ~4h costs
one model turn to renew the hold; subagent identification relies on
transcript correlation and falls back to allow when it can't tell who's
calling (PAUSE ALL never needs correlation).
