import type { EmbeddingProvider, LLMProvider } from '@polyg-mcp/shared';
import { describe, expect, it, vi } from 'vitest';
import type { LoCoMoConversation, LoCoMoSession } from '../types.js';
import {
  buildRagPrompt,
  chunkConversation,
  createVectorRagRecall,
} from './vector-rag.js';

/** Deterministic hash-based embedding: 3 dimensions, normalized. */
function hashEmbed(text: string): number[] {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  const raw = [
    Math.sin(h) * 0.5 + 0.5,
    Math.cos(h) * 0.5 + 0.5,
    Math.sin(h * 2) * 0.5 + 0.5,
  ];
  const mag = Math.sqrt(raw[0] ** 2 + raw[1] ** 2 + raw[2] ** 2);
  return mag > 0 ? raw.map((v) => v / mag) : [1, 0, 0];
}

function makeMockLLM(response: string): LLMProvider {
  return { complete: vi.fn().mockResolvedValue(response) };
}

function makeMockEmbeddings(): EmbeddingProvider {
  return {
    embed: vi
      .fn()
      .mockImplementation((text: string) => Promise.resolve(hashEmbed(text))),
    embedBatch: vi
      .fn()
      .mockImplementation((texts: string[]) =>
        Promise.resolve(texts.map(hashEmbed)),
      ),
  };
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
        { speaker: 'Alice', dia_id: 't3', text: 'How are you?' },
        { speaker: 'Bob', dia_id: 't4', text: 'I am fine' },
        { speaker: 'Alice', dia_id: 't5', text: 'Great to hear' },
        { speaker: 'Bob', dia_id: 't6', text: 'Thanks for asking' },
        { speaker: 'Alice', dia_id: 't7', text: 'Bye' },
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
        question: 'How is Bob?',
        answer: 'Fine',
        category: 'single-hop',
        evidence: [],
      },
    ],
  };
}

describe('chunkConversation', () => {
  it('creates chunks of correct size', () => {
    const chunks = chunkConversation(makeSessions(), 3, 1);
    for (const chunk of chunks.slice(0, -1)) {
      // All chunks except possibly the last should have 3 turns
      const lines = chunk.text.split('\n');
      expect(lines).toHaveLength(3);
    }
  });

  it('creates correct overlap between chunks', () => {
    const chunks = chunkConversation(makeSessions(), 3, 1);
    // With chunkSize=3, overlap=1, step=2: ranges [0,2], [2,4], [4,6]
    expect(chunks.length).toBeGreaterThan(1);
    // First chunk ends at turn 2, second starts at turn 2 — overlap of 1
    expect(chunks[0].turnRange[1]).toBe(2);
    expect(chunks[1].turnRange[0]).toBe(2);
  });

  it('includes session date and speaker in text', () => {
    const chunks = chunkConversation(makeSessions(), 3, 1);
    expect(chunks[0].text).toContain('[2024-01-01]');
    expect(chunks[0].text).toContain('Alice:');
  });

  it('handles conversation shorter than chunk size', () => {
    const sessions: LoCoMoSession[] = [
      {
        date_time: '2024-01-01',
        speaker_a: 'Alice',
        speaker_b: 'Bob',
        turns: [
          { speaker: 'Alice', dia_id: 't1', text: 'Hello' },
          { speaker: 'Bob', dia_id: 't2', text: 'Hi' },
        ],
      },
    ];
    const chunks = chunkConversation(sessions, 5, 2);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text.split('\n')).toHaveLength(2);
  });
});

describe('buildRagPrompt', () => {
  it('includes excerpts and question', () => {
    const prompt = buildRagPrompt(
      ['excerpt one', 'excerpt two'],
      'What happened?',
    );
    expect(prompt).toContain('excerpt one');
    expect(prompt).toContain('excerpt two');
    expect(prompt).toContain('What happened?');
  });

  it('instructs step-by-step reasoning', () => {
    const prompt = buildRagPrompt(['excerpt'], 'question');
    expect(prompt.toLowerCase()).toContain('step by step');
  });
});

describe('createVectorRagRecall', () => {
  it('calls embedBatch during init', async () => {
    const llm = makeMockLLM('answer');
    const embeddings = makeMockEmbeddings();
    await createVectorRagRecall(makeConversation(), llm, embeddings, {
      chunkSize: 3,
      overlap: 1,
    });
    expect(embeddings.embedBatch).toHaveBeenCalledTimes(1);
  });

  it('embeds query on each call', async () => {
    const llm = makeMockLLM('answer');
    const embeddings = makeMockEmbeddings();
    const recall = await createVectorRagRecall(
      makeConversation(),
      llm,
      embeddings,
      {
        chunkSize: 3,
        overlap: 1,
      },
    );
    await recall('How is Bob?');
    await recall('What did Alice say?');
    expect(embeddings.embed).toHaveBeenCalledTimes(2);
    expect(embeddings.embed).toHaveBeenCalledWith('How is Bob?');
    expect(embeddings.embed).toHaveBeenCalledWith('What did Alice say?');
  });

  it('returns answer from LLM', async () => {
    const llm = makeMockLLM('Bob is fine');
    const embeddings = makeMockEmbeddings();
    const recall = await createVectorRagRecall(
      makeConversation(),
      llm,
      embeddings,
      {
        chunkSize: 3,
        overlap: 1,
      },
    );
    const result = await recall('How is Bob?');
    expect(result.answer).toBe('Bob is fine');
  });

  it('returns confidence from similarity score', async () => {
    const llm = makeMockLLM('answer');
    const embeddings = makeMockEmbeddings();
    const recall = await createVectorRagRecall(
      makeConversation(),
      llm,
      embeddings,
      {
        chunkSize: 3,
        overlap: 1,
      },
    );
    const result = await recall('How is Bob?');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
