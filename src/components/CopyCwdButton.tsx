import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

type Props = {
  value: string;
};

const FLASH_MS = 1200;

export function CopyCwdButton({ value }: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  async function onClick(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard may reject (no permission, no secure context). Treat as a
      // silent no-op — we don't surface failure for a polish affordance.
      return;
    }
    setCopied(true);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, FLASH_MS);
  }

  const style: CSSProperties = {
    background: 'transparent',
    border: `1px solid ${copied ? 'var(--edge-trail)' : 'var(--edge-idle)'}`,
    color: copied ? 'var(--edge-trail)' : 'var(--text-dim)',
    width: 18,
    height: 18,
    fontSize: 11,
    lineHeight: '16px',
    fontFamily: 'ui-monospace, monospace',
    cursor: 'pointer',
    padding: 0,
    marginLeft: 6,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'border-color 120ms ease, color 120ms ease',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="header-copy-cwd"
      title={copied ? 'copied' : 'copy path'}
      aria-label={copied ? 'copied' : 'copy path'}
      style={style}
    >{copied ? '✓' : '⧉'}</button>
  );
}
