const BASE = [
  '#00E5FF', // cyan (matches --edge-trail accent)
  '#FF4FD8', // magenta
  '#FFB547', // amber
  '#5BE6B5', // mint
  '#B47FF6', // violet
  '#FF6E6E', // coral
  '#7FE0FF', // pale cyan
  '#E5E07F', // pale gold
];

const SUB = [
  '#0A7383',
  '#7B2967',
  '#7B5921',
  '#2D7359',
  '#5A3D7B',
  '#7B3535',
  '#3F7283',
  '#73703F',
];

const FALLBACK = '#9CA3AF';

export function colorFor(key: string, keys: string[]): string {
  const idx = keys.indexOf(key);
  if (idx < 0) return FALLBACK;
  const palette = key.endsWith('|sub') ? SUB : BASE;
  return palette[idx % palette.length];
}
