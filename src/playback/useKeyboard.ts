import { useEffect } from 'react';
import type { PlaybackControls, Speed } from './usePlayback';

type Handlers = {
  controls: PlaybackControls;
  speed: Speed;
  onFit: () => void;
  onToggleFollow: () => void;
  onToggleSidebar: () => void;
  onCloseDetail: () => void;
};

const SPEED_ORDER: Speed[] = [0.25, 0.5, 1, 2, 4];

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
        case '[': {
          const i = Math.max(0, SPEED_ORDER.indexOf(h.speed) - 1);
          h.controls.setSpeed(SPEED_ORDER[i]);
          break;
        }
        case ']': {
          const i = Math.min(SPEED_ORDER.length - 1, SPEED_ORDER.indexOf(h.speed) + 1);
          h.controls.setSpeed(SPEED_ORDER[i]);
          break;
        }
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
