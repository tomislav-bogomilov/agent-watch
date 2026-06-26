import * as d3 from 'd3';

export type GlassIds = { sheen: string; glow: string; softglow: string };

// Inserts the glass gradient + glow filters once per <svg>. ids are prefixed
// so two charts on one page never collide on url(#id). Safe to call on every
// render (it no-ops if the defs are already present).
export function appendGlassDefs(svgEl: SVGSVGElement, prefix: string): GlassIds {
  const ids: GlassIds = {
    sheen: `${prefix}-glass-sheen`,
    glow: `${prefix}-glass-glow`,
    softglow: `${prefix}-glass-softglow`,
  };
  const svg = d3.select(svgEl);
  if (!svg.select(`defs[data-glass="${prefix}"]`).empty()) return ids;
  const defs = svg.insert('defs', ':first-child').attr('data-glass', prefix);

  const sheen = defs.append('linearGradient')
    .attr('id', ids.sheen).attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
  sheen.append('stop').attr('offset', 0).attr('stop-color', 'rgba(255,255,255,0.45)');
  sheen.append('stop').attr('offset', 0.35).attr('stop-color', 'rgba(255,255,255,0.06)');
  sheen.append('stop').attr('offset', 1).attr('stop-color', 'rgba(255,255,255,0)');

  for (const [id, dev] of [[ids.glow, 1.6], [ids.softglow, 4]] as const) {
    const f = defs.append('filter').attr('id', id)
      .attr('x', '-80%').attr('y', '-80%').attr('width', '260%').attr('height', '260%');
    f.append('feGaussianBlur').attr('stdDeviation', dev).attr('result', 'b');
    const m = f.append('feMerge');
    m.append('feMergeNode').attr('in', 'b');
    m.append('feMergeNode').attr('in', 'SourceGraphic');
  }
  return ids;
}

type BarOpts = { x: number; y: number; width: number; height: number; color: string; ids: GlassIds; role: string };

// Draws one Hologram-Glass segment into group `g`. Always appends the
// interactive front rect (so callers can keep a rect per day/key, even at
// zero height); decorations are added only when the segment has height.
export function drawGlassBar(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  o: BarOpts,
): d3.Selection<SVGRectElement, unknown, null, undefined> {
  const rx = Math.min(4, o.width / 3);
  if (o.height > 0) {
    // outer bloom
    g.append('rect')
      .attr('x', o.x - 1).attr('y', o.y).attr('width', o.width + 2).attr('height', o.height).attr('rx', rx)
      .attr('fill', o.color).attr('fill-opacity', 0.12).attr('filter', `url(#${o.ids.softglow})`)
      .attr('pointer-events', 'none');
  }
  // interactive front glass (tinted by series color)
  const front = g.append('rect')
    .attr('data-role', o.role)
    .attr('x', o.x).attr('y', o.y).attr('width', o.width).attr('height', o.height).attr('rx', rx)
    .attr('fill', o.color).attr('fill-opacity', 0.20)
    .attr('stroke', o.color).attr('stroke-width', 1.1).attr('stroke-opacity', 0.9);
  if (o.height > 0) {
    // white sheen highlight
    g.append('rect')
      .attr('x', o.x).attr('y', o.y).attr('width', o.width).attr('height', o.height).attr('rx', rx)
      .attr('fill', `url(#${o.ids.sheen})`).attr('pointer-events', 'none');
    // bright glowing top cap
    g.append('rect')
      .attr('data-role', 'bar-cap')
      .attr('x', o.x).attr('y', o.y - 1).attr('width', o.width).attr('height', 2).attr('rx', 1)
      .attr('fill', o.color).attr('filter', `url(#${o.ids.glow})`).attr('pointer-events', 'none');
  }
  return front;
}
