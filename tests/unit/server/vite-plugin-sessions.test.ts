import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSessionPayload } from '../../../server/vite-plugin-sessions';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The intended sandbox: only sessions under this root may be read.
const ROOT = path.resolve(__dirname, 'fixtures', 'traversal-root', 'projects');

describe('readSessionPayload — path containment (CWE-22)', () => {
  it('reads a session that lives inside the root', async () => {
    const payload = await readSessionPayload(ROOT, 'C--proj', 'sess');
    expect(payload.jsonl).toContain('hello from inside the sandbox');
  });

  it('refuses a projectId that escapes the root via ".."', async () => {
    // ../secret resolves to traversal-root/secret.jsonl, one level OUTSIDE the
    // projects root. Assert the containment guard fired (not an incidental
    // ENOENT) so the test still means something if the fixture file moves.
    await expect(readSessionPayload(ROOT, '..', 'secret')).rejects.toThrow(/escapes root/);
  });

  it('refuses a sessionId whose subagent dir escapes the root', async () => {
    // sessionId '../..' keeps `<sessionId>.jsonl` inside root (it normalizes to
    // root/...jsonl) but makes the subagent dir resolve to root's PARENT —
    // outside the sandbox. The guard must cover the subagent dir too, not just
    // the main jsonl path.
    await expect(readSessionPayload(ROOT, 'C--proj', '../..')).rejects.toThrow(/escapes root/);
  });
});
