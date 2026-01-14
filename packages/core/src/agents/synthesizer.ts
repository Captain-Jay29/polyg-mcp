// Synthesizer - transforms raw graph results into coherent, reasoned responses
import {
  type LLMProvider,
  type SynthesizerInput,
  type SynthesizerOutput,
  SynthesizerOutputSchema,
} from '@polyg-mcp/shared';
import {
  LLMResponseParseError,
  LLMResponseValidationError,
  SynthesizerError,
} from './errors.js';
import { SYNTHESIZER_PROMPT } from './prompts.js';

export class Synthesizer {
  constructor(private llm: LLMProvider) {}

  /**
   * Synthesize graph results into a coherent response
   * @throws {SynthesizerError} When synthesis fails
   * @throws {LLMResponseParseError} When LLM response is not valid JSON
   * @throws {LLMResponseValidationError} When LLM response fails schema validation
   */
  async synthesize(input: SynthesizerInput): Promise<SynthesizerOutput> {
    if (!input.original_query || input.original_query.trim().length === 0) {
      throw new SynthesizerError('Original query cannot be empty');
    }

    const prompt = SYNTHESIZER_PROMPT.replace(
      '{query}',
      input.original_query,
    ).replace('{results}', JSON.stringify(input.graph_results, null, 2));

    let response: string;
    try {
      response = await this.llm.complete({
        prompt,
        responseFormat: 'json',
        maxTokens: 1000,
      });
    } catch (error) {
      throw new SynthesizerError(
        'Failed to get LLM response for synthesis',
        error instanceof Error ? error : undefined,
      );
    }

    return this.parseAndValidate(response);
  }

  /**
   * Parse and validate the LLM response using Zod schema
   */
  private parseAndValidate(response: string): SynthesizerOutput {
    // First, try to parse as JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(response);
    } catch (error) {
      throw new LLMResponseParseError(
        'LLM response is not valid JSON',
        response,
        error instanceof Error ? error : undefined,
      );
    }

    // Then validate against schema
    const result = SynthesizerOutputSchema.safeParse(parsed);

    if (!result.success) {
      throw new LLMResponseValidationError(
        `LLM response failed schema validation:\n${result.error.issues.map((e: { path: PropertyKey[]; message: string }) => `  - ${e.path.join('.')}: ${e.message}`).join('\n')}`,
        response,
        result.error.issues,
      );
    }

    return result.data;
  }
}
