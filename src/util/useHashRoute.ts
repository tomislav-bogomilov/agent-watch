import { useEffect, useState } from 'react';

export type Route = 'main' | 'tokens';

function read(): Route {
  if (typeof window === 'undefined') return 'main';
  return window.location.hash === '#/tokens' ? 'tokens' : 'main';
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const onChange = (): void => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
