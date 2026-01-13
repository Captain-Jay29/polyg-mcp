// OpenAI LLM provider
import type { LLMCompletionOptions, LLMProvider } from '@polyg-mcp/shared';

export class OpenAIProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private model = 'gpt-4o-mini',
  ) {}

  async complete(options: LLMCompletionOptions): Promise<string> {
    // TODO: Implement OpenAI API call
    throw new Error('Not implemented');
  }
}
