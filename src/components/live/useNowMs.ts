import { useEffect, useState } from 'react';

/** Returns Date.now() at mount, then updates every `intervalMs` ms.
 *  Each call sets up its own interval — keep this hook localized to the
 *  smallest subtree that actually needs to re-render on the tick. */
export function useNowMs(intervalMs: number): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
