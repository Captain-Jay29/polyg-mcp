// LLM provider abstraction
import type { LLMConfig, LLMProvider } from '@polyg-mcp/shared';
import { AnthropicProvider } from './anthropic.js';
import { AuthenticationError, ConfigurationError } from './errors.js';
import { OllamaProvider } from './ollama.js';
import { OpenAIProvider } from './openai.js';

export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
export { OllamaProvider } from './ollama.js';

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
 * @throws {AuthenticationError} When API key is missing for providers that require it
 * @throws {ConfigurationError} When provider is unknown
 */
export function createLLMProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'openai':
      if (!config.apiKey) {
        throw new AuthenticationError('OpenAI API key required');
      }
      return new OpenAIProvider(config.apiKey, config.model);

    case 'anthropic':
      if (!config.apiKey) {
        throw new AuthenticationError('Anthropic API key required');
      }
      return new AnthropicProvider(config.apiKey, config.model);

    case 'ollama':
      return new OllamaProvider(config.baseUrl, config.model);

    default:
      throw new ConfigurationError(
        `Unknown LLM provider: ${config.provider}. Supported providers: openai, anthropic, ollama`,
      );
  }
}
