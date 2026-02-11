import type { EmbeddingProvider, LLMProvider } from '@polyg-mcp/shared';
import type { RecallFn } from '../evaluate.js';
import type { LoCoMoConversation, LoCoMoSession } from '../types.js';
import { cosineSimilarity, mmrRerank, type ScoredChunk } from './similarity.js';

export interface ConversationChunk {
  text: string;
  sessionDate: string;
  turnRange: [number, number];
}

export const DEFAULT_CHUNK_SIZE = 5;
export const DEFAULT_OVERLAP = 2;
export const DEFAULT_RETRIEVE_K = 20;
export const DEFAULT_RERANK_K = 10;
export const DEFAULT_LAMBDA = 0.7;

export function chunkConversation(
  sessions: LoCoMoSession[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP,
): ConversationChunk[] {
  // Flatten all turns with their session metadata
  const flatTurns: { text: string; sessionDate: string; speaker: string }[] =
    [];
  for (const session of sessions) {
    for (const turn of session.turns) {
      flatTurns.push({
        text: turn.text,
        sessionDate: session.date_time,
        speaker: turn.speaker,
      });
    }
  }

  const chunks: ConversationChunk[] = [];
  const step = Math.max(1, chunkSize - overlap);

  for (let i = 0; i < flatTurns.length; i += step) {
    const end = Math.min(i + chunkSize, flatTurns.length);
    const slice = flatTurns.slice(i, end);

    const text = slice
      .map((t) => `[${t.sessionDate}] ${t.speaker}: ${t.text}`)
      .join('\n');

    chunks.push({
      text,
      sessionDate: slice[0].sessionDate,
      turnRange: [i, end - 1],
    });

    if (end >= flatTurns.length) break;
  }

  return chunks;
}

export function formatChunk(chunk: ConversationChunk): string {
  return chunk.text;
}

export function buildRagPrompt(chunks: string[], question: string): string {
  const excerpts = chunks.map((c, i) => `[${i + 1}] ${c}`).join('\n\n');

  return [
    'You are given excerpts from a conversation. Think step by step, then provide a concise answer to the question.',
    '',
    '## Excerpts',
    excerpts,
    '',
    '## Question',
    question,
    '',
    'Think step by step about the relevant excerpts, then give a concise answer.',
  ].join('\n');
}

export interface VectorRagOptions {
  chunkSize?: number;
  overlap?: number;
  retrieveK?: number;
  rerankK?: number;
  lambda?: number;
}

export async function createVectorRagRecall(
  conversation: LoCoMoConversation,
  llm: LLMProvider,
  embeddings: EmbeddingProvider,
  options?: VectorRagOptions,
): Promise<RecallFn> {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP;
  const retrieveK = options?.retrieveK ?? DEFAULT_RETRIEVE_K;
  const rerankK = options?.rerankK ?? DEFAULT_RERANK_K;
  const lambda = options?.lambda ?? DEFAULT_LAMBDA;

  const chunks = chunkConversation(conversation.sessions, chunkSize, overlap);
  const chunkTexts = chunks.map(formatChunk);
  const chunkEmbeddings = await embeddings.embedBatch(chunkTexts);

  return async (query: string) => {
    const queryEmbedding = await embeddings.embed(query);

    // Score all chunks by cosine similarity
    const scored: ScoredChunk<ConversationChunk>[] = chunks.map((chunk, i) => ({
      item: chunk,
      embedding: chunkEmbeddings[i],
      score: cosineSimilarity(queryEmbedding, chunkEmbeddings[i]),
    }));

    // Top-k by relevance
    scored.sort((a, b) => b.score - a.score);
    const topK = scored.slice(0, retrieveK);

    // MMR rerank
    const reranked = mmrRerank(topK, rerankK, lambda);

    // Build prompt from reranked chunks
    const excerpts = reranked.map((r) => formatChunk(r.item));
    const prompt = buildRagPrompt(excerpts, query);

    const answer = await llm.complete({
      prompt,
      responseFormat: 'text',
      maxTokens: 256,
    });

    // Confidence: top similarity score from reranked results, clamped to [0, 1]
    const confidence =
      reranked.length > 0 ? Math.max(0, Math.min(1, reranked[0].score)) : 0;

    return { answer, confidence };
  };
}
