// Embedding provider abstraction
import type { EmbeddingProvider, EmbeddingsConfig } from '@polyg-mcp/shared';
import { EmbeddingAuthError, EmbeddingConfigError } from './errors.js';
import { OpenAIEmbeddings } from './openai.js';

// Export error types
export {
  EmbeddingAuthError,
  EmbeddingConfigError,
  EmbeddingError,
  EmbeddingInputError,
  EmbeddingModelError,
  EmbeddingPermissionError,
  EmbeddingRateLimitError,
  EmbeddingServerError,
  isEmbeddingError,
  wrapEmbeddingError,
} from './errors.js';
export { OpenAIEmbeddings } from './openai.js';

/**
 * Create an embedding provider based on configuration
 * @throws {EmbeddingAuthError} When API key is missing
 * @throws {EmbeddingConfigError} When provider is unknown
 */
export function createEmbeddingProvider(
  config: EmbeddingsConfig,
  apiKey?: string,
): EmbeddingProvider {
  if (config.provider !== 'openai') {
    throw new EmbeddingConfigError(
      `Unknown embedding provider: ${config.provider}. Only 'openai' is currently supported.`,
    );
  }

  if (!apiKey) {
    throw new EmbeddingAuthError('OpenAI API key required for embeddings');
  }

  return new OpenAIEmbeddings(apiKey, config.model);
}
