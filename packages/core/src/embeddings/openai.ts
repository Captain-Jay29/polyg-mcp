// OpenAI embeddings provider
import type { EmbeddingProvider } from '@polyg-mcp/shared';
import OpenAI, { APIError } from 'openai';
import {
  EmbeddingAuthError,
  EmbeddingError,
  EmbeddingInputError,
  EmbeddingModelError,
  EmbeddingPermissionError,
  EmbeddingRateLimitError,
  EmbeddingServerError,
} from './errors.js';

/**
 * OpenAI embeddings provider implementation
 */
// Default timeout for API requests (60 seconds)
const DEFAULT_TIMEOUT_MS = 60000;

export class OpenAIEmbeddings implements EmbeddingProvider {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model = 'text-embedding-3-small',
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    if (!apiKey) {
      throw new EmbeddingAuthError('OpenAI API key is required');
    }
    this.client = new OpenAI({ apiKey, timeout: timeoutMs });
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

      // Validate response data
      if (!response.data || response.data.length === 0) {
        throw new EmbeddingError('No embeddings in response');
      }

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
      const status = error.status;

      if (status === 401) {
        return new EmbeddingAuthError('Invalid OpenAI API key', error);
      }

      if (status === 403) {
        return new EmbeddingPermissionError(
          'Permission denied. Check your API key permissions.',
          error,
        );
      }

      if (status === 429) {
        const retryAfter = this.parseRetryAfter(error);
        return new EmbeddingRateLimitError(
          'OpenAI rate limit exceeded',
          retryAfter,
          error,
        );
      }

      if (status === 404) {
        return new EmbeddingModelError(
          `Embedding model not found: ${this.model}`,
          this.model,
          error,
        );
      }

      if (status === 400) {
        if (message.includes('too long') || message.includes('maximum')) {
          return new EmbeddingInputError(message, undefined, error);
        }
      }

      // Handle server errors (5xx)
      if (status && status >= 500) {
        return new EmbeddingServerError(
          `OpenAI server error: ${message}`,
          status,
          error,
        );
      }

      return new EmbeddingError(message, error);
    }

    if (error instanceof Error) {
      return new EmbeddingError(error.message, error);
    }

    return new EmbeddingError(`Unknown error: ${String(error)}`);
  }

  /**
   * Parse retry-after header from rate limit errors
   */
  private parseRetryAfter(error: APIError): number | undefined {
    const headers = error.headers;
    if (headers && 'retry-after' in headers) {
      const value = headers['retry-after'];
      if (typeof value === 'string') {
        const seconds = Number.parseInt(value, 10);
        if (!Number.isNaN(seconds)) {
          return seconds * 1000; // Convert to milliseconds
        }
      }
    }
    return undefined;
  }
}
