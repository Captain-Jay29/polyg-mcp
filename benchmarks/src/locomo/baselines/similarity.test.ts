import { describe, expect, it } from 'vitest';
import { cosineSimilarity, mmrRerank, type ScoredChunk } from './similarity.js';

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
  });

  it('returns 0 for zero-magnitude vector', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe('mmrRerank', () => {
  function makeChunk(
    id: string,
    score: number,
    embedding: number[],
  ): ScoredChunk<string> {
    return { item: id, embedding, score };
  }

  it('returns top-k items', () => {
    const candidates = [
      makeChunk('a', 0.9, [1, 0, 0]),
      makeChunk('b', 0.8, [0, 1, 0]),
      makeChunk('c', 0.7, [0, 0, 1]),
      makeChunk('d', 0.6, [1, 1, 0]),
    ];
    const result = mmrRerank(candidates, 2);
    expect(result).toHaveLength(2);
  });

  it('first item is highest-scoring candidate', () => {
    const candidates = [
      makeChunk('a', 0.5, [1, 0, 0]),
      makeChunk('b', 0.9, [0, 1, 0]),
      makeChunk('c', 0.7, [0, 0, 1]),
    ];
    const result = mmrRerank(candidates, 3);
    expect(result[0].item).toBe('b');
  });

  it('with λ=1.0 returns pure relevance order', () => {
    const candidates = [
      makeChunk('a', 0.5, [1, 0, 0]),
      makeChunk('b', 0.9, [0.99, 0.01, 0]),
      makeChunk('c', 0.7, [0.98, 0.02, 0]),
    ];
    const result = mmrRerank(candidates, 3, 1.0);
    expect(result.map((r) => r.item)).toEqual(['b', 'c', 'a']);
  });

  it('returns fewer items if candidates < k', () => {
    const candidates = [
      makeChunk('a', 0.9, [1, 0, 0]),
      makeChunk('b', 0.8, [0, 1, 0]),
    ];
    const result = mmrRerank(candidates, 5);
    expect(result).toHaveLength(2);
  });

  it('handles empty candidates', () => {
    const result = mmrRerank([], 5);
    expect(result).toEqual([]);
  });
});
