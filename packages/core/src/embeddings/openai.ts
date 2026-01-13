// OpenAI embeddings provider
import type { EmbeddingProvider } from '@polyg-mcp/shared';
import OpenAI, { APIError } from 'openai';
import {
  EmbeddingAuthError,
  EmbeddingError,
  EmbeddingInputError,
  EmbeddingModelError,
  EmbeddingRateLimitError,
} from './errors.js';

/**
 * OpenAI embeddings provider implementation
 */
export class OpenAIEmbeddings implements EmbeddingProvider {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model = 'text-embedding-3-small',
  ) {
    if (!apiKey) {
      throw new EmbeddingAuthError('OpenAI API key is required');
    }
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new EmbeddingInputError('Text cannot be empty');
    }

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new EmbeddingError('No embedding in response');
      }

      return embedding;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    // Filter out empty texts
    const validTexts = texts.filter((t) => t && t.trim().length > 0);
    if (validTexts.length === 0) {
      throw new EmbeddingInputError('All texts are empty');
    }

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: validTexts,
      });

      // Sort by index to maintain order
      const sorted = response.data.sort((a, b) => a.index - b.index);
      return sorted.map((item) => item.embedding);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get the dimension of embeddings for this model
   */
  getDimension(): number {
    // text-embedding-3-small produces 1536 dimensions by default
    // text-embedding-3-large produces 3072 dimensions by default
    if (this.model.includes('large')) {
      return 3072;
    }
    return 1536;
  }

  /**
   * Convert OpenAI errors to our error types
   */
  private handleError(error: unknown): EmbeddingError {
    if (error instanceof EmbeddingError) {
      return error;
    }

    if (error instanceof APIError) {
      const message = error.message || 'OpenAI API error';

      if (error.status === 401) {
        return new EmbeddingAuthError('Invalid OpenAI API key', error);
      }

      if (error.status === 429) {
        return new EmbeddingRateLimitError(
          'OpenAI rate limit exceeded',
          undefined,
          error,
        );
      }

      if (error.status === 404) {
        return new EmbeddingModelError(
          `Embedding model not found: ${this.model}`,
          this.model,
          error,
        );
      }

      if (error.status === 400) {
        if (message.includes('too long') || message.includes('maximum')) {
          return new EmbeddingInputError(message, undefined, error);
        }
      }

      return new EmbeddingError(message, error);
    }

    if (error instanceof Error) {
      return new EmbeddingError(error.message, error);
    }

    return new EmbeddingError(`Unknown error: ${String(error)}`);
  }
}
