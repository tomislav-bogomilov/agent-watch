import { useRef } from 'react';
import {
  nextIndexMatching,
  type PlaybackControls as Controls,
  type PlaybackState,
  type Speed,
} from '../playback/usePlayback';

type Props = { state: PlaybackState; controls: Controls };

const SPEEDS: Speed[] = [0.25, 0.5, 1, 2, 4];

function Scrubber({ index, edgeProgress, total, onSeek }: {
  index: number; edgeProgress: number; total: number; onSeek: (i: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = total > 1 ? ((index + edgeProgress) / (total - 1)) * 100 : 0;

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
        width: 320,
        background: 'rgba(26,58,74,0.6)',
        border: '1px solid var(--edge-idle)',
        cursor: 'pointer',
        marginRight: 8,
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
      <Scrubber
        index={state.index}
        edgeProgress={state.edgeProgress}
        total={state.order.length}
        onSeek={controls.scrubTo}
      />
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
      <div style={styles.speedGroup} role="group" aria-label="speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => controls.setSpeed(s)}
            style={{ ...styles.speed, ...(state.speed === s ? styles.speedActive : {}) }}
            data-testid={`speed-${s}`}
          >
            {s}×
          </button>
        ))}
      </div>
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
          data-testid="jump-tool"
          title="next tool call"
          aria-label="next tool call"
          onClick={() => {
            const i = nextIndexMatching(state.order, state.index, (m) => m.kind === 'tool_call');
            if (i != null) controls.scrubTo(i);
          }}
        >⚙</button>
        <button
          style={styles.btn}
          data-testid="jump-fail"
          title="next failure"
          aria-label="next failure"
          onClick={() => {
            const i = nextIndexMatching(state.order, state.index, (m) => m.failed);
            if (i != null) controls.scrubTo(i);
          }}
        >⊘</button>
        <button
          style={styles.btn}
          data-testid="jump-end"
          title="end"
          aria-label="end"
          onClick={() => controls.scrubTo(state.order.length - 1)}
        >■</button>
      </div>
      <button
        onClick={controls.restart}
        style={styles.btn}
        data-testid="restart"
        aria-label="restart"
        title="restart"
      >↺</button>
    </div>
  );
}

const styles = {
  bar: {
    position: 'absolute' as const,
    left: '50%',
    bottom: 16,
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid var(--edge-idle)',
    padding: '6px 10px',
    fontFamily: 'ui-monospace, monospace',
    zIndex: 4,
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
  speedGroup: { display: 'flex', marginLeft: 6 },
  speed: {
    background: 'transparent',
    border: '1px solid var(--edge-idle)',
    color: 'var(--text-dim)',
    padding: '4px 6px',
    marginLeft: -1,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 11,
  },
  speedActive: { color: 'var(--edge-trail)', borderColor: 'var(--edge-trail)' },
  jumpGroup: { display: 'flex' as const, gap: 4, marginLeft: 6 },
};
