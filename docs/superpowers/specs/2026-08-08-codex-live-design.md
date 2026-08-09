# ClaudeWatch Codex Live Design

Date: 2026-08-08
Status: Approved (design)

## Goal

Extend ClaudeWatch's existing Live experience to recent Codex sessions. Codex Live is a read-only view of a rollout while its files are changing: the main task and active recursively nested subagents update through the existing multi-pane graph without reloading the application.

The interaction should feel the same as current Claude Live. Provider-specific differences are limited to how subagent panes are matched and to Codex's lack of pause, resume, and steer controls.

## Scope

Codex Live v1 includes:

- the existing `LIVE` session badge and automatic Live entry;
- seven-second session-list and selected-payload polling;
- the existing main pane, subagent panes, graph rendering, details, filters, minimap, and replay toggle;
- direct and recursively nested Codex subagent panes;
- the current active, closing, frozen, closed, and reactivation lifecycle;
- defensive refresh behavior that preserves the last successfully rendered session.

Codex Live v1 does not include:

- pause, resume, steer, or any other writes to Codex state;
- Codex control-hook requests or control endpoints;
- byte-offset or streaming JSONL reads;
- changes to Claude's existing subagent association behavior;
- changes to the existing large-session confirmation threshold.

## Architecture

The existing Live path becomes provider-neutral instead of introducing a second Live implementation. `isLiveMeta` accepts both Claude and Codex session metadata and applies the existing 180-second freshness threshold to `lastUpdatedAt`. The application continues to refetch the session list every seven seconds.

Selecting a session currently classified as live automatically engages Live for either provider. While the selected session is live or Live remains engaged, the provider-qualified session query refetches its payload every seven seconds. Codex refreshes reread the main rollout and all indexed descendants through the existing read-only Codex adapter, then rerun the Codex parser. No filesystem watcher, persistent tail cursor, or new host dependency is introduced.

If the selected session later becomes stale, the `LIVE` badge and button follow the existing Claude behavior. The rendered Live panes remain in place until the user leaves Live or selects another session; the application does not forcibly replace the Live view with replay.

## Provider-aware subagent association

Claude and Codex keep separate association strategies behind one provider-aware pane resolver:

- Claude retains its current filename/order-based association unchanged.
- Codex resolves a spawn milestone's `spawnThreadId` directly to the child rollout whose `threadId` matches it.

The Codex parser already attaches child milestones recursively using `parent_thread_id`, including synthetic spawn milestones for older guardian-style rollouts that lack a visible start event. Live uses that normalized tree rather than rescanning raw events in the UI.

Each Codex child rollout's `lastUpdatedAt` is exposed in `session.subagentMtimes` under its thread ID. Consequently the identifier used for spawn association, pane identity, freshness, React keys, and lifecycle state is the same stable thread ID. Agent nickname or agent path remains the human-readable pane label.

Nested descendants are eligible for panes independently. An active grandchild can therefore remain visible even when its parent pane begins closing, because pane lifecycle is based on each rollout's own timestamp.

## Pane lifecycle

Codex adopts the constants and transitions used by the current Claude implementation:

1. A child is active when its rollout was updated within the last 30 seconds.
2. After 30 seconds without an update, its pane enters the existing 30-second closing countdown.
3. The user may freeze and resume that countdown using the existing chip behavior.
4. At zero, the pane closes and the grid reflows.
5. A later payload refresh with a newer child timestamp reactivates the child and makes its pane visible again.

The main pane is not removed by this lifecycle. It stays rendered until the user turns Live off or selects a different session.

Only currently displayable descendants are shown: active, closing, or user-frozen. Historical children do not all appear merely because they exist in the replay tree.

## UI and capability boundaries

Codex reuses the current Claude Live visuals and interactions:

- provider and `LIVE` badges remain visible in the library and selected-session context;
- opening a live Codex session enters the existing multi-pane layout;
- pane graphs update in chronological order on successful refreshes;
- node selection, detail inspection, camera behavior, filters, minimap, closing chips, and the Live/replay toggle remain provider-neutral;
- agent nickname or path is used as the branch and pane label.

The control boundary is explicit. Claude renders its current `ControlBar` and invokes its current control hooks. Codex renders neither. Choosing a Codex session must not instantiate pause/status/steer hooks, make control API calls, or expose disabled placeholders that imply controls are available.

The existing confirmation for sessions with more than 1,000 milestones remains before the Live view. A large recent Codex session therefore requires `LOAD ANYWAY`, just as a large Claude session does.

Logical Steps and narration remain unavailable for Codex. Prompts, Usage, and Memory remain Claude-only as established by the provider adapter v1 design.

## Refresh and failure behavior

Each successful payload refresh atomically replaces the normalized session supplied to Live. Records are processed in JSONL order, so completed records appear in their original chronology. Partially written, malformed, encrypted, or unknown records remain ignored according to the Codex parser contract and can become visible on a later refresh once a valid complete record exists.

A transient read, parse, or network failure does not blank the Live UI. TanStack Query retains the last successful session data while reporting the refresh error through its normal state. The next polling interval retries. One malformed child rollout is skipped without preventing the main rollout or other valid descendants from updating.

All Codex access remains read-only. Polling calls only the provider-qualified session-list and session-payload GET endpoints.

## Compatibility and documentation

Claude's liveness classification, polling, automatic entry, pane association, lifecycle, controls, and replay behavior must remain unchanged. The provider-generalization should be narrow enough that existing Claude tests continue to describe Claude behavior.

After Codex Live ships, `future_developments.md` removes only `Codex live monitoring`. `Codex pause/steer controls` remains deferred, along with the other provider-neutral and Codex-only future items.

## Verification strategy

Unit and component coverage will verify:

- `isLiveMeta` classifies recent Claude and Codex sessions and rejects stale sessions;
- application selection auto-engages recent Codex sessions and polls the provider-qualified payload;
- leaving Live returns to the existing replay view;
- Claude continues using its current subagent association;
- Codex maps `spawnThreadId` directly to child `threadId`, including recursively nested and synthetic guardian-style children;
- child freshness, closing, freezing, removal, and reactivation follow the current lifecycle constants;
- Codex renders no `ControlBar`, invokes no Claude control hooks, and makes no control requests;
- a failed refresh retains the last successful graph;
- the existing greater-than-1,000-milestone confirmation still gates large sessions.

A mutable mixed-provider Playwright fixture will prove:

1. recent Claude and Codex sessions display `LIVE` in the shared cwd group;
2. selecting Codex loads the provider-qualified endpoint and enters Live;
3. appending valid main-rollout events makes them appear after polling;
4. starting a direct child and a nested child creates correctly labeled panes;
5. child inactivity enters closing, a later update reactivates it, and sustained inactivity removes it;
6. Codex exposes no control UI or control requests;
7. toggling Live off returns to Codex replay;
8. the corresponding Claude Live fixture and controls remain unchanged.

Final verification runs `npm.cmd run typecheck`, `npm.cmd test`, focused Live and mixed-provider Playwright specs, and then the full Playwright suite. No new npm or host dependency is permitted.

## Acceptance criteria

- A recently updated Codex session is discoverable as live and automatically opens in the existing Live view.
- New Codex main-task milestones appear without a page reload.
- Direct, nested, and guardian-style active subagents appear as independently updating panes.
- Stale Codex subagent panes follow the same visible lifecycle as current Claude panes and can reactivate after new activity.
- Codex Live performs no write or control operation.
- Refresh failures and malformed records do not erase the last good view or block other valid rollouts.
- Claude Live and all historical replay behavior remain unchanged.
- The implementation adds no host dependency and writes nothing under `CLAUDE_HOME` or `CODEX_HOME`.
