import { describe, expect, it } from 'vitest';
import { parseStructured } from './structured.js';

describe('parseStructured', () => {
  it('should throw for invalid JSON', () => {
    expect(() => parseStructured('not json')).toThrow('Invalid JSON');
  });

  it('should return empty array for empty JSON array', () => {
    expect(parseStructured('[]')).toEqual([]);
  });

  it('should parse a single object', () => {
    const json = JSON.stringify({ id: 1, name: 'test', value: 42 });
    const chunks = parseStructured(json);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunk_id).toBe('chunk_000');
    expect(chunks[0].position).toBe(0);
    expect(chunks[0].metadata.source_format).toBe('structured');
    expect(JSON.parse(chunks[0].content)).toEqual({
      id: 1,
      name: 'test',
      value: 42,
    });
  });

  it('should parse an array of objects', () => {
    const data = [
      { id: 1, type: 'event', message: 'login' },
      { id: 2, type: 'event', message: 'logout' },
      { id: 3, type: 'event', message: 'error' },
    ];
    const chunks = parseStructured(JSON.stringify(data));

    expect(chunks).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(chunks[i].chunk_id).toBe(`chunk_${i.toString().padStart(3, '0')}`);
      expect(chunks[i].position).toBe(i);
      expect(chunks[i].metadata.source_format).toBe('structured');
    }
  });

  it('should preserve record fields in metadata', () => {
    const json = JSON.stringify({ id: 1, name: 'Alice', score: 95 });
    const chunks = parseStructured(json);

    expect(chunks[0].metadata).toMatchObject({
      source_format: 'structured',
      name: 'Alice',
      score: 95,
    });
  });

  it('should skip nested objects and arrays in metadata', () => {
    const json = JSON.stringify({
      id: 1,
      name: 'test',
      nested: { a: 1 },
      tags: ['foo'],
    });
    const chunks = parseStructured(json);

    expect(chunks[0].metadata).toMatchObject({
      source_format: 'structured',
      name: 'test',
    });
    expect(
      (chunks[0].metadata as unknown as Record<string, unknown>).nested,
    ).toBeUndefined();
    expect(
      (chunks[0].metadata as unknown as Record<string, unknown>).tags,
    ).toBeUndefined();
  });

  it('should not let record override source_format', () => {
    const json = JSON.stringify({ source_format: 'hacked', name: 'test' });
    const chunks = parseStructured(json);
    expect(chunks[0].metadata.source_format).toBe('structured');
  });

  it('should skip primitive array entries', () => {
    const json = JSON.stringify([{ id: 1 }, 'string', 42, null, { id: 2 }]);
    const chunks = parseStructured(json);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].position).toBe(0);
    expect(chunks[1].position).toBe(1);
  });

  it('should pretty-print JSON in chunk content', () => {
    const json = JSON.stringify({ a: 1, b: 2 });
    const chunks = parseStructured(json);
    expect(chunks[0].content).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  it('should handle log-style data', () => {
    const logs = [
      { timestamp: '2024-01-01T00:00:00Z', level: 'INFO', message: 'started' },
      { timestamp: '2024-01-01T00:01:00Z', level: 'ERROR', message: 'failed' },
    ];
    const chunks = parseStructured(JSON.stringify(logs));

    expect(chunks).toHaveLength(2);
    expect(chunks[0].metadata).toMatchObject({
      timestamp: '2024-01-01T00:00:00Z',
      level: 'INFO',
      message: 'started',
    });
  });
});
