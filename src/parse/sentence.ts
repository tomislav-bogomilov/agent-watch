export function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  const match = trimmed.match(/^([^.!?]+)[.!?](?:\s|$)/);
  if (match) return match[1].trim();
  return trimmed.slice(0, 160);
}
