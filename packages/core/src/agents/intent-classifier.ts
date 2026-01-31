// Intent Classifier - transforms natural language queries into structured graph query plans
import {
  type ClassifierInput,
  type LLMProvider,
  type MAGMAIntent,
  MAGMAIntentSchema,
} from '@polyg-mcp/shared';
import {
  ClassifierError,
  LLMResponseParseError,
  LLMResponseValidationError,
} from './errors.js';
import { MAGMA_CLASSIFIER_PROMPT } from './prompts.js';

// Default input length limits (can be overridden via config)
const DEFAULT_MAX_QUERY_LENGTH = 8000;
const DEFAULT_MAX_CONTEXT_LENGTH = 4000;

export interface ClassifierConfig {
  /** Maximum query length in characters (default: 8000) */
  maxQueryLength?: number;
  /** Maximum context length in characters (default: 4000) */
  maxContextLength?: number;
}

export class IntentClassifier {
  private readonly maxQueryLength: number;
  private readonly maxContextLength: number;

  constructor(
    private llm: LLMProvider,
    config?: ClassifierConfig,
  ) {
    this.maxQueryLength = config?.maxQueryLength ?? DEFAULT_MAX_QUERY_LENGTH;
    this.maxContextLength =
      config?.maxContextLength ?? DEFAULT_MAX_CONTEXT_LENGTH;
  }

  /**
   * Classify using MAGMA-style question-centric intents
   * Returns MAGMAIntent with WHY/WHEN/WHO/WHAT/EXPLORE type and depth hints
   * @throws {ClassifierError} When classification fails (empty/too long input)
   * @throws {LLMResponseParseError} When LLM response is not valid JSON
   * @throws {LLMResponseValidationError} When LLM response fails schema validation
   */
  async classifyMAGMA(input: ClassifierInput): Promise<MAGMAIntent> {
    // Validate query is not empty
    if (!input.query || input.query.trim().length === 0) {
      throw new ClassifierError('Query cannot be empty');
    }

    // Validate query length
    if (input.query.length > this.maxQueryLength) {
      throw new ClassifierError(
        `Query exceeds maximum length of ${this.maxQueryLength} characters (got ${input.query.length}). Please shorten your query.`,
      );
    }

    // Validate context length if provided
    if (input.context && input.context.length > this.maxContextLength) {
      throw new ClassifierError(
        `Context exceeds maximum length of ${this.maxContextLength} characters (got ${input.context.length}). Please shorten the context.`,
      );
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
