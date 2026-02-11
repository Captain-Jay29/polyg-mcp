import { describe, expect, it } from 'vitest';
import {
  buildExtractionPrompt,
  ExtractionResultSchema,
} from './extraction-prompt.js';
import type { LoCoMoConversation } from './types.js';

function makeConversation(): LoCoMoConversation {
  return {
    conversation_id: 'test_conv_0',
    sessions: [
      {
        date_time: '2023-05-08T13:56:00Z',
        speaker_a: 'Alice',
        speaker_b: 'Bob',
        turns: [
          { speaker: 'Alice', dia_id: 'd1', text: 'Hey Bob, how are you?' },
          { speaker: 'Bob', dia_id: 'd2', text: 'Good! I started a new job.' },
        ],
      },
    ],
    questions: [],
  };
}

describe('buildExtractionPrompt', () => {
  it('returns non-empty system and user strings', () => {
    const { system, user } = buildExtractionPrompt(makeConversation());
    expect(system.length).toBeGreaterThan(0);
    expect(user.length).toBeGreaterThan(0);
  });

  it('system prompt mentions all 5 extraction types', () => {
    const { system } = buildExtractionPrompt(makeConversation());
    expect(system).toContain('entities');
    expect(system).toContain('events');
    expect(system).toContain('facts');
    expect(system).toContain('causal_links');
    expect(system).toContain('concepts');
  });

  it('system prompt mentions JSON output format', () => {
    const { system } = buildExtractionPrompt(makeConversation());
    expect(system).toContain('JSON');
  });

  it('user prompt includes conversation text', () => {
    const { user } = buildExtractionPrompt(makeConversation());
    expect(user).toContain('Hey Bob, how are you?');
    expect(user).toContain('I started a new job.');
  });

  it('user prompt includes session date', () => {
    const { user } = buildExtractionPrompt(makeConversation());
    expect(user).toContain('2023-05-08T13:56:00Z');
  });
});

describe('ExtractionResultSchema', () => {
  it('validates a well-formed extraction result', () => {
    const valid = {
      entities: [{ name: 'Alice', entity_type: 'person' }],
      events: [
        {
          description: 'Alice met Bob',
          occurred_at: '2023-05-08T14:00:00Z',
          entities: ['Alice', 'Bob'],
        },
      ],
      facts: [
        {
          subject: 'Alice',
          predicate: 'works_at',
          object: 'Acme Corp',
          valid_from: '2023-01-01T00:00:00Z',
        },
      ],
      causal_links: [
        {
          cause: 'Alice got promoted',
          effect: 'Alice moved to new city',
          confidence: 0.8,
          entities: ['Alice'],
        },
      ],
      concepts: [{ name: 'career change', description: 'Job transitions' }],
    };

    const result = ExtractionResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('validates minimal extraction (empty arrays)', () => {
    const minimal = {
      entities: [],
      events: [],
      facts: [],
      causal_links: [],
      concepts: [],
    };

    const result = ExtractionResultSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const missing = {
      entities: [{ name: 'Alice' }], // missing entity_type
      events: [],
      facts: [],
      causal_links: [],
      concepts: [],
    };

    const result = ExtractionResultSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it('rejects confidence outside [0,1]', () => {
    const bad = {
      entities: [],
      events: [],
      facts: [],
      causal_links: [{ cause: 'a', effect: 'b', confidence: 1.5 }],
      concepts: [],
    };

    const result = ExtractionResultSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
