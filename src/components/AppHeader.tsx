import { ClaudeWatchMark } from './ClaudeWatchMark';

/**
 * Full-width app header: brand lockup on the left, two-tone tagline on the right.
 * The tagline colors echo the graph's node-state palette (cyan = active Claude,
 * mint = success/thought).
 */
export function AppHeader() {
  return (
    <header style={styles.bar} data-testid="app-header">
      <span style={styles.brand}>
        <ClaudeWatchMark size={56} />
        <span style={styles.wordmark}>
          CLAUDE<span style={styles.accent}>WATCH</span>
        </span>
      </span>
      <span style={styles.tagline} data-testid="app-tagline">
        <span style={styles.tagWatch}>watch</span>{' '}
        <span style={styles.tagClaude}>claude</span>{' '}
        <span style={styles.tagThink}>think</span>
      </span>
    </header>
  );
}

const styles = {
  bar: {
    flexShrink: 0,
    height: 44,
    // The 56px logo SVG carries blank margins above/below the eye glyph; clip
    // them so the bar hugs the eye instead of the full SVG box.
    overflow: 'hidden' as const,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: '0 18px',
    background: 'rgba(5,8,13,0.95)',
    borderBottom: '1px solid var(--grid)',
  },
  brand: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  wordmark: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 14,
    letterSpacing: 3,
    color: 'var(--edge-trail)', // CLAUDE — cyan, matching the tagline "claude"
  },
  accent: { color: 'var(--node-success)' }, // WATCH — green, matching the eye
  tagline: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 10,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
  },
  // Two-tone tagline: "watch" stays readable-dim, "claude" cyan, "think" mint.
  tagWatch: { color: '#6e93a0' },
  tagClaude: { color: 'var(--edge-trail)' },
  tagThink: { color: 'var(--node-success)' },
};
