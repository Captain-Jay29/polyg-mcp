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

  it('should parse plain text with explicit format', () => {
    const chunks = parse('plain text content', 'text');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.source_format).toBe('text');
    expect(chunks[0].content).toBe('plain text content');
  });

  it('should parse structured JSON with explicit format', () => {
    const structured = JSON.stringify([{ id: 1, value: 'data' }]);
    const chunks = parse(structured, 'structured');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.source_format).toBe('structured');
  });

  it('should auto-detect plain text', () => {
    const chunks = parse('Just some plain text.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.source_format).toBe('text');
  });

  it('should auto-detect structured JSON (non-conversation array)', () => {
    const data = JSON.stringify([{ id: 1, value: 'test' }]);
    const chunks = parse(data);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.source_format).toBe('structured');
  });

  it('should auto-detect structured JSON (single object)', () => {
    const data = JSON.stringify({ name: 'config', version: 2 });
    const chunks = parse(data);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.source_format).toBe('structured');
  });
});
