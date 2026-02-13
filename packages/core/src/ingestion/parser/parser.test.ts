import { describe, expect, it } from 'vitest';
import { parse } from './index.js';

describe('parse (router)', () => {
  const conversationJson = JSON.stringify([
    { speaker: 'Alice', text: 'Hello' },
    { speaker: 'Bob', text: 'Hi there' },
  ]);

  it('should auto-detect and parse conversation JSON', () => {
    const chunks = parse(conversationJson);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].metadata.source_format).toBe('conversation');
  });

  it('should parse with explicit conversation format', () => {
    const chunks = parse(conversationJson, 'conversation');
    expect(chunks).toHaveLength(2);
  });

  it('should auto-detect when format is "auto"', () => {
    const chunks = parse(conversationJson, 'auto');
    expect(chunks).toHaveLength(2);
  });

  it('should throw for text format (Phase 2 stub)', () => {
    expect(() => parse('plain text content', 'text')).toThrow(
      'Not implemented: text parser',
    );
  });

  it('should throw for structured format (Phase 2 stub)', () => {
    const structured = JSON.stringify([{ id: 1, value: 'data' }]);
    expect(() => parse(structured, 'structured')).toThrow(
      'Not implemented: structured parser',
    );
  });

  it('should auto-detect plain text and throw Phase 2 stub', () => {
    expect(() => parse('Just some plain text.')).toThrow(
      'Not implemented: text parser',
    );
  });
});
