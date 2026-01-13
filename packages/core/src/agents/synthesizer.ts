// Synthesizer - transforms raw graph results into coherent, reasoned responses
import type {
  LLMProvider,
  SynthesizerInput,
  SynthesizerOutput,
} from '@polyg-mcp/shared';
import { SYNTHESIZER_PROMPT } from './prompts.js';

export class Synthesizer {
  constructor(private llm: LLMProvider) {}

  async synthesize(input: SynthesizerInput): Promise<SynthesizerOutput> {
    const prompt = SYNTHESIZER_PROMPT.replace(
      '{query}',
      input.original_query,
    ).replace('{results}', JSON.stringify(input.graph_results, null, 2));

    const response = await this.llm.complete({
      prompt,
      responseFormat: 'json',
      maxTokens: 1000,
    });

    return this.parseAndValidate(response);
  }

  private parseAndValidate(response: string): SynthesizerOutput {
    // TODO: Implement JSON parsing and validation
    const parsed = JSON.parse(response) as SynthesizerOutput;
    return parsed;
  }
}
