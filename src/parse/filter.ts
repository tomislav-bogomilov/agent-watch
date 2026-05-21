import type { RawEvent, RawContentBlock } from './types';

const NOISE_TYPES = new Set([
  'file-history-snapshot',
  'attachment',
  'system',
  'last-prompt',
  'permission-mode',
  'ai-title',
  'queue-operation',
]);
const COMMAND_WRAPPER_RX = /<command-(name|message|args)>/;
const LOCAL_CAVEAT_RX = /<local-command-(caveat|stdout|stderr)>/;

function contentToString(content: string | RawContentBlock[] | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
}

function isCommandWrapperUser(ev: RawEvent): boolean {
  if (ev.type !== 'user' || !ev.message) return false;
  const text = contentToString(ev.message.content);
  return COMMAND_WRAPPER_RX.test(text) || LOCAL_CAVEAT_RX.test(text);
}

function isEmptyAssistant(ev: RawEvent): boolean {
  if (ev.type !== 'assistant' || !ev.message) return false;
  const c = ev.message.content;
  if (typeof c === 'string') return c.trim() === '';
  if (Array.isArray(c)) return c.length === 0;
  return true;
}

export function filterNoise(events: RawEvent[]): RawEvent[] {
  return events.filter((ev) => {
    if (NOISE_TYPES.has(ev.type)) return false;
    if (ev.isMeta === true) return false;
    if (isCommandWrapperUser(ev)) return false;
    if (isEmptyAssistant(ev)) return false;
    return true;
  });
}
