import type { LLMProvider } from '@polyg-mcp/shared';
import { describe, expect, it, vi } from 'vitest';
import type { LoCoMoConversation, LoCoMoSession } from '../types.js';
import {
  buildFullContextPrompt,
  createFullContextRecall,
  formatConversation,
} from './full-context.js';

function makeMockLLM(response: string): LLMProvider {
  return { complete: vi.fn().mockResolvedValue(response) };
}

function makeSessions(): LoCoMoSession[] {
  return [
    {
      date_time: '2024-01-01',
      speaker_a: 'Alice',
      speaker_b: 'Bob',
      turns: [
        { speaker: 'Alice', dia_id: 't1', text: 'Hello Bob' },
        { speaker: 'Bob', dia_id: 't2', text: 'Hi Alice' },
      ],
    },
  ];
}

function makeConversation(sessions?: LoCoMoSession[]): LoCoMoConversation {
  return {
    conversation_id: 'conv_1',
    sessions: sessions ?? makeSessions(),
    questions: [
      {
        question: 'What did Alice say?',
        answer: 'Hello Bob',
        category: 'single-hop',
        evidence: [],
      },
    ],
  };
}

describe('formatConversation', () => {
  it('formats turns with date and speaker', () => {
    const result = formatConversation(makeSessions());
    expect(result).toContain('[2024-01-01] Alice: Hello Bob');
    expect(result).toContain('[2024-01-01] Bob: Hi Alice');
  });

  it('handles multiple sessions', () => {
    const sessions: LoCoMoSession[] = [
      ...makeSessions(),
      {
        date_time: '2024-01-02',
        speaker_a: 'Alice',
        speaker_b: 'Bob',
        turns: [{ speaker: 'Alice', dia_id: 't3', text: 'Good morning' }],
      },
    ];
    const result = formatConversation(sessions);
    expect(result).toContain('[2024-01-01] Alice: Hello Bob');
    expect(result).toContain('[2024-01-02] Alice: Good morning');
  });
});

describe('buildFullContextPrompt', () => {
  it('includes conversation and question', () => {
    const prompt = buildFullContextPrompt(
      'some conversation',
      'What happened?',
    );
    expect(prompt).toContain('some conversation');
    expect(prompt).toContain('What happened?');
  });
});

describe('createFullContextRecall', () => {
  it('passes conversation text to LLM', async () => {
    const llm = makeMockLLM('answer');
    const recall = createFullContextRecall(makeConversation(), llm);
    await recall('What did Alice say?');
    const callArg = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.prompt).toContain('[2024-01-01] Alice: Hello Bob');
  });

  it('passes question to LLM', async () => {
    const llm = makeMockLLM('answer');
    const recall = createFullContextRecall(makeConversation(), llm);
    await recall('What did Alice say?');
    const callArg = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.prompt).toContain('What did Alice say?');
  });

  it('returns answer from LLM', async () => {
    const llm = makeMockLLM('Hello Bob');
    const recall = createFullContextRecall(makeConversation(), llm);
    const result = await recall('What did Alice say?');
    expect(result.answer).toBe('Hello Bob');
  });

  it('returns confidence 1.0', async () => {
    const llm = makeMockLLM('answer');
    const recall = createFullContextRecall(makeConversation(), llm);
    const result = await recall('What did Alice say?');
    expect(result.confidence).toBe(1.0);
  });

  it('uses text responseFormat', async () => {
    const llm = makeMockLLM('answer');
    const recall = createFullContextRecall(makeConversation(), llm);
    await recall('What did Alice say?');
    expect(llm.complete).toHaveBeenCalledWith(
      expect.objectContaining({ responseFormat: 'text' }),
    );
  });
});
