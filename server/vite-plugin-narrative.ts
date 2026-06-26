import type { Plugin, Connect } from 'vite';
import { sendJson, readBody, isSafeScopeKey, narratorCwd } from './plugin-shared';
import { createNarrativeStore } from './narrative-state';
import { runNarrator, toNarratorInput } from './narrator';
import type { NarratorInputMilestone } from './narrator';

export function narrativePlugin(): Plugin {
  const store = createNarrativeStore({ run: runNarrator, now: () => Date.now() });

  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const parts = url.pathname.replace(/^\/api\/narrative\/?/, '').split('/').filter(Boolean);
    // parts: [projectId, sessionId] | [projectId, sessionId, action]
    const [projectId, sessionId, action] = parts;
    if (!projectId || !sessionId || !isSafeScopeKey(projectId) || !isSafeScopeKey(sessionId)) {
      return next();
    }
    const key = `${projectId}/${sessionId}`;
    const cwd = narratorCwd();

    try {
      if (req.method === 'GET' && !action) {
        return sendJson(res, 200, store.get(key));
      }
      if (req.method === 'POST' && (action === 'start' || action === 'tick' || action === 'refresh')) {
        const body = JSON.parse((await readBody(req)) || '{}') as { milestones?: NarratorInputMilestone[] };
        const milestones = toNarratorInput(body.milestones ?? []);
        if (action === 'start') store.start(key, { milestones, cwd });
        else if (action === 'tick') store.tick(key, { milestones, cwd });
        else store.refresh(key, { milestones, cwd });
        return sendJson(res, 200, store.get(key));
      }
      return next();
    } catch (e) {
      return sendJson(res, 400, { error: e instanceof Error ? e.message : 'bad request' });
    }
  };

  return {
    name: 'thoughtgraph:narrative',
    configureServer(server) {
      server.middlewares.use('/api/narrative', handler);
    },
  };
}
