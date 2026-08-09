import { describe, it, expect } from 'vitest';
import { sliceSession } from '../../../src/parse/slice';
import type { Milestone, MilestoneKind, Session } from '../../../src/parse/types';

function ms(id: string, kind: MilestoneKind, children: Milestone[] = []): Milestone {
  return {
    id,
    kind,
    label: id,
    summary: id,
    timestamp: '',
    failed: false,
    raw: null,
    children,
  };
}

function chain(nodes: Milestone[]): Milestone {
  for (let i = nodes.length - 1; i > 0; i--) nodes[i - 1].children = [nodes[i]];
  return nodes[0];
}

function makeSession(root: Milestone, ids: string[]): Session {
  return {
    provider: 'claude',
    id: 's1',
    cwd: 'C:/demo',
    startedAt: '',
    root,
    successPath: new Set(ids),
    totalMilestones: ids.length,
    subagentMtimes: {},
  };
}

describe('sliceSession', () => {
  it('returns the chain from root_prompt up to (but excluding) the next user_followup', () => {
    const nodes = [
      ms('p1', 'root_prompt'),
      ms('t1', 'tool_call'),
      ms('t2', 'tool_call'),
      ms('p2', 'user_followup'),
      ms('t3', 'tool_call'),
      ms('c1', 'completion'),
    ];
    const root = chain(nodes);
    const session = makeSession(root, ['p1', 't1', 't2', 'p2', 't3', 'c1']);

    const sliced = sliceSession(session, 'p1');
    expect(sliced).not.toBeNull();

    const head = sliced!.root;
    const collected: string[] = [];
    let cur: Milestone | undefined = head;
    while (cur) { collected.push(cur.id); cur = cur.children[0]; }
    expect(collected).toEqual(['p1', 't1', 't2']);
    expect(sliced!.totalMilestones).toBe(3);
    expect(sliced!.successPath).toEqual(new Set(['p1', 't1', 't2']));
  });

  it('slices a follow-up prompt to the end of the session', () => {
    const nodes = [
      ms('p1', 'root_prompt'),
      ms('t1', 'tool_call'),
      ms('p2', 'user_followup'),
      ms('t2', 'tool_call'),
      ms('c1', 'completion'),
    ];
    const root = chain(nodes);
    const session = makeSession(root, ['p1', 't1', 'p2', 't2', 'c1']);

    const sliced = sliceSession(session, 'p2');
    expect(sliced).not.toBeNull();

    const head = sliced!.root;
    const collected: string[] = [];
    let cur: Milestone | undefined = head;
    while (cur) { collected.push(cur.id); cur = cur.children[0]; }
    expect(collected).toEqual(['p2', 't2', 'c1']);
  });

  it('returns null for an unknown prompt id', () => {
    const root = chain([ms('p1', 'root_prompt'), ms('t1', 'tool_call')]);
    const session = makeSession(root, ['p1', 't1']);
    expect(sliceSession(session, 'nope')).toBeNull();
  });

  it('preserves a subagent inner subtree (children[0]) by reference, main next moves to children[1]', () => {
    // Matches attachSubagents' real layout: [subRoot, mainNext].
    const subRoot = ms('sub_root', 'root_prompt', [ms('sub_t', 'tool_call')]);
    const spawn = ms('spawn', 'subagent_spawn');
    const after = ms('after', 'tool_call');
    const root = chain([ms('p1', 'root_prompt'), spawn, after]);
    spawn.children = [subRoot, after];

    const session = makeSession(root, ['p1', 'spawn', 'after', 'sub_root', 'sub_t']);

    const sliced = sliceSession(session, 'p1');
    expect(sliced).not.toBeNull();

    const slicedSpawn = sliced!.root.children[0];
    expect(slicedSpawn.id).toBe('spawn');
    expect(slicedSpawn.children).toHaveLength(2);
    expect(slicedSpawn.children[0]).toBe(subRoot);
    expect(slicedSpawn.children[1].id).toBe('after');
    expect(sliced!.totalMilestones).toBe(5);
    expect(sliced!.successPath).toEqual(new Set(['p1', 'spawn', 'after', 'sub_root', 'sub_t']));
  });

  it('finds a user_followup that lives past an attached subagent_spawn (regression)', () => {
    // Reproduces the runtime "PROMPT NOT FOUND": the followup p2 sits past
    // a spawn whose children[0] is the subagent (per attachSubagents). The
    // walk must follow children[1] at the spawn, not children[0].
    const subRoot = ms('sub_root', 'root_prompt', [ms('sub_t', 'tool_call')]);
    const p1 = ms('p1', 'root_prompt');
    const spawn = ms('spawn', 'subagent_spawn');
    const t1 = ms('t1', 'tool_call');
    const p2 = ms('p2', 'user_followup');
    const t2 = ms('t2', 'tool_call');
    const c1 = ms('c1', 'completion');
    // Wire the main chain by hand because the spawn has 2-child shape.
    p1.children = [spawn];
    spawn.children = [subRoot, t1];
    t1.children = [p2];
    p2.children = [t2];
    t2.children = [c1];

    const session = makeSession(p1, ['p1', 'spawn', 't1', 'p2', 't2', 'c1', 'sub_root', 'sub_t']);

    const sliced = sliceSession(session, 'p2');
    expect(sliced).not.toBeNull();

    const collected: string[] = [];
    let cur: Milestone | undefined = sliced!.root;
    while (cur) {
      collected.push(cur.id);
      cur = cur.kind === 'subagent_spawn' ? cur.children[1] : cur.children[0];
    }
    expect(collected).toEqual(['p2', 't2', 'c1']);
  });

  it('intersects successPath: ids not in the slice are dropped', () => {
    const nodes = [
      ms('p1', 'root_prompt'),
      ms('t1', 'tool_call'),
      ms('p2', 'user_followup'),
      ms('t2', 'tool_call'),
    ];
    const root = chain(nodes);
    const session = makeSession(root, ['p1', 't1', 'p2', 't2']);

    const sliced = sliceSession(session, 'p1');
    expect(sliced!.successPath).toEqual(new Set(['p1', 't1']));
  });
});
