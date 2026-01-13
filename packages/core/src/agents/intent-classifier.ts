// Intent Classifier - transforms natural language queries into structured graph query plans
import type {
  ClassifierInput,
  ClassifierOutput,
  LLMProvider,
} from '@polyg-mcp/shared';
import { CLASSIFIER_PROMPT } from './prompts.js';

export class IntentClassifier {
  constructor(private llm: LLMProvider) {}

  async classify(input: ClassifierInput): Promise<ClassifierOutput> {
    const prompt = CLASSIFIER_PROMPT.replace('{query}', input.query).replace(
      '{context}',
      input.context || '',
    );

    const response = await this.llm.complete({
      prompt,
      responseFormat: 'json',
      maxTokens: 500,
    });

    return this.parseAndValidate(response);
  }

  private parseAndValidate(response: string): ClassifierOutput {
    // TODO: Implement JSON parsing and validation
    const parsed = JSON.parse(response) as ClassifierOutput;
    return parsed;
  }
}
