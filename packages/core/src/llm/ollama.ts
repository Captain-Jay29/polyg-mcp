// Ollama LLM provider (local)
import type { LLMCompletionOptions, LLMProvider } from '@polyg-mcp/shared';

export class OllamaProvider implements LLMProvider {
  constructor(
    private baseUrl = 'http://localhost:11434',
    private model = 'llama3',
  ) {}

  async complete(options: LLMCompletionOptions): Promise<string> {
    // TODO: Implement Ollama API call
    throw new Error('Not implemented');
  }
}
