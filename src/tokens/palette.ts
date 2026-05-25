const BASE = [
  '#00E5FF', // electric cyan
  '#FF7A1A', // TRON orange
  '#FF3FE0', // hot magenta
  '#C5FF3F', // neon lime
  '#FFD93F', // bright yellow
  '#B47FF6', // violet
  '#FF6E6E', // coral red
  '#7FFFD4', // aquamarine
];

const SUB = [
  '#0A7383', // dark cyan
  '#8A3E07', // dark orange
  '#7B1F6C', // dark magenta
  '#5C7600', // dark lime
  '#7B6500', // dark yellow
  '#5A3D7B', // dark violet
  '#7B3535', // dark coral
  '#2D7359', // dark aqua
];

const FALLBACK = '#9CA3AF';

export function colorFor(key: string, keys: string[]): string {
  const idx = keys.indexOf(key);
  if (idx < 0) return FALLBACK;
  const palette = key.endsWith('|sub') ? SUB : BASE;
  return palette[idx % palette.length];
}
