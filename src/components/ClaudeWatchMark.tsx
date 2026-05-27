import { useId } from 'react';

type Props = {
  /** Rendered width & height in px. */
  size?: number;
  /** When true (default), the sweep arm rotates via the `cw-sweep` CSS class. */
  animated?: boolean;
};

/**
 * "Iris Scan" mark: a green eye (matching the graph's success/Thought color)
 * with a radar sweep arm that rakes the iris, a cyan pupil-node looking back,
 * and one green blip caught on the sweep. Colors come from theme tokens.
 * The sweep arm is clipped to the eye so the beam stays inside the lens as it
 * rotates. Animation (and its reduced-motion opt-out) is defined in index.css.
 */
export function ClaudeWatchMark({ size = 22, animated = true }: Props) {
  const uid = useId();
  const gradId = `cw-grad-${uid}`;
  const clipId = `cw-eye-clip-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 0 4px rgba(127,255,212,0.6))', display: 'block' }}
    >
      <defs>
        <linearGradient id={gradId} x1="32" y1="32" x2="58" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--node-success)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--node-success)" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clipId}>
          <path d="M5 32 Q32 8 59 32 Q32 56 5 32 Z" />
        </clipPath>
      </defs>

      {/* Static eye + pupil ring (green) */}
      <path d="M5 32 Q32 8 59 32 Q32 56 5 32 Z" fill="none" stroke="var(--node-success)" strokeWidth="2" />
      <circle cx="32" cy="32" r="8.5" fill="none" stroke="var(--node-success)" strokeWidth="1.5" strokeOpacity="0.55" />

      {/* Rotating green sweep arm, clipped to the eye */}
      <g
        data-testid="cw-sweep-arm"
        className={animated ? 'cw-sweep' : undefined}
        clipPath={`url(#${clipId})`}
      >
        <path d="M32 32 L58 32 A26 26 0 0 0 54 22 Z" fill={`url(#${gradId})`} />
        <line x1="32" y1="32" x2="58" y2="32" stroke="var(--node-success)" strokeWidth="1.8" />
      </g>

      {/* Static green blip + cyan pupil node (drawn on top) */}
      <circle cx="47" cy="28" r="2.8" fill="var(--node-success)" />
      <circle cx="32" cy="32" r="3.4" fill="var(--edge-trail)" />
    </svg>
  );
}
