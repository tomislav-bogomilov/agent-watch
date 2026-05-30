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

const graphProps = {
  getBacklinks: () => [] as string[],
  knownSessionIds: new Set<string>(),
  onJumpToSession: () => {},
  now: 0,
};

describe('MemoryGraph', () => {
  it('renders one node per memory and one edge per valid link, and selects on click', () => {
    const onSelect = vi.fn();
    render(<MemoryGraph memories={[rec('a', ['b', 'ghost']), rec('b')]} selectedName={null} onSelect={onSelect} {...graphProps} />);
    expect(screen.getAllByTestId(/^graph-node-/)).toHaveLength(2);
    expect(screen.getAllByTestId(/^graph-edge-/)).toHaveLength(1); // a->b valid; a->ghost dropped
    fireEvent.click(screen.getByTestId('graph-node-a'));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('opens a hologram for the clicked node and closes it via ×', () => {
    render(<MemoryGraph memories={[rec('a', ['b']), rec('b')]} selectedName={null} onSelect={() => {}} {...graphProps} />);
    expect(screen.queryByTestId('memory-hologram')).toBeNull();
    fireEvent.click(screen.getByTestId('graph-node-a'));
    expect(screen.getByTestId('memory-hologram')).toBeDefined();
    fireEvent.click(screen.getByTestId('hologram-close'));
    expect(screen.queryByTestId('memory-hologram')).toBeNull();
  });

  it('renders one framed panel per scope and hides a project via the filter chips', () => {
    const proj: MemoryRecord = { ...rec('p1'), scopeKey: 'C--proj', scope: { kind: 'project', projectId: 'C--proj', cwd: 'C:/proj' } };
    const glob: MemoryRecord = { ...rec('g1'), scopeKey: 'global', scope: { kind: 'global' } };
    render(<MemoryGraph memories={[proj, glob]} selectedName={null} onSelect={() => {}} {...graphProps} />);

    // one panel per scope, both nodes present
    expect(screen.getAllByTestId(/^graph-panel-/)).toHaveLength(2);
    expect(screen.getByTestId('graph-node-p1')).toBeDefined();
    expect(screen.getByTestId('graph-node-g1')).toBeDefined();

    // collapsed filter shows visible/total, expands into chips, toggling hides a group
    expect(screen.getByTestId('graph-filter').textContent).toContain('2/2');
    fireEvent.click(screen.getByTestId('graph-filter'));
    fireEvent.click(screen.getByTestId('graph-filter-chip-C--proj'));
    expect(screen.queryByTestId('graph-node-p1')).toBeNull();
    expect(screen.getByTestId('graph-node-g1')).toBeDefined();
    expect(screen.getAllByTestId(/^graph-panel-/)).toHaveLength(1);
  });
});
