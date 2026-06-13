#!/usr/bin/env node
// ThoughtGraph gate — global PreToolUse hook.
// Silence + exit 0 = allow. One JSON line on stdout = decision for Claude Code.
// EVERY failure path allows the tool call: ThoughtGraph being closed, crashed,
// or on another port must never block a session (fail-open by design).

// Claude Code's per-hook timeout is configured to 14400s by the installer.
// Self-cap 300s under it: if we're still paused near the deadline, deny with a
// retry instruction so the model's retried tool call re-enters this gate.
import http from 'node:http';

const DEADLINE_MS = 14_100_000;
const REQUEST_TIMEOUT_MS = 70_000; // server holds ≤55s per poll; leave headroom
const RENEW_REASON =
  'Paused by the user in ThoughtGraph. Re-issue this exact tool call to continue waiting for resume.';

function argPort() {
  const i = process.argv.indexOf('--port');
  if (i !== -1 && process.argv[i + 1]) {
    const p = Number(process.argv[i + 1]);
    if (Number.isInteger(p) && p > 0 && p < 65536) return p;
  }
  return 5173;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    const bail = setTimeout(() => resolve(data), 5_000); // hook input arrives immediately or not at all
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => { clearTimeout(bail); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(bail); resolve(data); });
  });
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }) + '\n');
}

/** POST body to url, resolve with parsed JSON or null on any error. */
function httpPost(url, body, timeoutMs) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: Number(parsed.port),
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) { resolve(null); return; }
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

async function main() {
  const raw = await readStdin();
  let input;
  try { input = JSON.parse(raw); } catch { return; }
  if (!input || typeof input.session_id !== 'string') return;

  const url = `http://127.0.0.1:${argPort()}/api/control/gate`;
  const body = JSON.stringify({
    session_id: input.session_id,
    tool_use_id: input.tool_use_id ?? '',
    tool_name: input.tool_name ?? '',
    tool_input: input.tool_input ?? {},
  });
  const started = Date.now();

  while (Date.now() - started < DEADLINE_MS) {
    const out = await httpPost(url, body, REQUEST_TIMEOUT_MS);
    if (out === null) return;           // server gone / refused / timed out → allow
    if (out.action === 'deny' && typeof out.reason === 'string') { deny(out.reason); return; }
    if (out.action !== 'poll') return;  // 'allow' or anything unexpected → allow
  }
  deny(RENEW_REASON);                   // hook-timeout renewal: costs one model turn per 4h paused
}

main().then(() => process.exit(0), () => process.exit(0));
