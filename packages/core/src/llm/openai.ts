// OpenAI LLM provider
import type { LLMCompletionOptions, LLMProvider } from '@polyg-mcp/shared';
import OpenAI, { APIError } from 'openai';
import {
  AuthenticationError,
  ContentFilterError,
  ContextLengthError,
  LLMError,
  ModelError,
  RateLimitError,
} from './errors.js';

/**
 * OpenAI LLM provider implementation
 */
export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model = 'gpt-5-mini',
  ) {
    if (!apiKey) {
      throw new AuthenticationError('OpenAI API key is required');
    }
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Generate a completion using OpenAI's chat API
   */
  async complete(options: LLMCompletionOptions): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: options.prompt }],
        max_tokens: options.maxTokens,
        response_format:
          options.responseFormat === 'json'
            ? { type: 'json_object' }
            : { type: 'text' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new LLMError('No content in response');
      }

      return content;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Convert OpenAI errors to our error types
   */
  private handleError(error: unknown): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    if (error instanceof APIError) {
      const message = error.message || 'OpenAI API error';

      // Handle specific error types
      if (error.status === 401) {
        return new AuthenticationError('Invalid OpenAI API key', error);
      }

      if (error.status === 429) {
        const retryAfter = this.parseRetryAfter(error);
        return new RateLimitError(
          'OpenAI rate limit exceeded',
          retryAfter,
          error,
        );
      }

      if (error.status === 404) {
        return new ModelError(
          `Model not found: ${this.model}`,
          this.model,
          error,
        );
      }

      if (error.status === 400) {
        // Check for context length errors
        if (
          message.includes('context_length') ||
          message.includes('maximum context')
        ) {
          return new ContextLengthError(message, undefined, error);
        }
        // Check for content filter errors
        if (message.includes('content_filter') || message.includes('safety')) {
          return new ContentFilterError(message, error);
        }
      }

      return new LLMError(message, error);
    }

    if (error instanceof Error) {
      return new LLMError(error.message, error);
    }

    return new LLMError(`Unknown error: ${String(error)}`);
  }

  /**
   * Parse retry-after header from rate limit errors
   */
  private parseRetryAfter(error: APIError): number | undefined {
    const headers = error.headers;
    if (headers && 'retry-after' in headers) {
      const value = headers['retry-after'];
      if (typeof value === 'string') {
        const seconds = Number.parseInt(value, 10);
        if (!Number.isNaN(seconds)) {
          return seconds * 1000; // Convert to milliseconds
        }
      }
    }
    return undefined;
  }
}
