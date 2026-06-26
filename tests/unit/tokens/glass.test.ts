import { describe, it, expect } from 'vitest';
import * as d3 from 'd3';
import { appendGlassDefs, drawGlassBar } from '../../../src/tokens/glass';

const NS = 'http://www.w3.org/2000/svg';

describe('glass helper', () => {
  it('appendGlassDefs inserts prefixed, idempotent defs', () => {
    const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
    const ids = appendGlassDefs(svg, 'daily');
    expect(ids.glow).toBe('daily-glass-glow');
    expect(svg.querySelector('#daily-glass-glow')).not.toBeNull();
    expect(svg.querySelector('#daily-glass-sheen')).not.toBeNull();
    appendGlassDefs(svg, 'daily'); // idempotent
    expect(svg.querySelectorAll('defs[data-glass]').length).toBe(1);
  });

  it('drawGlassBar tags the front rect and adds a cap when tall', () => {
    const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
    const ids = appendGlassDefs(svg, 'spend');
    const g = d3.select(svg).append('g');
    const front = drawGlassBar(g, { x: 0, y: 0, width: 10, height: 40, color: '#00E5FF', ids, role: 'spend-bar' });
    expect(front.attr('data-role')).toBe('spend-bar');
    expect(svg.querySelectorAll('[data-role="spend-bar"]').length).toBe(1);
    expect(svg.querySelectorAll('[data-role="bar-cap"]').length).toBe(1);
  });

  it('drawGlassBar still emits the front rect for zero-height segments (no cap)', () => {
    const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
    const ids = appendGlassDefs(svg, 'daily');
    const g = d3.select(svg).append('g');
    drawGlassBar(g, { x: 0, y: 0, width: 10, height: 0, color: '#00E5FF', ids, role: 'bar' });
    expect(svg.querySelectorAll('[data-role="bar"]').length).toBe(1);
    expect(svg.querySelectorAll('[data-role="bar-cap"]').length).toBe(0);
  });

  it('supports two different prefixes on the same svg', () => {
    const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
    appendGlassDefs(svg, 'daily');
    appendGlassDefs(svg, 'spend');
    expect(svg.querySelector('#daily-glass-glow')).not.toBeNull();
    expect(svg.querySelector('#spend-glass-glow')).not.toBeNull();
    expect(svg.querySelectorAll('defs[data-glass]').length).toBe(2);
  });
});
