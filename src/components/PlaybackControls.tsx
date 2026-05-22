import type { PlaybackControls as Controls, PlaybackState, Speed } from '../playback/usePlayback';

type Props = { state: PlaybackState; controls: Controls };

const SPEEDS: Speed[] = [0.25, 0.5, 1, 2, 4];

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
};
