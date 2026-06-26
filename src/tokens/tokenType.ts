export const TOKEN_TYPE_KEYS = ['input', 'output', 'cacheRead', 'cacheWrite'] as const;
export type TokenType = (typeof TOKEN_TYPE_KEYS)[number];

export const TOKEN_TYPE_LABELS: Record<TokenType, string> = {
  input: 'Input',
  output: 'Output',
  cacheRead: 'Cache Read',
  cacheWrite: 'Cache Write',
};

export const TOKEN_TYPE_COLORS: Record<TokenType, string> = {
  input: '#00E5FF',
  output: '#7FFFD4',
  cacheRead: '#B47FF6',
  cacheWrite: '#FF7A1A',
};

export function tokenTypeLabel(k: string): string {
  return TOKEN_TYPE_LABELS[k as TokenType] ?? k;
}

export function tokenTypeColor(k: string): string {
  return TOKEN_TYPE_COLORS[k as TokenType] ?? '#9CA3AF';
}
