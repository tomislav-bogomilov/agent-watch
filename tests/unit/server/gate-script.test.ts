import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '../../../hooks/thoughtgraph-gate.mjs');
const INPUT = { session_id: 's1', tool_use_id: 'toolu_1', tool_name: 'Bash', tool_input: { command: 'ls' } };

function runGate(port: number, input: unknown): Promise<{ stdout: string; code: number | null; ms: number }> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [SCRIPT, '--port', String(port)], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, code, ms: Date.now() - t0 }));
    child.stdin.write(typeof input === 'string' ? input : JSON.stringify(input));
    child.stdin.end();
  });
}

/** Serve each canned response once, in order (last one repeats), bound to `host`. */
function serveOn(host: string, responses: unknown[]): Promise<{ port: number; close: () => void; requests: () => number }> {
  let i = 0;
  const server = http.createServer((_req, res) => {
    const body = JSON.stringify(responses[Math.min(i, responses.length - 1)]);
    i += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, host, () => {
      const { port } = server.address() as { port: number };
      resolve({ port, close: () => server.close(), requests: () => i });
    });
  });
}

/** Serve on IPv4 loopback (the common case). */
function serve(responses: unknown[]): Promise<{ port: number; close: () => void; requests: () => number }> {
  return serveOn('127.0.0.1', responses);
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

describe('thoughtgraph-gate.mjs', () => {
  it('exits 0 with no output, quickly, when no server is listening (fail-open)', async () => {
    const port = await freePort();
    const r = await runGate(port, INPUT);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(r.ms).toBeLessThan(5_000);
  });

  it('exits 0 silently on allow', async () => {
    const srv = await serve([{ action: 'allow' }]);
    const r = await runGate(srv.port, INPUT);
    srv.close();
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('prints a PreToolUse deny decision on deny', async () => {
    const srv = await serve([{ action: 'deny', reason: 'steer note here' }]);
    const r = await runGate(srv.port, INPUT);
    srv.close();
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.permissionDecisionReason).toBe('steer note here');
  });

  it('loops on poll responses until a terminal answer arrives', async () => {
    const srv = await serve([{ action: 'poll' }, { action: 'poll' }, { action: 'allow' }]);
    const r = await runGate(srv.port, INPUT);
    srv.close();
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(srv.requests()).toBe(3);
  });

  it('exits 0 silently on garbage stdin', async () => {
    const srv = await serve([{ action: 'allow' }]);
    const r = await runGate(srv.port, '{ not json');
    srv.close();
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  // Regression: on Windows + Node, Vite binds the dev server to IPv6 loopback
  // (::1) only, but the hook hardcoded http://127.0.0.1 (IPv4). The IPv4 connect
  // was refused → fail-open → the agent never paused. The hook must fall back
  // across loopback families. (Requires IPv6 loopback, present on all dev hosts.)
  it('reaches a server listening only on IPv6 ::1 (loopback family fallback)', async () => {
    const srv = await serveOn('::1', [{ action: 'deny', reason: 'ipv6 reached' }]);
    const r = await runGate(srv.port, INPUT);
    srv.close();
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.permissionDecisionReason).toBe('ipv6 reached');
  });
});
