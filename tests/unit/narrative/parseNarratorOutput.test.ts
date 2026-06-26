import { describe, it, expect } from 'vitest';
import { parseBlocks, extractResult, parseNarratorOutput } from '../../../server/narrator';

const okBlock = {
  id: 'b1', phase: 'Explore', title: 'Explore the codebase',
  summary: 'Scanned src/, found routing in match.ts', status: 'completed',
  startMilestoneId: 'm1', endMilestoneId: 'm4',
};

describe('parseBlocks', () => {
  it('parses a bare JSON array', () => {
    const out = parseBlocks(JSON.stringify([okBlock]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'b1', phase: 'Explore', status: 'completed' });
  });

  it('parses JSON wrapped in a ```json fence with prose around it', () => {
    const text = 'Here you go:\n```json\n' + JSON.stringify([okBlock]) + '\n```\nDone.';
    expect(parseBlocks(text)).toHaveLength(1);
  });

  it('accepts a {blocks:[...]} envelope', () => {
    expect(parseBlocks(JSON.stringify({ blocks: [okBlock] }))).toHaveLength(1);
  });

  it('drops invalid entries but keeps valid ones', () => {
    const out = parseBlocks(JSON.stringify([okBlock, { id: 'x' }]));
    expect(out.map((b) => b.id)).toEqual(['b1']);
  });

  it('defaults phase to title and status to completed when missing', () => {
    const { phase: _p, status: _s, ...noPhase } = okBlock;
    const out = parseBlocks(JSON.stringify([noPhase]));
    expect(out[0].phase).toBe('Explore the codebase');
    expect(out[0].status).toBe('completed');
  });

  it('throws when no JSON array can be recovered', () => {
    expect(() => parseBlocks('totally not json')).toThrow();
  });

  it('throws when the array parses but every entry is invalid', () => {
    expect(() => parseBlocks(JSON.stringify([{ id: 'x' }]))).toThrow();
  });
});

describe('extractResult', () => {
  it('pulls result text and session_id from the claude -p json envelope', () => {
    const envelope = JSON.stringify({ type: 'result', result: '[]', session_id: 'sess-123' });
    expect(extractResult(envelope)).toEqual({ text: '[]', sessionId: 'sess-123' });
  });
  it('falls back to raw stdout when not an envelope', () => {
    expect(extractResult('[{"x":1}]')).toEqual({ text: '[{"x":1}]', sessionId: null });
  });

  it('returns null sessionId when session_id is not a string', () => {
    const envelope = JSON.stringify({ result: '[]', session_id: 42 });
    expect(extractResult(envelope)).toEqual({ text: '[]', sessionId: null });
  });
});

describe('parseNarratorOutput', () => {
  it('combines extract + parse', () => {
    const envelope = JSON.stringify({ result: JSON.stringify([okBlock]), session_id: 's9' });
    const { blocks, sessionId } = parseNarratorOutput(envelope);
    expect(sessionId).toBe('s9');
    expect(blocks).toHaveLength(1);
  });
});
