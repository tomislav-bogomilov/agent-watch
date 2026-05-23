import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

export type ItemVariant = 'A' | 'B' | 'C';

const STORAGE = 'tg.spike.itemStyle';
const EVENT = 'tg-item-variant-change';

export function readItemVariant(): ItemVariant {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw === 'A' || raw === 'B' || raw === 'C') return raw;
  } catch { /* ignore */ }
  return 'A';
}

export function setItemVariant(v: ItemVariant): void {
  try { localStorage.setItem(STORAGE, v); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useItemVariant(): ItemVariant {
  const [v, setV] = useState<ItemVariant>(() => readItemVariant());
  useEffect(() => {
    const handler = () => setV(readItemVariant());
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
  return v;
}

export type ItemStyle = {
  outer: CSSProperties;
  inner: CSSProperties;
  hover: CSSProperties;
  selected: CSSProperties;
  brackets: boolean;
  bracketSize?: number;
};

export function getItemStyle(v: ItemVariant): ItemStyle {
  switch (v) {
    case 'A':
      return {
        outer: { listStyle: 'none', padding: '3px 8px' },
        inner: {
          position: 'relative' as const,
          padding: '8px 12px',
          border: '1px solid rgba(110, 224, 238, 0.10)',
          background: 'transparent',
          cursor: 'pointer',
          transition: 'border-color 120ms ease, background 120ms ease',
        },
        hover: { border: '1px solid rgba(110, 224, 238, 0.28)' },
        selected: {
          border: '1px solid rgba(0, 229, 255, 0.0)',
          background: 'rgba(0, 229, 255, 0.04)',
        },
        brackets: true,
        bracketSize: 22,
      };
    case 'B':
      // A's bones + a horizontal cyan gradient that fades to the right.
      return {
        outer: { listStyle: 'none', padding: '3px 8px' },
        inner: {
          position: 'relative' as const,
          padding: '8px 12px',
          border: '1px solid rgba(110, 224, 238, 0.10)',
          background: 'linear-gradient(90deg, rgba(0, 229, 255, 0.055) 0%, rgba(0, 229, 255, 0.012) 60%, rgba(0, 229, 255, 0) 100%)',
          cursor: 'pointer',
          transition: 'border-color 220ms ease, background 220ms ease, box-shadow 220ms ease',
        },
        hover: {
          border: '1px solid rgba(110, 224, 238, 0.28)',
          background: 'linear-gradient(90deg, rgba(0, 229, 255, 0.10) 0%, rgba(0, 229, 255, 0.025) 65%, rgba(0, 229, 255, 0) 100%)',
        },
        selected: {
          border: '1px solid rgba(0, 229, 255, 0.0)',
          background: 'linear-gradient(90deg, rgba(0, 229, 255, 0.135) 0%, rgba(0, 229, 255, 0.04) 60%, rgba(0, 229, 255, 0.01) 100%)',
        },
        brackets: true,
        bracketSize: 22,
      };
    case 'C':
      // A's bones + a soft radial halo anchored to the left edge.
      return {
        outer: { listStyle: 'none', padding: '3px 8px' },
        inner: {
          position: 'relative' as const,
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
        brackets: true,
      };
  }
}