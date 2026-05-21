import { useEffect, useState } from 'react';
import type { Milestone } from '../parse/types';

type Props = {
  current: Milestone | null;
  edgeProgress: number;
  inSubagent: boolean;
};

function useTypewriter(text: string, durationMs: number): string {
  const [out, setOut] = useState('');
  useEffect(() => {
    if (!text) { setOut(''); return; }
    setOut('');
    const start = performance.now();
    let raf = 0;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const len = Math.floor(text.length * t);
      setOut(text.slice(0, len));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, durationMs]);
  return out;
}

export function NowPlaying({ current, edgeProgress, inSubagent }: Props) {
  const summaryText = current?.summary ?? '';
  const resultText = edgeProgress >= 0.6 ? (current?.result ?? '') : '';
  const summary = useTypewriter(summaryText, 180);
  const result = useTypewriter(resultText, 220);
  if (!current) return null;
  const failed = current.failed;
  const frameColor = inSubagent ? 'var(--subagent-accent)' : 'var(--edge-idle)';

  return (
    <div style={{
      ...styles.frame,
      borderColor: frameColor,
      boxShadow: inSubagent ? '0 0 24px rgba(157,108,255,0.25)' : 'none',
    }}>
      {inSubagent && (
        <div style={{ ...styles.header, color: 'var(--subagent-accent)' }}>⌥ SUBAGENT</div>
      )}
      <div data-testid="hud-summary" style={{ ...styles.line1, color: failed ? 'var(--node-failed)' : 'var(--edge-trail)' }}>
        {summary || ' '}
      </div>
      <div data-testid="hud-result" style={{ ...styles.line2, color: failed ? 'var(--node-failed)' : 'var(--text-dim)' }}>
        {result || ' '}
      </div>
    </div>
  );
}

const styles = {
  frame: {
    position: 'absolute' as const,
    left: '50%',
    bottom: 80,
    transform: 'translateX(-50%)',
    minWidth: 520,
    maxWidth: '70%',
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid',
    padding: '10px 16px',
    fontFamily: 'ui-monospace, monospace',
    backdropFilter: 'blur(2px)',
  },
  header: { fontSize: 10, letterSpacing: 3, marginBottom: 4 },
  line1: { fontSize: 13, fontWeight: 500, minHeight: 18 },
  line2: { fontSize: 11, minHeight: 16, marginTop: 2 },
};
