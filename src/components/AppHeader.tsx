import { ClaudeWatchMark } from './ClaudeWatchMark';

/** Full-width app header: brand lockup on the left, dim tagline on the right. */
export function AppHeader() {
  return (
    <header style={styles.bar} data-testid="app-header">
      <span style={styles.brand}>
        <ClaudeWatchMark size={22} />
        <span style={styles.wordmark}>
          CLAUDE<span style={styles.accent}>WATCH</span>
        </span>
      </span>
      <span style={styles.tagline}>watch claude think</span>
    </header>
  );
}

const styles = {
  bar: {
    flexShrink: 0,
    height: 40,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: '0 16px',
    background: 'rgba(5,8,13,0.95)',
    borderBottom: '1px solid var(--grid)',
  },
  brand: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 9,
  },
  wordmark: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 14,
    letterSpacing: 3,
    color: 'var(--text)',
  },
  accent: { color: 'var(--edge-trail)' },
  tagline: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: 'var(--text-dim)',
  },
};
