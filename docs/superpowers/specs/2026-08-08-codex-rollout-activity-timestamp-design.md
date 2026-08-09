# Codex Rollout Activity Timestamp Design

## Problem

Codex can keep a rollout file open while appending records. On Windows, the file size and readable contents advance while the filesystem modification time remains at the time the writer opened the file. ClaudeWatch currently exposes that stale modification time as `lastUpdatedAt`.

The Live lifecycle therefore considers a still-active Codex subagent stale after three minutes. In session `019fdb99`, Franklin's rollout had filesystem mtime `2026-08-08T10:34:10.740Z` while its newest JSONL record was timestamped `2026-08-08T10:37:53.146Z`; Franklin was active but absent from Live.

## Design

The Codex provider adapter will derive each rollout's activity time from the newest valid top-level JSONL record timestamp. `lastUpdatedAt` will use that timestamp when one exists and fall back to the filesystem mtime when records have no valid timestamp.

The adapter already invalidates its rollout cache when either file size or mtime changes. Appended records increase file size, so the existing polling and cache behavior will reparse active rollouts without additional filesystem scans or server state.

This applies consistently to main and child rollouts. The provider-neutral Live threshold, pane lifecycle, polling intervals, replay parser, and Claude adapter remain unchanged.

## Validation and Failure Handling

A record timestamp is usable only when it is a non-empty string accepted by `Date.parse`. Malformed lines, missing timestamps, and invalid timestamps are ignored for activity-time calculation. The newest valid timestamp by absolute time wins; filesystem mtime remains the safe fallback.

No Codex files are modified. Unknown record types continue to be ignored for rendering but may still contribute a valid top-level timestamp because they establish observable rollout activity.

## Tests

- Add a provider regression test whose file mtime is old but whose latest JSONL record timestamp is newer; both the main session metadata and child payload must expose the record timestamp.
- Add fallback coverage for rollouts without a valid record timestamp.
- Run the Codex provider unit tests, typecheck, all unit tests, and focused Codex Live/provider Playwright specs.
- Re-test a real Codex Live session in the in-app browser and confirm an active child pane is present while its filesystem mtime is stale.

## Non-Goals

- No change to the three-minute Live threshold.
- No explicit process-status or `task_complete` state machine.
- No provider-neutral timestamp rewrite.
- No Codex pause or steer controls.
