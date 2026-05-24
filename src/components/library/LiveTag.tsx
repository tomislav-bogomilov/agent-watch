import type { CSSProperties } from 'react';

const styles: Record<string, CSSProperties> = {
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: '1px solid rgba(0,229,255,0.45)',
    padding: '1px 6px 1px 5px',
    color: '#00e5ff',
    letterSpacing: 2,
    fontSize: 9,
    fontFamily: 'ui-monospace, monospace',
    textShadow: '0 0 6px rgba(0,229,255,0.6)',
    boxShadow: '0 0 6px rgba(0,229,255,0.18) inset',
    lineHeight: 1,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: '#00e5ff',
    boxShadow: '0 0 6px #00e5ff, 0 0 10px #00e5ff',
    animation: 'livePulse 1.4s ease-in-out infinite',
  },
};

export function LiveTag() {
  return (
    <span data-testid="live-tag" style={styles.tag}>
      <span data-testid="live-tag-dot" style={styles.dot} />
      LIVE
    </span>
  );
}
