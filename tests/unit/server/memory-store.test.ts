// tests/unit/server/memory-store.test.ts
import { describe, it, expect } from 'vitest';
import { parseMemoryFile, serializeMemory } from '../../../server/memory-store';

const SAMPLE = `---
name: feedback-visual-prototyping
description: "For ThoughtGraph visual decisions, propose mockups"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 44525a7e-f053
---

Body line one. See [[thoughtgraph-visual-direction]] and [[git-workflow]].
`;

describe('parseMemoryFile', () => {
  it('extracts frontmatter fields, body, and deduped links', () => {
    const p = parseMemoryFile(SAMPLE);
    expect(p.parseError).toBeUndefined();
    expect(p.frontmatter.name).toBe('feedback-visual-prototyping');
    expect(p.frontmatter.description).toBe('For ThoughtGraph visual decisions, propose mockups');
    expect(p.frontmatter.type).toBe('feedback');
    expect(p.frontmatter.originSessionId).toBe('44525a7e-f053');
    expect(p.body.trim().startsWith('Body line one')).toBe(true);
    expect(p.links).toEqual(['thoughtgraph-visual-direction', 'git-workflow']);
  });

  it('returns parseError (no throw) when frontmatter is missing', () => {
    const p = parseMemoryFile('no frontmatter here');
    expect(p.parseError).toBeTruthy();
    expect(p.links).toEqual([]);
  });

  it('round-trips through serializeMemory preserving originSessionId', () => {
    const text = serializeMemory({
      name: 'a-memory', description: 'desc', type: 'project',
      originSessionId: 'sess-1', body: 'Hello [[a-memory]]',
    });
    const p = parseMemoryFile(text);
    expect(p.frontmatter.name).toBe('a-memory');
    expect(p.frontmatter.type).toBe('project');
    expect(p.frontmatter.originSessionId).toBe('sess-1');
    expect(p.body.trim()).toBe('Hello [[a-memory]]');
  });

  it('round-trips a description containing double-quotes', () => {
    const text = serializeMemory({ name: 'q', description: 'She said "hi"', type: 'user', originSessionId: null, body: '' });
    expect(parseMemoryFile(text).frontmatter.description).toBe('She said "hi"');
  });

  it('does not terminate frontmatter on a body line that starts with ---', () => {
    const raw = `---\nname: t\ndescription: "d"\nmetadata:\n  type: project\n---\n\nintro\n--- a horizontal rule ---\nmore\n`;
    const p = parseMemoryFile(raw);
    expect(p.parseError).toBeUndefined();
    expect(p.frontmatter.name).toBe('t');
    expect(p.body).toContain('--- a horizontal rule ---');
  });
});
