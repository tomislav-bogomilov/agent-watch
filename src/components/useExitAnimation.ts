import { useEffect, useState } from 'react';

/**
 * Returns { mounted, exiting } based on `open`. When `open` flips false, the
 * caller keeps rendering as long as `mounted === true`. After `durationMs`,
 * `mounted` flips false and the caller can unmount.
 */
export function useExitAnimation(open: boolean, durationMs = 200): { mounted: boolean; exiting: boolean } {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setExiting(false);
      return;
    }
    if (!mounted) return;
    setExiting(true);
    const t = setTimeout(() => {
      setMounted(false);
      setExiting(false);
    }, durationMs);
    return () => clearTimeout(t);
  }, [open, durationMs, mounted]);

  return { mounted, exiting };
}
