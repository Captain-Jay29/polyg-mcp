import { describe, expect, it } from 'vitest';
import { looksLikeConversation, parseConversation } from './conversation.js';

describe('parseConversation', () => {
  describe('LoCoMo format', () => {
    const locomoData = [
      {
        speaker: 'Alice',
        text: 'Hey, how are you?',
        timestamp: '2024-01-15T10:00:00Z',
        turn_id: 0,
      },
      {
        speaker: 'Bob',
        text: 'Doing great! Just got back from vacation.',
        timestamp: '2024-01-15T10:01:00Z',
        turn_id: 1,
      },
      {
        speaker: 'Alice',
        text: 'Where did you go?',
        timestamp: '2024-01-15T10:02:00Z',
        turn_id: 2,
      },
    ];

    it('should parse LoCoMo turns into chunks', () => {
      const chunks = parseConversation(JSON.stringify(locomoData));

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({
        chunk_id: 'chunk_000',
        content: 'Alice: Hey, how are you?',
        position: 0,
        metadata: {
          source_format: 'conversation',
          timestamp: '2024-01-15T10:00:00Z',
          speaker: 'Alice',
          turn_index: 0,
        },
      });
      expect(chunks[1].metadata.speaker).toBe('Bob');
      expect(chunks[2].position).toBe(2);
    });

    it('should preserve timestamps from LoCoMo data', () => {
      const chunks = parseConversation(JSON.stringify(locomoData));

      expect(chunks[0].metadata.timestamp).toBe('2024-01-15T10:00:00Z');
      expect(chunks[1].metadata.timestamp).toBe('2024-01-15T10:01:00Z');
    });

    it('should use turn_id as turn_index', () => {
      const chunks = parseConversation(JSON.stringify(locomoData));

      expect(chunks[0].metadata.turn_index).toBe(0);
      expect(chunks[1].metadata.turn_index).toBe(1);
    });
  });

  describe('generic chat format', () => {
    const chatData = [
      { role: 'user', content: 'What is the weather today?' },
      {
        role: 'assistant',
        content: 'It is sunny with a high of 75F.',
      },
    ];

    it('should parse generic chat turns', () => {
      const chunks = parseConversation(JSON.stringify(chatData));

      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toBe('user: What is the weather today?');
      expect(chunks[0].metadata.speaker).toBe('user');
      expect(chunks[1].content).toBe(
        'assistant: It is sunny with a high of 75F.',
      );
    });

    it('should handle "message" field as fallback', () => {
      const data = [{ role: 'user', message: 'Hello' }];
      const chunks = parseConversation(JSON.stringify(data));

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('user: Hello');
    });
  });

  describe('edge cases', () => {
    it('should return empty array for empty JSON array', () => {
      const chunks = parseConversation('[]');
      expect(chunks).toHaveLength(0);
    });

    it('should skip turns without text content', () => {
      const data = [
        { speaker: 'Alice', text: 'Hello' },
        { speaker: 'Bob' }, // no text
        { speaker: 'Alice', text: 'Bye' },
      ];
      const chunks = parseConversation(JSON.stringify(data));

      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toBe('Alice: Hello');
      expect(chunks[1].content).toBe('Alice: Bye');
      // Positions should be sequential with no gaps
      expect(chunks[0].position).toBe(0);
      expect(chunks[1].position).toBe(1);
    });

    it('should skip non-object entries', () => {
      const data = [
        { speaker: 'Alice', text: 'Hello' },
        'not an object',
        42,
        null,
        { speaker: 'Bob', text: 'Hi' },
      ];
      const chunks = parseConversation(JSON.stringify(data));

      expect(chunks).toHaveLength(2);
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseConversation('not json')).toThrow('Invalid JSON');
    });

    it('should throw on non-array JSON', () => {
      expect(() => parseConversation('{"key": "value"}')).toThrow(
        'expected a JSON array',
      );
    });

    it('should handle turns without speaker', () => {
      const data = [{ text: 'Anonymous message' }];
      const chunks = parseConversation(JSON.stringify(data));

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('Anonymous message');
      expect(chunks[0].metadata.speaker).toBeUndefined();
    });

    it('should omit timestamp from metadata when not present', () => {
      const data = [{ speaker: 'Alice', text: 'Hello' }];
      const chunks = parseConversation(JSON.stringify(data));

      expect(chunks[0].metadata.timestamp).toBeUndefined();
    });

    it('should generate padded chunk IDs', () => {
      const data = Array.from({ length: 15 }, (_, i) => ({
        speaker: 'User',
        text: `Message ${i}`,
      }));
      const chunks = parseConversation(JSON.stringify(data));

      expect(chunks[0].chunk_id).toBe('chunk_000');
      expect(chunks[9].chunk_id).toBe('chunk_009');
      expect(chunks[14].chunk_id).toBe('chunk_014');
    });
  });
});

describe('looksLikeConversation', () => {
  it('should detect LoCoMo format', () => {
    const data = [
      { speaker: 'Alice', text: 'Hello' },
      { speaker: 'Bob', text: 'Hi' },
    ];
    expect(looksLikeConversation(data)).toBe(true);
  });

  it('should detect generic chat format', () => {
    const data = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];
    expect(looksLikeConversation(data)).toBe(true);
  });

  it('should reject non-conversation arrays', () => {
    const data = [
      { id: 1, value: 'foo' },
      { id: 2, value: 'bar' },
    ];
    expect(looksLikeConversation(data)).toBe(false);
  });

  it('should reject empty arrays', () => {
    expect(looksLikeConversation([])).toBe(false);
  });

  it('should reject non-arrays', () => {
    expect(looksLikeConversation('hello')).toBe(false);
    expect(looksLikeConversation(42)).toBe(false);
    expect(looksLikeConversation(null)).toBe(false);
  });

  it('should handle mixed arrays (majority rule)', () => {
    const data = [
      { speaker: 'Alice', text: 'Hello' },
      { speaker: 'Bob', text: 'Hi' },
      { id: 1, value: 'not a turn' },
    ];
    // 2/3 have speaker -> majority
    expect(looksLikeConversation(data)).toBe(true);
  });
});
