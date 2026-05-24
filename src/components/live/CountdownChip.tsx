import { useState, type CSSProperties } from 'react';

type Props = {
  seconds: number;
  frozen: boolean;
  onToggleFreeze: () => void;
};

const base: CSSProperties = {
  position: 'absolute',
  bottom: 14,
  left: 22,
  padding: '4px 8px',
  fontSize: 8,
  letterSpacing: 2,
  fontFamily: 'ui-monospace, monospace',
  cursor: 'pointer',
  userSelect: 'none',
  zIndex: 6,
  textAlign: 'center',
  lineHeight: 1.4,
};

const countingPalette: CSSProperties = {
  border: '1px solid rgba(255,90,90,0.7)',
  background: 'rgba(20,5,5,0.85)',
  color: '#ff7c7c',
  textShadow: '0 0 6px rgba(255,90,90,0.7)',
  animation: 'cdPulse 2.4s ease-in-out infinite',
};

const hoverPalette: CSSProperties = {
  border: '1px solid rgba(255,200,90,0.85)',
  background: 'rgba(20,14,5,0.85)',
  color: '#ffd86b',
  textShadow: '0 0 7px rgba(255,210,90,0.8)',
};

const frozenPalette: CSSProperties = {
  border: '1px solid rgba(255,176,102,0.7)',
  background: 'rgba(20,14,5,0.85)',
  color: '#ffb066',
  textShadow: '0 0 7px rgba(255,176,102,0.6)',
};

const subStyle: CSSProperties = {
  display: 'block',
  fontSize: 7,
  marginTop: 2,
  letterSpacing: 1.5,
  opacity: 0.65,
};

export function CountdownChip({ seconds, frozen, onToggleFreeze }: Props) {
  const [hover, setHover] = useState(false);
  const palette = frozen ? frozenPalette : hover ? hoverPalette : countingPalette;
  const main = frozen ? `FROZEN · ${seconds}s` : hover ? 'STOP CLOSING' : `CLOSING IN ${seconds}s`;
  const sub = frozen ? 'click to resume' : hover ? `click to freeze · ${seconds}s left` : 'hover to abort';
  return (
    <button
      type="button"
      data-testid="countdown-chip"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onToggleFreeze}
      style={{ ...base, ...palette }}
    >
      <span>{main}</span>
      <span style={subStyle}>{sub}</span>
    </button>
  );
}
