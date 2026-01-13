// LLM provider abstraction
import type { LLMConfig, LLMProvider } from '@polyg-mcp/shared';
import { AnthropicProvider } from './anthropic.js';
import { AuthenticationError } from './errors.js';
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
  isLLMError,
  wrapLLMError,
} from './errors.js';

/**
 * Create an LLM provider based on configuration
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
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
