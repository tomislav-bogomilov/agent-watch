// tests/unit/memory/MemoryGraph.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryGraph } from '../../../src/memory/MemoryGraph';
import type { MemoryRecord } from '../../../src/api/client';

function rec(name: string, links: string[] = []): MemoryRecord {
  return {
    scopeKey: 'C--demo', scope: { kind: 'project', projectId: 'C--demo', cwd: 'C:/demo' },
    name, description: '', type: 'project', originSessionId: null, links, body: '', mtimeMs: 0, inIndex: true,
  };
}

describe('MemoryGraph', () => {
  it('renders one node per memory and one edge per valid link, and selects on click', () => {
    const onSelect = vi.fn();
    render(<MemoryGraph memories={[rec('a', ['b', 'ghost']), rec('b')]} selectedName={null} onSelect={onSelect} />);
    expect(screen.getAllByTestId(/^graph-node-/)).toHaveLength(2);
    expect(screen.getAllByTestId(/^graph-edge-/)).toHaveLength(1); // a->b valid; a->ghost dropped
    fireEvent.click(screen.getByTestId('graph-node-a'));
    expect(onSelect).toHaveBeenCalledWith('a');
  });
});
