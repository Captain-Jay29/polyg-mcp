export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

export interface ScoredChunk<T> {
  item: T;
  embedding: number[];
  score: number;
}

export function mmrRerank<T>(
  candidates: ScoredChunk<T>[],
  k: number,
  lambda: number = 0.7,
): ScoredChunk<T>[] {
  if (candidates.length === 0) return [];

  const selected: ScoredChunk<T>[] = [];
  const remaining = [...candidates];

  // First pick: highest relevance score
  remaining.sort((a, b) => b.score - a.score);
  const first = remaining.shift();
  if (!first) return [];
  selected.push(first);

  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const relevance = candidate.score;

      // Max similarity to any already-selected item
      let maxSim = -Infinity;
      for (const sel of selected) {
        const sim = cosineSimilarity(candidate.embedding, sel.embedding);
        if (sim > maxSim) maxSim = sim;
      }

      const mmrScore = lambda * relevance - (1 - lambda) * maxSim;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  return selected;
}
