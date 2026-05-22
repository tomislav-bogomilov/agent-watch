import { useCallback, useState } from 'react';

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function readWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return fallback;
    return clamp(n, min, max);
  } catch {
    return fallback;
  }
}

type Updater = number | ((prev: number) => number);

export function usePersistentWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
): [number, (next: Updater) => void] {
  const [width, setWidthState] = useState<number>(() => readWidth(key, fallback, min, max));
  const setWidth = useCallback((next: Updater) => {
    setWidthState((prev) => {
      const raw = typeof next === 'function' ? next(prev) : next;
      const clamped = clamp(Math.round(raw), min, max);
      try { localStorage.setItem(key, String(clamped)); } catch { /* ignore */ }
      return clamped;
    });
  }, [key, min, max]);
  return [width, setWidth];
}
