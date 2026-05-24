import type { CSSProperties } from 'react';

type Props = {
  showLive: boolean;
  liveEngaged: boolean;
  onToggleLive: () => void;

  showFit: boolean;
  onFit: () => void;

  showFollow: boolean;
  follow: boolean;
  onToggleFollow: () => void;
};

const container: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  zIndex: 6,
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  pointerEvents: 'auto',
};

const baseBtn: CSSProperties = {
  background: 'rgba(5,8,13,0.85)',
  padding: '2px 8px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 9,
  letterSpacing: 2,
  height: 20,
  boxSizing: 'border-box',
  cursor: 'pointer',
};

const liveBtn: CSSProperties = {
  ...baseBtn,
  border: '1px solid rgba(0,229,255,0.55)',
  color: '#00e5ff',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  textShadow: '0 0 6px rgba(0,229,255,0.55)',
  boxShadow: '0 0 8px rgba(0,229,255,0.18), inset 0 0 8px rgba(0,229,255,0.08)',
};

const liveDot: CSSProperties = {
  width: 4,
  height: 4,
  borderRadius: '50%',
  background: '#00e5ff',
  boxShadow: '0 0 5px #00e5ff',
  animation: 'livePulse 1.4s ease-in-out infinite',
};

const fitBtn: CSSProperties = {
  ...baseBtn,
  border: '1px solid var(--edge-idle)',
  color: 'var(--text)',
};

function followBtnStyle(follow: boolean): CSSProperties {
  return {
    ...baseBtn,
    border: `1px solid ${follow ? 'var(--edge-trail)' : 'var(--edge-idle)'}`,
    color: follow ? 'var(--edge-trail)' : 'var(--text)',
  };
}

export function CanvasToolbar({
  showLive, liveEngaged, onToggleLive,
  showFit, onFit,
  showFollow, follow, onToggleFollow,
}: Props) {
  if (!showLive && !showFit && !showFollow) return null;
  return (
    <div data-testid="canvas-toolbar" style={container}>
      {showLive && (
        <button
          data-testid="live-button"
          aria-pressed={liveEngaged}
          onClick={onToggleLive}
          title={liveEngaged ? 'exit live mode' : 'enter live mode'}
          style={liveBtn}
        >
          <span data-testid="live-button-dot" style={liveDot} />
          LIVE
        </button>
      )}
      {showFollow && (
        <button
          data-testid="follow-toggle"
          onClick={onToggleFollow}
          title="follow playhead (L)"
          style={followBtnStyle(follow)}
        >
          FOLLOW
        </button>
      )}
      {showFit && (
        <button
          data-testid="fit-button"
          onClick={onFit}
          title="fit (F)"
          style={fitBtn}
        >
          FIT
        </button>
      )}
    </div>
  );
}
