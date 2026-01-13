// Embedding provider abstraction
import type { EmbeddingProvider, EmbeddingsConfig } from '@polyg-mcp/shared';
import { EmbeddingAuthError, EmbeddingConfigError } from './errors.js';
import { OllamaEmbeddings } from './ollama.js';
import { OpenAIEmbeddings } from './openai.js';

export { OpenAIEmbeddings } from './openai.js';
export { OllamaEmbeddings } from './ollama.js';

// Export error types
export {
  EmbeddingError,
  EmbeddingAuthError,
  EmbeddingRateLimitError,
  EmbeddingModelError,
  EmbeddingInputError,
  EmbeddingPermissionError,
  EmbeddingServerError,
  EmbeddingConfigError,
  isEmbeddingError,
  wrapEmbeddingError,
} from './errors.js';

/**
 * Create an embedding provider based on configuration
 */
export function createEmbeddingProvider(
  config: EmbeddingsConfig,
  apiKey?: string,
): EmbeddingProvider {
  switch (config.provider) {
    case 'openai':
      if (!apiKey) {
        throw new EmbeddingAuthError('OpenAI API key required for embeddings');
      }
      return new OpenAIEmbeddings(apiKey, config.model);

    case 'ollama':
      return new OllamaEmbeddings(undefined, config.model);

    default:
      throw new EmbeddingConfigError(
        `Unknown embedding provider: ${config.provider}. Supported providers: openai, ollama`,
      );
  }
}
