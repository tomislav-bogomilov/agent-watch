export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) {
    const k = n / 1000;
    const rounded = Math.round(k * 10) / 10;
    if (rounded >= 10) return `${Math.round(rounded)}k`;
    return `${rounded.toFixed(1)}k`;
  }
  if (n < 1_000_000) {
    return `${Math.round(n / 1000)}k`;
  }
  const m = n / 1_000_000;
  const rounded = Math.round(m * 10) / 10;
  return `${rounded.toFixed(1)}M`;
}
