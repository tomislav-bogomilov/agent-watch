import { describe, it, expect } from 'vitest';
import { computeSuccessPath, isTainted } from '../../../src/parse/failure';
import type { Milestone } from '../../../src/parse/types';

function ms(id: string, failed = false, children: Milestone[] = []): Milestone {
  return {
    id, kind: 'tool_call', label: id, summary: id,
    timestamp: '', failed, raw: null, children,
  };
}

describe('isTainted', () => {
  it('returns true when the milestone itself failed', () => {
    expect(isTainted(ms('a', true))).toBe(true);
  });

  it('returns true when any descendant failed', () => {
    const root = ms('a', false, [ms('b', false, [ms('c', true)])]);
    expect(isTainted(root)).toBe(true);
  });

  it('returns false when nothing failed', () => {
    const root = ms('a', false, [ms('b', false, [ms('c', false)])]);
    expect(isTainted(root)).toBe(false);
  });
});

describe('computeSuccessPath', () => {
  it('returns all ids on a clean linear chain', () => {
    const root = ms('a', false, [ms('b', false, [ms('c', false)])]);
    const sp = computeSuccessPath(root);
    expect(sp).toEqual(new Set(['a', 'b', 'c']));
  });

  it('excludes tainted subagent branches (first child of a two-child node)', () => {
    // a -> [subagent_branch_with_failure, main_continues]
    const sub = ms('sub', false, [ms('sub_fail', true)]);
    const main = ms('main', false);
    const root = ms('a', false, [sub, main]);
    const sp = computeSuccessPath(root);
    expect(sp).toEqual(new Set(['a', 'main']));
  });

  it('returns empty set when root failed', () => {
    const root = ms('a', true);
    const sp = computeSuccessPath(root);
    expect(sp).toEqual(new Set());
  });
});
