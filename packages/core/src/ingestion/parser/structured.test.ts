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

  it('should route standard fields to metadata and non-standard to extra', () => {
    const json = JSON.stringify({
      timestamp: '2024-01-01T00:00:00Z',
      speaker: 'Alice',
      id: 1,
      score: 95,
    });
    const chunks = parseStructured(json);

    expect(chunks[0].metadata.source_format).toBe('structured');
    expect(chunks[0].metadata.timestamp).toBe('2024-01-01T00:00:00Z');
    expect(chunks[0].metadata.speaker).toBe('Alice');
    expect(chunks[0].metadata.extra).toEqual({ id: 1, score: 95 });
  });

  it('should omit extra when no non-standard fields exist', () => {
    const json = JSON.stringify({ timestamp: '2024-01-01T00:00:00Z' });
    const chunks = parseStructured(json);

    expect(chunks[0].metadata.extra).toBeUndefined();
  });

  it('should skip nested objects and arrays in metadata', () => {
    const json = JSON.stringify({
      id: 1,
      name: 'test',
      nested: { a: 1 },
      tags: ['foo'],
    });
    const chunks = parseStructured(json);

    expect(chunks[0].metadata.extra).toEqual({ id: 1, name: 'test' });
    expect(chunks[0].metadata.extra?.nested).toBeUndefined();
    expect(chunks[0].metadata.extra?.tags).toBeUndefined();
  });

  it('should coerce booleans to strings in extra metadata', () => {
    const json = JSON.stringify({ active: true, enabled: false, name: 'test' });
    const chunks = parseStructured(json);

    expect(chunks[0].metadata.extra).toEqual({
      active: 'true',
      enabled: 'false',
      name: 'test',
    });
  });

  it('should truncate oversized record content', () => {
    const largeRecord = { data: 'x'.repeat(10000) };
    const chunks = parseStructured(JSON.stringify(largeRecord));

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content.length).toBeLessThan(10000);
    expect(chunks[0].content).toContain('... [truncated]');
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
    expect(chunks[0].metadata.timestamp).toBe('2024-01-01T00:00:00Z');
    expect(chunks[0].metadata.extra).toEqual({
      level: 'INFO',
      message: 'started',
    });
  });
});
