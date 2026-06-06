// Returns a humanized display label for a Claude Code model id.
// claude-opus-4-7        → "Opus 4.7"
// claude-sonnet-4-6      → "Sonnet 4.6"
// claude-haiku-4-5-202…  → "Haiku 4.5"
// unknown                → modelId  (raw)
export function modelLabel(modelId: string): string {
  const m = modelId.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/i);
  if (!m) return modelId;
  const family = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  return `${family} ${m[2]}.${m[3]}`;
}

// Display label for a chart/series key ('<modelId>' or '<modelId>|sub').
export function modelKeyLabel(k: string): string {
  return `${modelLabel(k.replace(/\|sub$/, ''))}${k.endsWith('|sub') ? ' · sub' : ''}`;
}
