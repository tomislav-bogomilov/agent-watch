import { useEffect } from 'react';
import type { PlaybackControls } from './usePlayback';

type Handlers = {
  controls: PlaybackControls;
  onFit: () => void;
  onToggleFollow: () => void;
  onToggleSidebar: () => void;
  onCloseDetail: () => void;
};

export function useKeyboard(h: Handlers): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          h.controls.toggle();
          break;
        case 'ArrowLeft':
          h.controls.step(-1);
          break;
        case 'ArrowRight':
          h.controls.step(1);
          break;
        case 'f':
        case 'F':
          h.onFit();
          break;
        case 'l':
        case 'L':
          h.onToggleFollow();
          break;
        case '\\':
          h.onToggleSidebar();
          break;
        case 'Escape':
          h.onCloseDetail();
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [h]);
}
