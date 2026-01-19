// Intent Classifier - transforms natural language queries into structured graph query plans
import {
  type ClassifierInput,
  type ClassifierOutput,
  ClassifierOutputSchema,
  type LLMProvider,
  type MAGMAIntent,
  MAGMAIntentSchema,
} from '@polyg-mcp/shared';
import {
  ClassifierError,
  LLMResponseParseError,
  LLMResponseValidationError,
} from './errors.js';
import { CLASSIFIER_PROMPT, MAGMA_CLASSIFIER_PROMPT } from './prompts.js';

export class IntentClassifier {
  constructor(private llm: LLMProvider) {}

  /**
   * Classify a natural language query into structured intents (legacy graph-centric)
   *
   * @deprecated Use classifyMAGMA() for new implementations. This method uses
   * graph-centric intents (semantic/temporal/causal/entity) which will be
   * replaced by question-centric intents (WHY/WHEN/WHO/WHAT) in Phase 5.
   *
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
   * Classify using MAGMA-style question-centric intents
   * Returns MAGMAIntent with WHY/WHEN/WHO/WHAT/EXPLORE type and depth hints
   * @throws {ClassifierError} When classification fails
   * @throws {LLMResponseParseError} When LLM response is not valid JSON
   * @throws {LLMResponseValidationError} When LLM response fails schema validation
   */
  async classifyMAGMA(input: ClassifierInput): Promise<MAGMAIntent> {
    if (!input.query || input.query.trim().length === 0) {
      throw new ClassifierError('Query cannot be empty');
    }

    const prompt = MAGMA_CLASSIFIER_PROMPT.replace(
      '{query}',
      input.query,
    ).replace('{context}', input.context || '');

    let response: string;
    try {
      response = await this.llm.complete({
        prompt,
        responseFormat: 'json',
        maxTokens: 500,
      });
    } catch (error) {
      throw new ClassifierError(
        'Failed to get LLM response for MAGMA classification',
        error instanceof Error ? error : undefined,
      );
    }

    return this.parseAndValidateMAGMA(response);
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
        `LLM response failed schema validation:\n${result.error.issues.map((e: { path: PropertyKey[]; message: string }) => `  - ${e.path.join('.')}: ${e.message}`).join('\n')}`,
        response,
        result.error.issues,
      );
    }

    return result.data;
  }

  /**
   * Parse and validate MAGMA-style LLM response
   */
  private parseAndValidateMAGMA(response: string): MAGMAIntent {
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

    // Then validate against MAGMA schema
    const result = MAGMAIntentSchema.safeParse(parsed);

    if (!result.success) {
      throw new LLMResponseValidationError(
        `LLM response failed MAGMA schema validation:\n${result.error.issues.map((e: { path: PropertyKey[]; message: string }) => `  - ${e.path.join('.')}: ${e.message}`).join('\n')}`,
        response,
        result.error.issues,
      );
    }

    return result.data;
  }
}
