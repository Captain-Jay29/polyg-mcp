// Ollama embeddings provider (local)
import type { EmbeddingProvider } from '@polyg-mcp/shared';

export class OllamaEmbeddings implements EmbeddingProvider {
  constructor(
    private baseUrl = 'http://localhost:11434',
    private model = 'nomic-embed-text',
  ) {}

  async embed(text: string): Promise<number[]> {
    // TODO: Implement Ollama embeddings API call
    throw new Error('Not implemented');
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // TODO: Implement batch embedding
    throw new Error('Not implemented');
  }
}
