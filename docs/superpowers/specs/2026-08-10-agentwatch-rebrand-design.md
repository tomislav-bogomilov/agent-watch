# AgentWatch Rebrand — Design

## Goal

Rename the product from **ClaudeWatch** to **AgentWatch** on user-facing and
publishable metadata surfaces, without changing runtime behavior or
compatibility-sensitive identifiers.

## Scope

- Change the browser title, header wordmark, and tagline to AgentWatch branding.
- Change the npm package name and matching lockfile root name to `agentwatch`.
- Update current product documentation and README image alt text where they use
  the product name.
- Update tests that assert user-visible brand copy.
- Update `future_developments.md`: remove the completed product-rename item and
  state that provider-neutral feature parity remains deferred.

## Compatibility Boundary

Do not rename code identifiers, component filenames, CSS classes, local-storage
keys, hook protocol text, filesystem paths, or archival design and plan records.
Those names can be compatibility-relevant or preserve historical context. The
existing Claude-specific integration and Codex's read-only support remain
unchanged.

## Copy Rules

- Product references: `AgentWatch` (or `AGENTWATCH` for the header wordmark).
- Header tagline: `watch agents think`.
- Provider references remain accurate: use `Claude Code` and `Codex` when
  describing their respective integrations; do not imply provider-neutral
  controls or feature parity.

## Verification

Run the targeted header branding test, `npm.cmd run typecheck`, and
`npm.cmd run build`. The full unit suite may retain its known Node 25
`localStorage.clear is not a function` environment failures; report those
separately from this change.
