// Anthropic LLM provider
import type { LLMCompletionOptions, LLMProvider } from '@polyg-mcp/shared';

export class AnthropicProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private model = 'claude-3-haiku-20240307',
  ) {}

  async complete(options: LLMCompletionOptions): Promise<string> {
    // TODO: Implement Anthropic API call
    throw new Error('Not implemented');
  }
}
