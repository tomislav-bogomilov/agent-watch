import path from 'node:path';
import type { Plugin, Connect } from 'vite';
import { claudeHome, sendJson, readBody, isSafeScopeKey, isSafeId } from './plugin-shared';
import { createControlStore, HOLD_MS, type ControlStore, type ControlTarget, type Owner } from './control-state';
import { findToolUseOwner } from './correlate-tool-use';
import { defaultSettingsPath, installGateHook, isGateHookInstalled } from './hook-installer';

const CORRELATE_RETRIES = 3;
const CORRELATE_RETRY_MS = 300;
const NOTE_MAX_CHARS = 2_000;
const SUMMARY_MAX_CHARS = 200;

function isValidTarget(t: unknown): t is ControlTarget {
  return t === 'all' || t === 'main' || (typeof t === 'string' && isSafeId(t));
}

export function createControlMiddleware(deps: {
  store: ControlStore;
  root: string;
  settingsPath: string;
  scriptPath: string;
  defaultPort: number;
}): Connect.NextHandleFunction {
  const { store, root, settingsPath, scriptPath, defaultPort } = deps;

  // tool_use_id → owner with a short retry: the transcript line may not be
  // flushed yet when the hook fires (spec: "write-lag race").
  async function correlate(projectId: string, sessionId: string, toolUseId: string): Promise<Owner | 'unknown'> {
    for (let i = 0; i < CORRELATE_RETRIES; i += 1) {
      const owner = await findToolUseOwner(root, projectId, sessionId, toolUseId);
      if (owner) return owner;
      if (i < CORRELATE_RETRIES - 1) await new Promise((r) => setTimeout(r, CORRELATE_RETRY_MS));
    }
    return 'unknown';
  }

  return async (req, res, next) => {
    try {
      const url = (req.url ?? '/').split('?')[0];
      const method = req.method ?? 'GET';

      if (method === 'POST' && url === '/gate') {
        let b: { session_id?: string; tool_use_id?: string; tool_name?: string; tool_input?: unknown; holdMs?: number };
        try { b = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'invalid JSON' }); return; }
        if (typeof b.session_id !== 'string' || !isSafeScopeKey(b.session_id)) { sendJson(res, 400, { error: 'invalid session_id' }); return; }
        // Hot path: nothing paused/pending for this session → allow with zero file I/O.
        if (!store.isEngaged(b.session_id)) { sendJson(res, 200, { action: 'allow' }); return; }
        const projectId = store.projectIdOf(b.session_id);
        if (!projectId) { sendJson(res, 200, { action: 'allow' }); return; }
        const owner = await correlate(projectId, b.session_id, typeof b.tool_use_id === 'string' ? b.tool_use_id : '');
        const holdMs = typeof b.holdMs === 'number' ? Math.min(Math.max(b.holdMs, 0), HOLD_MS) : HOLD_MS;
        const decision = await store.gate(b.session_id, owner, {
          toolUseId: typeof b.tool_use_id === 'string' ? b.tool_use_id : '',
          toolName: typeof b.tool_name === 'string' ? b.tool_name : '',
          toolInputSummary: JSON.stringify(b.tool_input ?? {}).slice(0, SUMMARY_MAX_CHARS),
        }, holdMs);
        sendJson(res, 200, decision);
        return;
      }

      if (method === 'POST' && (url === '/pause' || url === '/resume')) {
        let b: { projectId?: string; sessionId?: string; target?: unknown; note?: unknown };
        try { b = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { error: 'invalid JSON' }); return; }
        if (typeof b.projectId !== 'string' || !isSafeScopeKey(b.projectId)
          || typeof b.sessionId !== 'string' || !isSafeScopeKey(b.sessionId)
          || !isValidTarget(b.target)) {
          sendJson(res, 400, { error: 'invalid pause/resume request' });
          return;
        }
        if (url === '/pause') {
          store.pause(b.sessionId, b.projectId, b.target);
        } else {
          const note = typeof b.note === 'string' && b.note.trim()
            ? b.note.trim().slice(0, NOTE_MAX_CHARS)
            : undefined;
          store.resume(b.sessionId, b.projectId, b.target, note);
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (method === 'GET' && url === '/state') {
        const q = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
        const projectId = q.get('projectId') ?? '';
        const sessionId = q.get('sessionId') ?? '';
        if (!isSafeScopeKey(projectId) || !isSafeScopeKey(sessionId)) { sendJson(res, 400, { error: 'invalid ids' }); return; }
        sendJson(res, 200, {
          installed: await isGateHookInstalled(settingsPath),
          control: store.snapshot(sessionId),
        });
        return;
      }

      if (method === 'POST' && url === '/install-hook') {
        try {
          sendJson(res, 200, await installGateHook({ settingsPath, scriptPath, port: defaultPort }));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'EBADSETTINGS') { sendJson(res, 409, { error: (e as Error).message }); return; }
          throw e;
        }
        return;
      }

      sendJson(res, 405, { error: 'method not allowed' });
    } catch (err) {
      next(err as Error);
    }
  };
}

export function controlPlugin(): Plugin {
  return {
    name: 'thoughtgraph:control',
    configureServer(server) {
      const middleware = createControlMiddleware({
        store: createControlStore(),
        root: claudeHome(),
        settingsPath: defaultSettingsPath(),
        scriptPath: path.resolve(server.config.root, 'hooks', 'thoughtgraph-gate.mjs'),
        defaultPort: server.config.server.port ?? 5173,
      });
      server.middlewares.use('/api/control', middleware);
    },
  };
}
