// tests/unit/memory/MemoryStats.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryStats } from '../../../src/memory/MemoryStats';
import { deriveInsights } from '../../../src/memory/insights';
import type { MemoryRecord } from '../../../src/api/client';

function rec(p: Partial<MemoryRecord> & { name: string }): MemoryRecord {
  return {
    scopeKey: 'C--demo', scope: { kind: 'project', projectId: 'C--demo', cwd: 'C:/demo' },
    fileName: p.fileName ?? p.name, name: p.name, description: '', type: p.type ?? 'project', originSessionId: p.originSessionId ?? null,
    links: p.links ?? [], body: '', mtimeMs: p.mtimeMs ?? Date.now(), inIndex: p.inIndex ?? true,
  };
}

describe('MemoryStats', () => {
  it('shows totals, type composition, and a broken-link count', () => {
    const ins = deriveInsights([
      rec({ name: 'a', type: 'feedback', links: ['ghost'] }),
      rec({ name: 'b', type: 'project' }),
    ], Date.parse('2026-05-29T00:00:00Z'));
    render(<MemoryStats insights={ins} />);
    expect(screen.getByTestId('stats-total').textContent).toContain('2');
    expect(screen.getByTestId('stats-type-feedback').textContent).toContain('1');
    expect(screen.getByTestId('stats-broken').textContent).toContain('1');
  });
});
