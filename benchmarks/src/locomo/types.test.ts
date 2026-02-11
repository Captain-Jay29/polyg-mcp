import { describe, expect, it } from 'vitest';
import { parseLoCoMoDataset } from './types.js';

function makeValidDataset() {
  return [
    {
      conversation: {
        session_1: {
          session_1_date_time: '8 May 2023, 1:56 pm',
          1: { speaker: 'Alice', dia_id: 's1_d1', text: 'Hello!' },
          2: { speaker: 'Bob', dia_id: 's1_d2', text: 'Hi there!' },
        },
        session_2: {
          session_2_date_time: '10 May 2023, 3:00 pm',
          1: { speaker: 'Alice', dia_id: 's2_d1', text: 'How are you?' },
          2: { speaker: 'Bob', dia_id: 's2_d2', text: 'Great!' },
        },
      },
      qa: [
        {
          question: 'What did Alice say first?',
          answer: 'Hello!',
          category: 'single-hop',
          evidence: ['s1_d1'],
        },
        {
          question: 'When was the first session?',
          answer: '8 May 2023',
          category: 'temporal',
          evidence: ['s1_d1'],
        },
      ],
    },
  ];
}

describe('parseLoCoMoDataset', () => {
  it('parses a valid dataset', () => {
    const result = parseLoCoMoDataset(makeValidDataset());
    expect(result).toHaveLength(1);
    expect(result[0].conversation_id).toBe('conversation_0');
    expect(result[0].sessions).toHaveLength(2);
    expect(result[0].questions).toHaveLength(2);
  });

  it('correctly maps session fields', () => {
    const result = parseLoCoMoDataset(makeValidDataset());
    const session = result[0].sessions[0];
    expect(session.date_time).toBe('8 May 2023, 1:56 pm');
    expect(session.speaker_a).toBe('Alice');
    expect(session.speaker_b).toBe('Bob');
    expect(session.turns).toHaveLength(2);
    expect(session.turns[0].dia_id).toBe('s1_d1');
  });

  it('correctly maps question categories', () => {
    const result = parseLoCoMoDataset(makeValidDataset());
    expect(result[0].questions[0].category).toBe('single-hop');
    expect(result[0].questions[1].category).toBe('temporal');
  });

  it('handles case-insensitive categories', () => {
    const data = makeValidDataset();
    data[0].qa[0].category = 'Single-Hop';
    const result = parseLoCoMoDataset(data);
    expect(result[0].questions[0].category).toBe('single-hop');
  });

  it('rejects non-array input', () => {
    expect(() => parseLoCoMoDataset('not an array')).toThrow(
      'must be an array',
    );
  });

  it('rejects empty array', () => {
    expect(() => parseLoCoMoDataset([])).toThrow('must not be empty');
  });

  it('rejects entry without conversation field', () => {
    expect(() => parseLoCoMoDataset([{ qa: [] }])).toThrow(
      "missing or invalid 'conversation'",
    );
  });

  it('rejects entry without qa field', () => {
    expect(() =>
      parseLoCoMoDataset([
        {
          conversation: {
            session_1: { 1: { speaker: 'A', dia_id: 'd1', text: 'hi' } },
          },
        },
      ]),
    ).toThrow("missing or invalid 'qa'");
  });

  it('rejects invalid question category', () => {
    const data = makeValidDataset();
    data[0].qa[0].category = 'invalid-category';
    expect(() => parseLoCoMoDataset(data)).toThrow('invalid category');
  });

  it('preserves evidence arrays', () => {
    const result = parseLoCoMoDataset(makeValidDataset());
    expect(result[0].questions[0].evidence).toEqual(['s1_d1']);
  });
});
