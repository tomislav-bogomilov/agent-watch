/** Sanitize a pane id into a narrative-scope-safe token. The server validates
 *  each scope segment with isSafeScopeKey = /^[A-Za-z0-9._-]+$/, and subagent
 *  pane ids look like `spawn:<id>` (the ':' is not allowed). */
export function safePaneId(paneId: string): string {
  return paneId.replace(/[^A-Za-z0-9._-]/g, '-');
}

/** Per-pane narrative cache/store key, passed as the `sessionId` argument to the
 *  narrative hooks/API. The narrator never reads the session file (it transforms
 *  the POSTed milestones in a fixed cwd), so this composite is an opaque key.
 *  MAIN is suffixed too (never the bare sessionId) so a LIVE MAIN narrative never
 *  collides with the playback narrative keyed by the bare sessionId. */
export function narrativeScopeId(sessionId: string, paneId: string): string {
  return `${sessionId}__${safePaneId(paneId)}`;
}
