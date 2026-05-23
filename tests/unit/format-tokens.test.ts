import { describe, it, expect } from 'vitest';
import { formatTokens } from '../../src/util/formatTokens';

describe('formatTokens', () => {
  it('renders under-1000 as integer', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(6)).toBe('6');
    expect(formatTokens(947)).toBe('947');
    expect(formatTokens(999)).toBe('999');
  });

  it('renders 1000-9999 with one decimal kilo', () => {
    expect(formatTokens(1000)).toBe('1.0k');
    expect(formatTokens(1234)).toBe('1.2k');
    expect(formatTokens(9499)).toBe('9.5k');
    expect(formatTokens(9999)).toBe('10k');
  });

  it('renders 10000-999999 as integer kilo', () => {
    expect(formatTokens(10000)).toBe('10k');
    expect(formatTokens(47041)).toBe('47k');
    expect(formatTokens(180555)).toBe('181k');
    expect(formatTokens(999499)).toBe('999k');
  });

  it('renders >= 1_000_000 with one decimal mega', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M');
    expect(formatTokens(1_234_567)).toBe('1.2M');
  });
});
