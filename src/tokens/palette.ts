const BASE = [
  '#00E5FF', // bright cyan (Opus tier — assigned to highest-spend model)
  '#7FFFD4', // aquamarine
  '#B7F5EE', // pale teal
  '#3FE5F4', // mid cyan
  '#5EFFE6', // mid aqua
  '#9FD8E8', // soft cyan
  '#C8F7F2', // very pale
  '#67E1D0', // teal-mint
];

const SUB = [
  '#0A7383', // darker cyan
  '#2E8576', // darker aqua
  '#4E8580', // darker teal
  '#0F6B79', // darker mid-cyan
  '#3D8A7D', // darker mid-aqua
  '#4A6F7A', // darker soft cyan
  '#577B78', // darker pale
  '#356E66', // darker teal-mint
];

const FALLBACK = '#9CA3AF';

export function colorFor(key: string, keys: string[]): string {
  const idx = keys.indexOf(key);
  if (idx < 0) return FALLBACK;
  const palette = key.endsWith('|sub') ? SUB : BASE;
  return palette[idx % palette.length];
}
