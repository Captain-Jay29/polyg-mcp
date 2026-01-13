// LLM provider abstraction
import type { LLMConfig, LLMProvider } from '@polyg-mcp/shared';
import { AnthropicProvider } from './anthropic.js';
import { OllamaProvider } from './ollama.js';
import { OpenAIProvider } from './openai.js';

export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
export { OllamaProvider } from './ollama.js';

export function createLLMProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'openai':
      if (!config.apiKey) throw new Error('OpenAI API key required');
      return new OpenAIProvider(config.apiKey, config.model);

    case 'anthropic':
      if (!config.apiKey) throw new Error('Anthropic API key required');
      return new AnthropicProvider(config.apiKey, config.model);

    case 'ollama':
      return new OllamaProvider(config.baseUrl, config.model);

    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
