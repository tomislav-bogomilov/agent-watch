import { describe, it, expect } from 'vitest';
import { layoutHologram } from '../../../src/graph/hologramLayout';
import type { LaidOutNode } from '../../../src/graph/layout';
import type { Milestone } from '../../../src/parse/types';

function node(id: string, x: number, y: number): LaidOutNode {
  const m = { id, kind: 'assistant_turn', label: '', summary: '', timestamp: '', failed: false, raw: {}, children: [] } as Milestone;
  return { id, milestone: m, x, y, depth: 0 };
}

const PANEL = { w: 350, h: 400 };
const HUGE_VIEWPORT = { x: -10000, y: -10000, w: 20000, h: 20000 };

describe('layoutHologram', () => {
  it('picks NE slot at d=24 when nothing blocks it (sparse scene)', () => {
    const selected = node('s', 0, 0);
    const out = layoutHologram(selected, [selected], HUGE_VIEWPORT, PANEL);
    expect(out.panelRect.x).toBe(82);
    expect(out.panelRect.y).toBe(-440);
    expect(out.panelRect.w).toBe(350);
    expect(out.panelRect.h).toBe(400);
    expect(out.connectorPath).toMatch(/^M /);
  });

  it('falls back to NW when NE is blocked by an obstacle', () => {
    const selected = node('s', 0, 0);
    const blocker = node('b', 240, -240);
    const out = layoutHologram(selected, [selected, blocker], HUGE_VIEWPORT, PANEL);
    expect(out.panelRect.x).toBe(-432);
    expect(out.panelRect.y).toBe(-440);
  });

  it('escalates distance when all 8 directions blocked at d=24', () => {
    const selected = node('s', 0, 0);
    const obstacles: LaidOutNode[] = [selected];
    for (const [dx, dy] of [[200,-200],[-200,-200],[200,200],[-200,200],[200,0],[-200,0],[0,-220],[0,220]]) {
      obstacles.push(node(`b-${dx}-${dy}`, dx, dy));
    }
    const out = layoutHologram(selected, obstacles, HUGE_VIEWPORT, PANEL);
    expect(out.panelRect).toBeDefined();
    expect(out.connectorPath).toMatch(/^M /);
  });

  it('falls back to minimum-overlap when no slot fits at any distance', () => {
    const selected = node('s', 0, 0);
    const tinyViewport = { x: -10, y: -10, w: 20, h: 20 };
    const out = layoutHologram(selected, [selected], tinyViewport, PANEL);
    expect(out.panelRect).toBeDefined();
    expect(out.connectorPath).toMatch(/^M /);
  });

  it('emits an orthogonal connector path with only horizontal/vertical segments', () => {
    const selected = node('s', 0, 0);
    const out = layoutHologram(selected, [selected], HUGE_VIEWPORT, PANEL);
    const pts = out.connectorPath.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x1 = pts[i], y1 = pts[i + 1];
      const x2 = pts[i + 2], y2 = pts[i + 3];
      const horizontal = y1 === y2;
      const vertical = x1 === x2;
      expect(horizontal || vertical).toBe(true);
    }
  });
});
