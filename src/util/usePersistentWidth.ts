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

export function usePersistentWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
): [number, (next: number) => void] {
  const [width, setWidthState] = useState<number>(() => readWidth(key, fallback, min, max));
  const setWidth = useCallback((next: number) => {
    const clamped = clamp(Math.round(next), min, max);
    setWidthState(clamped);
    try { localStorage.setItem(key, String(clamped)); } catch { /* ignore */ }
  }, [key, min, max]);
  return [width, setWidth];
}
