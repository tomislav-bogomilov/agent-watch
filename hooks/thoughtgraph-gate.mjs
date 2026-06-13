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

// The dev server binds to whichever loopback family Vite chose. On Windows +
// Node it's usually IPv6 (::1) ONLY; on other setups it's IPv4 (127.0.0.1).
// The browser uses `localhost` and resolves correctly, but a hook hardcoded to
// one family gets ECONNREFUSED on a mismatch and fails open — the agent never
// pauses. So try both loopback families and remember the one that answers.
const LOOPBACK_HOSTS = ['127.0.0.1', '[::1]'];
// Connect-phase errors mean "wrong family / not here" → try the other host.
// Anything after a successful connect (bad status, slow hold) → fail open.
const CONNECT_ERROR_CODES = new Set(['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL', 'ENOTFOUND', 'EADDRINUSE']);
let chosenUrl = null; // memoize the first loopback URL that answers

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

// Allow the tool call to PROCEED while injecting the user's steer note as
// model-visible guidance. The agent continues its work and reads the note.
function allowWithContext(context) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      additionalContext: context,
    },
  }) + '\n');
}

/**
 * POST body to url. Resolves with a discriminated result:
 *   { ok: true, json }          — HTTP 200 + parsed JSON
 *   { ok: false, retriable }    — failed; retriable=true means a connect-phase
 *                                 error (wrong loopback family → try the other host)
 */
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
        if (res.statusCode !== 200) { resolve({ ok: false, retriable: false }); return; }
        try { resolve({ ok: true, json: JSON.parse(data) }); }
        catch { resolve({ ok: false, retriable: false }); }
      });
      res.on('error', () => resolve({ ok: false, retriable: false }));
    });
    // Connect-phase failure (e.g. ECONNREFUSED on the wrong family) → retriable.
    req.on('error', (e) => resolve({ ok: false, retriable: CONNECT_ERROR_CODES.has(e && e.code) }));
    // A timeout fires only after we connected (loopback connect is instant) →
    // the server is there but holding too long; fail open, don't switch hosts.
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, retriable: false }); });
    req.write(body);
    req.end();
  });
}

/** Try the gate across loopback families, sticking to the first that answers. */
async function gate(port, body, timeoutMs) {
  const all = LOOPBACK_HOSTS.map((h) => `http://${h}:${port}/api/control/gate`);
  const urls = chosenUrl ? [chosenUrl, ...all.filter((u) => u !== chosenUrl)] : all;
  for (const url of urls) {
    const r = await httpPost(url, body, timeoutMs);
    if (r.ok) { chosenUrl = url; return r.json; }
    if (!r.retriable) return null;   // reachable but unhappy, or post-connect timeout → fail open
    // retriable (couldn't connect on this family) → try the next host
  }
  return null;                        // no loopback family answered → fail open
}

async function main() {
  const raw = await readStdin();
  let input;
  try { input = JSON.parse(raw); } catch { return; }
  if (!input || typeof input.session_id !== 'string') return;

  const port = argPort();
  const body = JSON.stringify({
    session_id: input.session_id,
    tool_use_id: input.tool_use_id ?? '',
    tool_name: input.tool_name ?? '',
    tool_input: input.tool_input ?? {},
  });
  const started = Date.now();

  while (Date.now() - started < DEADLINE_MS) {
    const out = await gate(port, body, REQUEST_TIMEOUT_MS);
    if (out === null) return;           // server gone / refused / timed out → allow
    if (out.action === 'allow') {       // resume → continue; context = steer guidance, if any
      if (typeof out.context === 'string' && out.context) allowWithContext(out.context);
      return;
    }
    if (out.action === 'deny' && typeof out.reason === 'string') { deny(out.reason); return; }
    if (out.action !== 'poll') return;  // anything unexpected → allow (silent)
  }
  deny(RENEW_REASON);                   // hook-timeout renewal: costs one model turn per 4h paused
}

main().then(() => process.exit(0), () => process.exit(0));
