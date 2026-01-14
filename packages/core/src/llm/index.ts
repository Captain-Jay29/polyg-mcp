// LLM provider abstraction
import type { LLMConfig, LLMProvider } from '@polyg-mcp/shared';
import { AuthenticationError, ConfigurationError } from './errors.js';
import { OpenAIProvider } from './openai.js';

export { OpenAIProvider } from './openai.js';

// Export error types
export {
  LLMError,
  AuthenticationError,
  RateLimitError,
  ModelError,
  ContentFilterError,
  ContextLengthError,
  LLMValidationError,
  PermissionError,
  ServerError,
  ConfigurationError,
  isLLMError,
  wrapLLMError,
} from './errors.js';

/**
 * Create an LLM provider based on configuration
 * @throws {AuthenticationError} When API key is missing
 * @throws {ConfigurationError} When provider is unknown
 */
export function createLLMProvider(config: LLMConfig): LLMProvider {
  if (config.provider !== 'openai') {
    throw new ConfigurationError(
      `Unknown LLM provider: ${config.provider}. Only 'openai' is currently supported.`,
    );
  }

  if (!config.apiKey) {
    throw new AuthenticationError('OpenAI API key required');
  }

  return new OpenAIProvider(config.apiKey, config.model);
}
