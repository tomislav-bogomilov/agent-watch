import { describe, expect, it } from 'vitest';

describe('test environment', () => {
  it('provides jsdom localStorage rather than Node incomplete web storage', () => {
    expect(typeof localStorage.getItem).toBe('function');
    expect(typeof localStorage.setItem).toBe('function');
    expect(typeof localStorage.clear).toBe('function');
  });
});
