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

  it('does NOT consume two segments when the second segment matches a common folder name', () => {
    // Edge case: the split-dot pattern should not match when the second segment
    // is a common folder name like "projects". Both segments are guarded by the
    // blacklist, so split-dot rejects; falls through to single-segment branch.
    expect(formatPath('C:/Users/alice/projects/x')).toBe('~/projects/x');
  });

  it('treats a username matching a blacklisted folder word as single-segment', () => {
    // Edge case: a real user named "work" (or "code", "src", etc.) must not
    // have their FIRST subdirectory consumed as the second half of a fake
    // split username. Falls through to the single-segment branch.
    expect(formatPath('C:/Users/work/myproject/file')).toBe('~/myproject/file');
    expect(formatPath('C:/Users/code/realrepo/file')).toBe('~/realrepo/file');
    expect(formatPath('C:\\Users\\src\\lib\\index')).toBe('~\\lib\\index');
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
