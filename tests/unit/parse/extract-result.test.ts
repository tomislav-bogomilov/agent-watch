import { describe, it, expect } from 'vitest';
import { extractResult } from '../../../src/parse/extract-result';

describe('extractResult', () => {
  it('Read: lines + bytes when content is text', () => {
    const result = extractResult({
      toolName: 'Read',
      isError: false,
      content: 'line one\nline two\nline three\n',
    });
    expect(result).toBe('3 lines, 28 bytes — starts: line one');
  });

  it('Bash: exit code + last non-empty stdout line', () => {
    const result = extractResult({
      toolName: 'Bash',
      isError: false,
      content: '<stdout>\n12 passed\n0 failed\n</stdout>\n<exit_code>0</exit_code>',
    });
    expect(result).toBe('exit 0 — 0 failed');
  });

  it('Bash: marks failure when exit code is non-zero', () => {
    const result = extractResult({
      toolName: 'Bash',
      isError: false,
      content: '<stdout></stdout>\n<stderr>oops</stderr>\n<exit_code>1</exit_code>',
    });
    expect(result).toBe('exit 1 — oops');
  });

  it('Edit: replacement count from result', () => {
    const result = extractResult({
      toolName: 'Edit',
      isError: false,
      content: 'Made 3 replacements in src/foo.ts',
    });
    expect(result).toBe('3 replacements');
  });

  it('Write: byte count', () => {
    const result = extractResult({
      toolName: 'Write',
      isError: false,
      content: 'Wrote 1024 bytes to src/bar.ts',
    });
    expect(result).toBe('Wrote 1024 bytes');
  });

  it('Grep: match and file counts', () => {
    const result = extractResult({
      toolName: 'Grep',
      isError: false,
      content: 'Found 5 matches in 3 files',
    });
    expect(result).toBe('5 matches in 3 files');
  });

  it('errors get the ⚠ prefix using the error message', () => {
    const result = extractResult({
      toolName: 'Read',
      isError: true,
      content: 'File does not exist: /tmp/missing',
    });
    expect(result).toBe('⚠ error: File does not exist: /tmp/missing');
  });

  it('unknown tool falls back to truncated content', () => {
    const result = extractResult({
      toolName: 'WeirdTool',
      isError: false,
      content: 'hello world from somewhere',
    });
    expect(result).toBe('hello world from somewhere');
  });
});
