import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createControlMiddleware } from '../../../server/vite-plugin-control';
import { createControlStore } from '../../../server/control-state';

let base: string;
let server: http.Server;
let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-control-mw-'));
  const projectDir = path.join(dir, 'projects', 'C--proj');
  await fs.mkdir(projectDir, { recursive: true });
  const line = JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_m1', name: 'Bash', input: { command: 'ls' } }] },
  });
  await fs.writeFile(path.join(projectDir, 'sess-1.jsonl'), line + '\n', 'utf8');

  const middleware = createControlMiddleware({
    store: createControlStore(),
    root: path.join(dir, 'projects'),
    settingsPath: path.join(dir, 'settings.json'),
    scriptPath: path.join(dir, 'thoughtgraph-gate.mjs'),
    defaultPort: 5173,
  });
  server = http.createServer((req, res) =>
    middleware(req as never, res as never, () => { res.statusCode = 404; res.end(); }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  server.close();
  await fs.rm(dir, { recursive: true, force: true });
});

const post = (p: string, body: unknown) =>
  fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('/api/control middleware', () => {
  it('gate allows immediately for a session with no pause state', async () => {
    const res = await post('/gate', { session_id: 'sess-1', tool_use_id: 'toolu_m1', tool_name: 'Bash', tool_input: {} });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ action: 'allow' });
  });

  it('pause main → gate holds the main tool call, then polls; resume with note → allow carrying the note as context', async () => {
    await post('/pause', { projectId: 'C--proj', sessionId: 'sess-1', target: 'main' });
    const d1 = await (await post('/gate', { session_id: 'sess-1', tool_use_id: 'toolu_m1', tool_name: 'Bash', tool_input: {}, holdMs: 100 })).json();
    expect(d1).toEqual({ action: 'poll' });
    await post('/resume', { projectId: 'C--proj', sessionId: 'sess-1', target: 'main', note: 'look at tests first' });
    const d2 = await (await post('/gate', { session_id: 'sess-1', tool_use_id: 'toolu_m1', tool_name: 'Bash', tool_input: {} })).json();
    expect(d2.action).toBe('allow');
    expect(d2.context).toContain('look at tests first');
    const d3 = await (await post('/gate', { session_id: 'sess-1', tool_use_id: 'toolu_m1', tool_name: 'Bash', tool_input: {} })).json();
    expect(d3).toEqual({ action: 'allow' });
  });

  it('targeted pause lets an uncorrelatable tool_use through; pause-all holds it', async () => {
    await post('/pause', { projectId: 'C--proj', sessionId: 'sess-1', target: 'agent-0' });
    const d1 = await (await post('/gate', { session_id: 'sess-1', tool_use_id: 'toolu_unknown', tool_name: 'Bash', tool_input: {}, holdMs: 100 })).json();
    expect(d1).toEqual({ action: 'allow' });
    await post('/pause', { projectId: 'C--proj', sessionId: 'sess-1', target: 'all' });
    const d2 = await (await post('/gate', { session_id: 'sess-1', tool_use_id: 'toolu_unknown', tool_name: 'Bash', tool_input: {}, holdMs: 100 })).json();
    expect(d2).toEqual({ action: 'poll' });
    await post('/resume', { projectId: 'C--proj', sessionId: 'sess-1', target: 'all' });
  });

  it('state reports flags, held entries, and installed=false before install', async () => {
    await post('/pause', { projectId: 'C--proj', sessionId: 'sess-1', target: 'main' });
    const res = await fetch(`${base}/state?projectId=C--proj&sessionId=sess-1`);
    const body = await res.json();
    expect(body.installed).toBe(false);
    expect(body.control.main).toBe(true);
    expect(Array.isArray(body.control.held)).toBe(true);
    await post('/resume', { projectId: 'C--proj', sessionId: 'sess-1', target: 'all' });
  });

  it('install-hook writes settings and state flips installed', async () => {
    const res = await post('/install-hook', {});
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('installed');
    const state = await (await fetch(`${base}/state?projectId=C--proj&sessionId=sess-1`)).json();
    expect(state.installed).toBe(true);
  });

  it('rejects bad ids and bad bodies', async () => {
    expect((await post('/pause', { projectId: '..', sessionId: 'sess-1', target: 'main' })).status).toBe(400);
    expect((await post('/pause', { projectId: 'C--proj', sessionId: 'sess-1', target: 'not/safe' })).status).toBe(400);
    expect((await post('/gate', 'not json' as never)).status).toBe(400);
    expect((await fetch(`${base}/state`)).status).toBe(400);
  });
});
