// Append one synthetic assistant-text milestone to a subagent jsonl every
// INTERVAL_MS, chained from the file's current tail UUID. Run as:
//   node scripts/fake-subagent-tick.cjs <path-to-agent-xxx.jsonl>
const fs = require('fs');
const crypto = require('crypto');

const file = process.argv[2];
if (!file) { console.error('usage: node fake-subagent-tick.cjs <jsonl>'); process.exit(1); }

const INTERVAL_MS = 20_000;

function readLastUuid() {
  const buf = fs.readFileSync(file, 'utf8');
  const lines = buf.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t) continue;
    try { return JSON.parse(t).uuid; } catch { /* skip */ }
  }
  return null;
}

function readSessionFields() {
  const buf = fs.readFileSync(file, 'utf8');
  const firstLine = buf.split(/\r?\n/).find(l => l.trim());
  if (!firstLine) return {};
  try {
    const o = JSON.parse(firstLine);
    return {
      sessionId: o.sessionId,
      cwd: o.cwd,
      agentId: o.agentId,
      promptId: o.promptId,
      version: o.version,
      gitBranch: o.gitBranch,
      slug: o.slug,
    };
  } catch { return {}; }
}

const ctx = readSessionFields();
console.log('agentId:', ctx.agentId, '| sessionId:', ctx.sessionId);

function makeAssistantText(parentUuid, n) {
  const uuid = crypto.randomUUID();
  const now = new Date().toISOString();
  // Synthetic context growth so the LIVE pane's context badge shows non-zero
  // values. Real agents see input_tokens + cache_read + cache_creation roll
  // forward each turn — we mimic that with a slow, monotonic ramp.
  const baseTurn = 800 + n * 40;
  return {
    parentUuid,
    isSidechain: true,
    agentId: ctx.agentId,
    message: {
      model: 'claude-fake',
      id: 'msg_fake_' + Date.now(),
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: `Tick #${n} @ ${now}` }],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: baseTurn,
        cache_read_input_tokens: 12_000 + n * 50,
        cache_creation_input_tokens: 100,
        output_tokens: 60 + (n % 5) * 12,
      },
    },
    type: 'assistant',
    uuid,
    timestamp: now,
    userType: 'external',
    entrypoint: 'cli',
    cwd: ctx.cwd,
    sessionId: ctx.sessionId,
    version: ctx.version,
    gitBranch: ctx.gitBranch,
    slug: ctx.slug,
  };
}

let parent = readLastUuid();
let n = 1;
console.log('start tail uuid:', parent);

function tick() {
  const ev = makeAssistantText(parent, n);
  fs.appendFileSync(file, JSON.stringify(ev) + '\n');
  console.log(new Date().toLocaleTimeString(), 'appended tick', n, '->', ev.uuid.slice(0,8));
  parent = ev.uuid;
  n++;
}

tick();
setInterval(tick, INTERVAL_MS);
