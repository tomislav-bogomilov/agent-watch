import { describe, it, expect } from 'vitest';
import { colorFor } from '../../../src/tokens/palette';

describe('colorFor', () => {
  const keys = ['opus', 'sonnet', 'haiku'];

  it('returns the same color for the same key', () => {
    expect(colorFor('opus', keys)).toBe(colorFor('opus', keys));
  });

  it('returns different colors for different keys', () => {
    expect(colorFor('opus', keys)).not.toBe(colorFor('sonnet', keys));
  });

  it('subagent variant uses a different color than its main', () => {
    // |sub suffix is a recognized convention from modelKey()
    const c = colorFor('opus', [...keys, 'opus|sub']);
    const s = colorFor('opus|sub', [...keys, 'opus|sub']);
    expect(c).not.toBe(s);
  });

  it('returns a fallback color for keys not in the input list', () => {
    expect(colorFor('unknown', keys)).toMatch(/^#|^rgb/);
  });
});
