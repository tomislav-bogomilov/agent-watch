import type { CSSProperties } from 'react';

export type ItemStyle = {
  outer: CSSProperties;
  inner: CSSProperties;
  hover: CSSProperties;
  selected: CSSProperties;
};

// The locked sidebar item style ("C" variant from the brainstorm spike):
// transparent base with a soft cyan radial halo anchored to the left edge,
// hairline border at rest, glowing corner brackets when selected.
export const ITEM_STYLE: ItemStyle = {
  outer: { listStyle: 'none', padding: '3px 8px' },
  inner: {
    position: 'relative',
    padding: '8px 12px',
    border: '1px solid rgba(110, 224, 238, 0.10)',
    background: 'radial-gradient(ellipse 75% 120% at 18% 50%, rgba(0, 229, 255, 0.085) 0%, rgba(0, 229, 255, 0.02) 55%, rgba(0, 229, 255, 0) 80%)',
    cursor: 'pointer',
    transition: 'border-color 220ms ease, background 220ms ease, box-shadow 220ms ease',
  },
  hover: {
    border: '1px solid rgba(110, 224, 238, 0.28)',
    background: 'radial-gradient(ellipse 85% 140% at 22% 50%, rgba(0, 229, 255, 0.13) 0%, rgba(0, 229, 255, 0.035) 60%, rgba(0, 229, 255, 0) 85%)',
  },
  selected: {
    border: '1px solid rgba(0, 229, 255, 0.0)',
    background: 'radial-gradient(ellipse 90% 150% at 22% 50%, rgba(0, 229, 255, 0.20) 0%, rgba(0, 229, 255, 0.06) 60%, rgba(0, 229, 255, 0.005) 90%)',
  },
};
