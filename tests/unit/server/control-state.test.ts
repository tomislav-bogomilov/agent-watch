import { describe, it, expect } from 'vitest';
import { createControlStore, STEER_PREFIX } from '../../../server/control-state';

const INFO = { toolUseId: 'toolu_1', toolName: 'Bash', toolInputSummary: '{"command":"ls"}' };

describe('control store — gate decisions', () => {
  it('allows immediately when the session has no control state', async () => {
    const store = createControlStore();
    await expect(store.gate('s1', 'main', INFO)).resolves.toEqual({ action: 'allow' });
  });

  it('allows an agent whose flag is not set even when another agent is paused', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'agent-0');
    await expect(store.gate('s1', 'agent-1', INFO)).resolves.toEqual({ action: 'allow' });
    await expect(store.gate('s1', 'main', INFO)).resolves.toEqual({ action: 'allow' });
  });

  it('holds a paused target, then answers poll after holdMs', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'main');
    const t0 = Date.now();
    const d = await store.gate('s1', 'main', INFO, 50);
    expect(d).toEqual({ action: 'poll' });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(45);
  });

  it('resume without note releases the held request with allow', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'main');
    const pending = store.gate('s1', 'main', INFO, 5000);
    await new Promise((r) => setTimeout(r, 10));
    store.resume('s1', 'proj', 'main');
    await expect(pending).resolves.toEqual({ action: 'allow' });
  });

  it('resume with note releases the held request with allow + the note as context', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'agent-0');
    const pending = store.gate('s1', 'agent-0', { ...INFO, toolUseId: 'toolu_2' }, 5000);
    await new Promise((r) => setTimeout(r, 10));
    store.resume('s1', 'proj', 'agent-0', 'use the fixtures dir');
    const d = await pending;
    // allow → the agent CONTINUES; the note rides along as guidance, not a block.
    expect(d.action).toBe('allow');
    if (d.action === 'allow') expect(d.context).toContain('use the fixtures dir');
    if (d.action === 'allow') expect(d.context).toContain(STEER_PREFIX.trim().slice(0, 10));
  });

  it('pause-all holds even an unknown owner; targeted pause does not', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'main');
    await expect(store.gate('s1', 'unknown', INFO)).resolves.toEqual({ action: 'allow' });
    store.pause('s1', 'proj', 'all');
    const d = await store.gate('s1', 'unknown', INFO, 50);
    expect(d).toEqual({ action: 'poll' });
  });

  it('a pending note (resume while nothing held) is delivered on the next gate call, once', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'main');
    store.resume('s1', 'proj', 'main', 'check the README first'); // nothing held yet
    const d1 = await store.gate('s1', 'main', INFO);
    expect(d1.action).toBe('allow');
    if (d1.action === 'allow') expect(d1.context).toContain('check the README first');
    // note consumed once → next gate is a plain allow (no context)
    await expect(store.gate('s1', 'main', INFO)).resolves.toEqual({ action: 'allow' });
  });

  it('a re-pause takes precedence over a leftover pending note (note must not bypass the pause)', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'all');
    store.resume('s1', 'proj', 'all', 'leftover guidance'); // nothing held → note lingers as pending
    store.pause('s1', 'proj', 'all');                       // user pauses again
    // The stale note must NOT short-circuit to allow — the gate must HOLD.
    await expect(store.gate('s1', 'main', INFO, 50)).resolves.toEqual({ action: 'poll' });
  });

  it('resume-all clears main, agents, and the all flag', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'all');
    store.pause('s1', 'proj', 'agent-0');
    store.resume('s1', 'proj', 'all');
    await expect(store.gate('s1', 'main', INFO)).resolves.toEqual({ action: 'allow' });
    await expect(store.gate('s1', 'agent-0', INFO)).resolves.toEqual({ action: 'allow' });
  });
});

describe('control store — engagement + snapshot', () => {
  it('isEngaged is false for unseen sessions and true once anything is set', () => {
    const store = createControlStore();
    expect(store.isEngaged('s1')).toBe(false);
    store.pause('s1', 'proj', 'agent-0');
    expect(store.isEngaged('s1')).toBe(true);
    store.resume('s1', 'proj', 'agent-0');
    expect(store.isEngaged('s1')).toBe(false);
  });

  it('remembers projectId from pause calls', () => {
    const store = createControlStore();
    expect(store.projectIdOf('s1')).toBeNull();
    store.pause('s1', 'C--proj', 'main');
    expect(store.projectIdOf('s1')).toBe('C--proj');
  });

  it('snapshot exposes flags and held requests without resolvers', async () => {
    const store = createControlStore();
    store.pause('s1', 'proj', 'agent-0');
    const pending = store.gate('s1', 'agent-0', INFO, 5000);
    await new Promise((r) => setTimeout(r, 10));
    const snap = store.snapshot('s1');
    expect(snap.agents).toEqual({ 'agent-0': true });
    expect(snap.held).toHaveLength(1);
    expect(snap.held[0]).toMatchObject({ toolUseId: 'toolu_1', owner: 'agent-0', toolName: 'Bash' });
    expect(typeof snap.held[0].heldSince).toBe('number');
    store.resume('s1', 'proj', 'agent-0');
    await pending;
    expect(store.snapshot('s1').held).toHaveLength(0);
  });
});
