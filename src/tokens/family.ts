export type Family = 'all' | 'opus' | 'sonnet' | 'haiku';
export type ModelFamily = Exclude<Family, 'all'>;

export function familyOf(modelId: string): ModelFamily | null {
  const m = modelId.match(/^claude-(opus|sonnet|haiku)-/i);
  return m ? (m[1].toLowerCase() as ModelFamily) : null;
}
