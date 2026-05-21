import type { PlaybackControls as Controls, PlaybackState, Speed } from '../playback/usePlayback';

type Props = { state: PlaybackState; controls: Controls };

export function PlaybackControls({ state, controls }: Props) {
  return (
    <div style={styles.bar}>
      <button onClick={controls.toggle} style={styles.btn} data-testid="play-toggle">
        {state.playing ? '❚❚' : '▶'}
      </button>
      <div style={styles.speedGroup} role="group" aria-label="speed">
        {([1, 2, 4] as Speed[]).map((s) => (
          <button
            key={s}
            onClick={() => controls.setSpeed(s)}
            style={{
              ...styles.speed,
              ...(state.speed === s ? styles.speedActive : {}),
            }}
            data-testid={`speed-${s}`}
          >
            {s}×
          </button>
        ))}
      </div>
      <button onClick={controls.restart} style={styles.btn} data-testid="restart">↺</button>
    </div>
  );
}

const styles = {
  bar: {
    position: 'absolute' as const,
    left: '50%',
    bottom: 24,
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 8,
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
  speedGroup: { display: 'flex' },
  speed: {
    background: 'transparent',
    border: '1px solid var(--edge-idle)',
    color: 'var(--text-dim)',
    padding: '4px 8px',
    marginLeft: -1,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
  },
  speedActive: {
    color: 'var(--edge-trail)',
    borderColor: 'var(--edge-trail)',
  },
};
