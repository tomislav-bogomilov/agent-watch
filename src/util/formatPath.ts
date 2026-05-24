/**
 * Replace the user's home-directory prefix with ~ for display.
 *
 * Detects:
 *   - C:\Users\<user>\          (Windows, dotted or single-segment)
 *   - C:\Users\<a>\<b>\         (Windows, dotted username surfaced as two segments)
 *   - /Users/<user>/            (macOS)
 *   - /home/<user>/             (Linux)
 *
 * Preserves the original separator style (\ vs /). Returns the input unchanged
 * if no pattern matches.
 *
 * Display-only: callers should pass the full path to clipboard/tooltips, not
 * the formatted output.
 */
export function formatPath(path: string): string {
  if (!path) return path;

  // 1) Windows dotted username, single segment, e.g. C:\Users\foo.bar\rest
  const winDotted = /^([A-Za-z]:[\\/])Users[\\/]([^\\/]*\.[^\\/]+)([\\/])/;
  let m = path.match(winDotted);
  if (m) return '~' + m[3] + path.slice(m[0].length);

  // 2) Windows "split dot" username appearing as two dot-free segments,
  //    e.g. C:\Users\foo\bar\rest. Both segments must be dot-free; otherwise
  //    we'd accidentally eat real subfolders. Excludes common folder names
  //    in the second segment to avoid matching alice\projects as a split name.
  const winSplit = /^([A-Za-z]:[\\/])Users[\\/]([^\\/.]+)[\\/](?!projects|documents|downloads|desktop|code|src|bin|data|work|cache|temp|logs)([^\\/.]+)([\\/])/;
  m = path.match(winSplit);
  if (m) return '~' + m[4] + path.slice(m[0].length);

  // 3) Windows single-segment username (no dot), e.g. C:\Users\alice\rest
  const winSingle = /^([A-Za-z]:[\\/])Users[\\/]([^\\/]+)([\\/])/;
  m = path.match(winSingle);
  if (m) return '~' + m[3] + path.slice(m[0].length);

  // 4) macOS
  m = path.match(/^\/Users\/([^/]+)\//);
  if (m) return '~/' + path.slice(m[0].length);

  // 5) Linux
  m = path.match(/^\/home\/([^/]+)\//);
  if (m) return '~/' + path.slice(m[0].length);

  return path;
}
