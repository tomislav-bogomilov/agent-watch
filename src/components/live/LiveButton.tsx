import type { CSSProperties } from 'react';

type Props = {
  engaged: boolean;
  onToggle: () => void;
};

const baseBtn: CSSProperties = {
  background: 'rgba(5,8,13,0.85)',
  border: '1px solid rgba(0,229,255,0.55)',
  color: '#00e5ff',
  padding: '2px 8px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 9,
  letterSpacing: 2,
  cursor: 'pointer',
  height: 20,
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  textShadow: '0 0 6px rgba(0,229,255,0.55)',
  boxShadow: '0 0 8px rgba(0,229,255,0.18), inset 0 0 8px rgba(0,229,255,0.08)',
};

const dot: CSSProperties = {
  width: 4,
  height: 4,
  borderRadius: '50%',
  background: '#00e5ff',
  boxShadow: '0 0 5px #00e5ff',
  animation: 'livePulse 1.4s ease-in-out infinite',
};

export function LiveButton({ engaged, onToggle }: Props) {
  return (
    <button
      data-testid="live-button"
      aria-pressed={engaged}
      onClick={onToggle}
      title={engaged ? 'exit live mode' : 'enter live mode'}
      style={baseBtn}
    >
      <span data-testid="live-button-dot" style={dot} />
      LIVE
    </button>
  );
}
