import { describe, it, expect } from 'vitest';
import { buildControlRows } from '../../../src/components/live/controlRows';
import type { ControlSnapshot } from '../../../server/control-state';

const EMPTY: ControlSnapshot = { all: false, main: false, agents: {}, held: [], pendingNotes: [] };
const entries = [
  { key: 'spawn:a', summary: 'explore auth module' },
  { key: 'spawn:b', summary: 'write e2e specs' },
];
const mapping = new Map([['spawn:a', 'agent-0'], ['spawn:b', 'agent-1']]);

describe('buildControlRows', () => {
  it('emits MAIN first, then one row per mapped subagent entry', () => {
    const rows = buildControlRows(entries, mapping, EMPTY, 'fix the bug');
    expect(rows.map((r) => r.target)).toEqual(['main', 'agent-0', 'agent-1']);
    expect(rows[0]).toMatchObject({ label: 'MAIN', summary: 'fix the bug', paused: false, held: null });
  });

  it('skips entries with no file mapping (alphabetical-pairing gap)', () => {
    const rows = buildControlRows(entries, new Map([['spawn:a', 'agent-0']]), EMPTY, '');
    expect(rows.map((r) => r.target)).toEqual(['main', 'agent-0']);
  });

  it('marks paused per-flag and via all, and attaches held info by owner', () => {
    const snap: ControlSnapshot = {
      all: false, main: true,
      agents: { 'agent-1': true },
      held: [{ toolUseId: 't1', owner: 'agent-1', toolName: 'Bash', toolInputSummary: '{"command":"npm run e2e"}', heldSince: 123 }],
      pendingNotes: [],
    };
    const rows = buildControlRows(entries, mapping, snap, '');
    expect(rows.find((r) => r.target === 'main')!.paused).toBe(true);
    expect(rows.find((r) => r.target === 'agent-0')!.paused).toBe(false);
    const a1 = rows.find((r) => r.target === 'agent-1')!;
    expect(a1.paused).toBe(true);
    expect(a1.held).toMatchObject({ toolName: 'Bash', heldSince: 123 });

    const all = buildControlRows(entries, mapping, { ...EMPTY, all: true }, '');
    expect(all.every((r) => r.paused)).toBe(true);
  });
});
