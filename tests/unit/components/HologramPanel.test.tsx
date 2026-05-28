import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { HologramPanel } from '../../../src/components/HologramPanel';
import type { Milestone } from '../../../src/parse/types';

function ms(over: Partial<Milestone>): Milestone {
  return {
    id: 'T-042', kind: 'assistant_turn', label: 'analyze diff', summary: '',
    timestamp: '2026-01-01T00:00:00Z', failed: false, raw: {}, children: [], ...over,
  } as Milestone;
}

const fullView = {
  milestone: ms({}),
  mode: 'playback' as const,
  metrics: {
    latencyMs: 2140,
    latencyMedianMs: 4800,
    idleGapMs: 4200,
    contextSize: 64200,
    contextDeltaSincePrev: 3100,
    cacheEfficiency: 0.92,
    cacheReads: 58100,
    cacheMisses: 5000,
    tokens: { input: 3000, cacheRead: 58100, cacheCreation: 2000, output: 1100 },
  },
  skills: [
    { name: 'brainstorming', activatedAt: '', byTurnId: '', tokenCost: 6100 },
    { name: 'test-driven-development', activatedAt: '', byTurnId: '', tokenCost: 4200 },
    { name: 'systematic-debugging', activatedAt: '', byTurnId: '', tokenCost: 2800 },
    { name: 'using-git-worktrees', activatedAt: '', byTurnId: '', tokenCost: 2100 },
    { name: 'verification-before-completion', activatedAt: '', byTurnId: '', tokenCost: 1400 },
    { name: 'extra-six', activatedAt: '', byTurnId: '', tokenCost: 900 },
    { name: 'extra-seven', activatedAt: '', byTurnId: '', tokenCost: 700 },
    { name: 'extra-eight', activatedAt: '', byTurnId: '', tokenCost: 500 },
  ],
  skillsTotal: { count: 8, totalTokens: 18700 },
};

const panelRect = { x: 200, y: 30, w: 350, h: 400 };
const connectorPath = 'M 0,0 L 100,0 L 100,100 L 200,100';

describe('HologramPanel', () => {
  it('renders ID, kind, and mode chip', () => {
    render(
      <svg><HologramPanel
        view={fullView} panelRect={panelRect} connectorPath={connectorPath}
        open={true} onClose={() => {}}
      /></svg>
    );
    expect(screen.getByTestId('holo-id').textContent).toBe('T-042');
    expect(screen.getByTestId('holo-kind').textContent).toContain('ASSISTANT_TURN');
    expect(screen.getByTestId('holo-mode-chip').textContent).toBe('PLAYBACK');
  });

  it('shows latency value and median sub', () => {
    render(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={() => {}} /></svg>);
    expect(screen.getByTestId('holo-latency-value').textContent).toContain('2.14');
    expect(screen.getByTestId('holo-latency-sub').textContent).toContain('4.8');
  });

  it('renders top 5 skills by tokenCost', () => {
    render(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={() => {}} /></svg>);
    const rows = screen.getAllByTestId(/^holo-skill-row-/);
    expect(rows).toHaveLength(5);
    expect(rows[0].textContent).toContain('brainstorming');
    expect(rows[4].textContent).toContain('verification-before-completion');
  });

  it('shows expand row with N more and total token count', () => {
    render(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={() => {}} /></svg>);
    const expand = screen.getByTestId('holo-skill-expand');
    expect(expand.textContent).toContain('3 more');
    expect(expand.textContent).toContain('2.1k');
  });

  it('expands to show remaining skills when expand row is clicked', () => {
    render(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={() => {}} /></svg>);
    fireEvent.click(screen.getByTestId('holo-skill-expand'));
    const rows = screen.getAllByTestId(/^holo-skill-row-/);
    expect(rows).toHaveLength(8);
  });

  it('renders em-dash placeholders when metrics are null; hides idle-gap row entirely', () => {
    const view = {
      ...fullView,
      metrics: {
        latencyMs: null, latencyMedianMs: 0, idleGapMs: null,
        contextSize: null, contextDeltaSincePrev: null,
        cacheEfficiency: null, cacheReads: null, cacheMisses: null, tokens: null,
      },
      skills: [], skillsTotal: { count: 0, totalTokens: 0 },
    };
    render(<svg><HologramPanel view={view} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={() => {}} /></svg>);
    expect(screen.getByTestId('holo-latency-value').textContent).toBe('—');
    expect(screen.queryByTestId('holo-idle-value')).toBeNull();
    expect(screen.getByTestId('holo-context-value').textContent).toBe('—');
  });

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn();
    render(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={onClose} /></svg>);
    fireEvent.click(screen.getByTestId('holo-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the connector path string in a path element', () => {
    render(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={() => {}} /></svg>);
    const path = screen.getByTestId('holo-conn-path') as unknown as SVGPathElement;
    expect(path.getAttribute('d')).toBe(connectorPath);
  });

  it('keeps the group mounted briefly after open=false then unmounts', async () => {
    vi.useFakeTimers();
    const { rerender, container } = render(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={true} onClose={() => {}} /></svg>);
    expect(container.querySelector('[data-testid="holo-root"]')).not.toBeNull();
    rerender(<svg><HologramPanel view={fullView} panelRect={panelRect} connectorPath={connectorPath} open={false} onClose={() => {}} /></svg>);
    expect(container.querySelector('[data-testid="holo-root"]')).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(container.querySelector('[data-testid="holo-root"]')).toBeNull();
    vi.useRealTimers();
  });
});
