import { describe, it, expect } from 'vitest';
import { formatPath } from '../../../src/util/formatPath';

describe('formatPath', () => {
  it('replaces Windows dotted username with ~\\', () => {
    expect(formatPath('C:\\Users\\alex.smith\\work\\AI\\ThoughtGraph'))
      .toBe('~\\work\\AI\\ThoughtGraph');
    expect(formatPath('C:/Users/alex.smith/work/AI/ThoughtGraph'))
      .toBe('~/work/AI/ThoughtGraph');
  });

  it('replaces Windows split-dot username (two dot-free segments) with ~\\ or ~/', () => {
    // The parser/storage layer sometimes surfaces a dotted username as two
    // path segments. We treat the first two segments after C:\Users\ as a
    // single username when neither contains a dot.
    expect(formatPath('C:/Users/alex/alexov/work/AI/ThoughtGraph'))
      .toBe('~/work/AI/ThoughtGraph');
    expect(formatPath('C:\\Users\\alex\\alexov\\work\\AI\\ThoughtGraph'))
      .toBe('~\\work\\AI\\ThoughtGraph');
  });

  it('replaces Windows single-segment username when no dot is present', () => {
    expect(formatPath('C:/Users/alice/projects/x')).toBe('~/projects/x');
    expect(formatPath('D:\\Users\\bob\\code')).toBe('~\\code');
  });

  it('does NOT consume two segments when the first segment IS a single-word username', () => {
    // Edge case: a single-segment user "alice" has only one path segment after
    // /Users/. We must not eat into "projects" thinking it's the second half
    // of the username. The single-segment branch wins here.
    expect(formatPath('C:/Users/alice/projects/x')).toBe('~/projects/x');
  });

  it('replaces macOS home with ~/', () => {
    expect(formatPath('/Users/jane/code/projects/site')).toBe('~/code/projects/site');
  });

  it('replaces Linux home with ~/', () => {
    expect(formatPath('/home/tom/dev/foobar')).toBe('~/dev/foobar');
  });

  it('leaves unrecognised paths unchanged', () => {
    expect(formatPath('/etc/nginx/sites-available')).toBe('/etc/nginx/sites-available');
    expect(formatPath('relative/path')).toBe('relative/path');
    expect(formatPath('')).toBe('');
  });

  it('only matches at the start of the string', () => {
    expect(formatPath('/var/log/Users/alex/anywhere'))
      .toBe('/var/log/Users/alex/anywhere');
  });
});
