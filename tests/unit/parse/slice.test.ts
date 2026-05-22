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
    id: 's1',
    cwd: 'C:/demo',
    startedAt: '',
    root,
    successPath: new Set(ids),
    totalMilestones: ids.length,
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

  it('preserves a subagent branch (children[1]) by reference', () => {
    const subRoot = ms('sub_root', 'root_prompt', [ms('sub_t', 'tool_call')]);
    const spawn = ms('spawn', 'subagent_spawn');
    const after = ms('after', 'tool_call');
    const root = chain([ms('p1', 'root_prompt'), spawn, after]);
    spawn.children = [after, subRoot];

    const session = makeSession(root, ['p1', 'spawn', 'after', 'sub_root', 'sub_t']);

    const sliced = sliceSession(session, 'p1');
    expect(sliced).not.toBeNull();

    const slicedSpawn = sliced!.root.children[0];
    expect(slicedSpawn.id).toBe('spawn');
    expect(slicedSpawn.children).toHaveLength(2);
    expect(slicedSpawn.children[1]).toBe(subRoot);
    expect(sliced!.totalMilestones).toBe(5);
    expect(sliced!.successPath).toEqual(new Set(['p1', 'spawn', 'after', 'sub_root', 'sub_t']));
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
