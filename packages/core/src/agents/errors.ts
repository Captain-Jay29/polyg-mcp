// Custom error types for agent operations
import type { ZodError } from 'zod';

/**
 * Base error for all agent-related errors
 */
export class AgentError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'AgentError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when LLM response fails to parse as JSON
 */
export class LLMResponseParseError extends AgentError {
  constructor(
    message: string,
    public readonly rawResponse: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'LLMResponseParseError';
  }
}

/**
 * Thrown when LLM response fails Zod schema validation
 */
export class LLMResponseValidationError extends AgentError {
  constructor(
    message: string,
    public readonly rawResponse: string,
    public readonly validationErrors: ZodError['errors'],
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'LLMResponseValidationError';
  }

  /**
   * Get a formatted string of all validation errors
   */
  getFormattedErrors(): string {
    return this.validationErrors
      .map(
        (err: { path: (string | number)[]; message: string }) =>
          `  - ${err.path.join('.')}: ${err.message}`,
      )
      .join('\n');
  }
}

/**
 * Thrown when classifier fails to process input
 */
export class ClassifierError extends AgentError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'ClassifierError';
  }
}

/**
 * Thrown when synthesizer fails to process input
 */
export class SynthesizerError extends AgentError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'SynthesizerError';
  }
}

/**
 * Check if an error is an AgentError or subclass
 */
export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}

/**
 * Wrap unknown errors in an AgentError
 */
export function wrapAgentError(error: unknown, message: string): AgentError {
  if (error instanceof AgentError) {
    return error;
  }
  if (error instanceof Error) {
    return new AgentError(message, error);
  }
  return new AgentError(`${message}: ${String(error)}`);
}
