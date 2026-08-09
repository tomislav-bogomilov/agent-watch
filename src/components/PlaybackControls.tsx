import { useRef } from 'react';
import {
  nextIndexMatching,
  stepSpeed,
  type PlaybackControls as Controls,
  type PlaybackState,
} from '../playback/usePlayback';

type Props = { state: PlaybackState; controls: Controls };

function Scrubber({ index, edgeProgress, total, onSeek }: {
  index: number; edgeProgress: number; total: number; onSeek: (i: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = total > 1
    ? Math.max(0, Math.min(100, ((index + edgeProgress) / (total - 1)) * 100))
    : 0;

  function seekFromEvent(clientX: number): void {
    const t = trackRef.current;
    if (!t) return;
    const rect = t.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.x) / rect.width));
    onSeek(Math.round(ratio * Math.max(0, total - 1)));
  }

  return (
    <div
      ref={trackRef}
      data-testid="scrubber-track"
      onMouseDown={(e) => {
        seekFromEvent(e.clientX);
        const move = (ev: MouseEvent) => seekFromEvent(ev.clientX);
        const up = () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      }}
      style={{
        position: 'relative',
        height: 6,
        flex: '1 1 auto',
        minWidth: 80,
        background: 'rgba(26,58,74,0.6)',
        border: '1px solid var(--edge-idle)',
        cursor: 'pointer',
      }}
    >
      <div
        data-testid="scrubber-fill"
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`, background: 'var(--edge-trail)', opacity: 0.6,
        }}
      />
      <div
        data-testid="scrubber-handle"
        data-pct={pct.toFixed(1)}
        style={{
          position: 'absolute', top: -3, height: 12, width: 4,
          left: `calc(${pct}% - 2px)`,
          background: 'var(--edge-trail)', boxShadow: '0 0 6px var(--edge-trail)',
        }}
      />
    </div>
  );
}

export function PlaybackControls({ state, controls }: Props) {
  return (
    <div style={styles.bar}>
      <button
        onClick={() => controls.step(-1)}
        style={styles.btn}
        data-testid="step-back"
        aria-label="step back"
        title="step back (←)"
      >‹</button>
      <button
        onClick={controls.toggle}
        style={styles.btn}
        data-testid="play-toggle"
        aria-label="toggle play"
        title="play / pause (space)"
      >
        {state.playing ? '❚❚' : '▶'}
      </button>
      <button
        onClick={() => controls.step(1)}
        style={styles.btn}
        data-testid="step-forward"
        aria-label="step forward"
        title="step forward (→)"
      >›</button>
      <Scrubber
        index={state.index}
        edgeProgress={state.edgeProgress}
        total={state.order.length}
        onSeek={controls.scrubTo}
      />
      <div style={styles.jumpGroup}>
        <button
          style={styles.btn}
          data-testid="jump-subagent"
          title="next subagent"
          aria-label="next subagent"
          onClick={() => {
            const i = nextIndexMatching(state.order, state.index, (m) => m.kind === 'subagent_spawn');
            if (i != null) controls.scrubTo(i);
          }}
        >⌥</button>
        <button
          style={styles.btn}
          data-testid="jump-end"
          title="end"
          aria-label="end"
          onClick={() => controls.scrubTo(state.order.length - 1)}
        >■</button>
      </div>
      <div style={styles.speedGroup}>
        <button
          style={styles.btn}
          data-testid="speed-dec"
          aria-label="slower"
          title="slower"
          onClick={() => controls.setSpeed(stepSpeed(state.speed, -1))}
        >−</button>
        <span style={styles.speedValue} data-testid="speed-value">{state.speed}×</span>
        <button
          style={styles.btn}
          data-testid="speed-inc"
          aria-label="faster"
          title="faster"
          onClick={() => controls.setSpeed(stepSpeed(state.speed, 1))}
        >+</button>
      </div>
    </div>
  );
}

const styles = {
  bar: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid var(--edge-idle)',
    padding: '6px 10px',
    fontFamily: 'ui-monospace, monospace',
  },
  btn: {
    background: 'transparent',
    border: '1px solid var(--edge-idle)',
    color: 'var(--text)',
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
  },
  jumpGroup: { display: 'flex' as const, gap: 4, marginLeft: 6 },
  speedGroup: { display: 'flex' as const, gap: 4, alignItems: 'center' as const, marginLeft: 6 },
  speedValue: { color: 'var(--edge-trail)', fontSize: 11, minWidth: 30, textAlign: 'center' as const, letterSpacing: 1 },
};
