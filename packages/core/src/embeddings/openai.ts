// OpenAI embeddings provider
import type { EmbeddingProvider } from '@polyg-mcp/shared';

export class OpenAIEmbeddings implements EmbeddingProvider {
  constructor(
    private apiKey: string,
    private model = 'text-embedding-3-small',
  ) {}

  async embed(text: string): Promise<number[]> {
    // TODO: Implement OpenAI embeddings API call
    throw new Error('Not implemented');
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // TODO: Implement batch embedding
    throw new Error('Not implemented');
  }
}
