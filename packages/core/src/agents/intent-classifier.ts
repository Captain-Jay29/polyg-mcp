// Intent Classifier - transforms natural language queries into structured graph query plans
import {
  type ClassifierInput,
  type ClassifierOutput,
  ClassifierOutputSchema,
  type LLMProvider,
} from '@polyg-mcp/shared';
import {
  ClassifierError,
  LLMResponseParseError,
  LLMResponseValidationError,
} from './errors.js';
import { CLASSIFIER_PROMPT } from './prompts.js';

export class IntentClassifier {
  constructor(private llm: LLMProvider) {}

  /**
   * Classify a natural language query into structured intents
   * @throws {ClassifierError} When classification fails
   * @throws {LLMResponseParseError} When LLM response is not valid JSON
   * @throws {LLMResponseValidationError} When LLM response fails schema validation
   */
  async classify(input: ClassifierInput): Promise<ClassifierOutput> {
    if (!input.query || input.query.trim().length === 0) {
      throw new ClassifierError('Query cannot be empty');
    }

    const prompt = CLASSIFIER_PROMPT.replace('{query}', input.query).replace(
      '{context}',
      input.context || '',
    );

    let response: string;
    try {
      response = await this.llm.complete({
        prompt,
        responseFormat: 'json',
        maxTokens: 500,
      });
    } catch (error) {
      throw new ClassifierError(
        'Failed to get LLM response for classification',
        error instanceof Error ? error : undefined,
      );
    }

    return this.parseAndValidate(response);
  }

  /**
   * Parse and validate the LLM response using Zod schema
   */
  private parseAndValidate(response: string): ClassifierOutput {
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
    const result = ClassifierOutputSchema.safeParse(parsed);

    if (!result.success) {
      throw new LLMResponseValidationError(
        `LLM response failed schema validation:\n${result.error.issues.map((e) => `  - ${e.path.join('.')}: ${e.message}`).join('\n')}`,
        response,
        result.error.issues,
      );
    }

    return result.data;
  }
}
