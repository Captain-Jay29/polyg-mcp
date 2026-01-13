// Custom error types for LLM providers

/**
 * Base error for all LLM-related errors
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'LLMError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when API key is missing or invalid
 */
export class AuthenticationError extends LLMError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'AuthenticationError';
  }
}

/**
 * Thrown when rate limit is exceeded
 */
export class RateLimitError extends LLMError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'RateLimitError';
  }
}

/**
 * Thrown when the model is unavailable or invalid
 */
export class ModelError extends LLMError {
  constructor(
    message: string,
    public readonly model?: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'ModelError';
  }
}

/**
 * Thrown when content is blocked by safety filters
 */
export class ContentFilterError extends LLMError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'ContentFilterError';
  }
}

/**
 * Thrown when context length is exceeded
 */
export class ContextLengthError extends LLMError {
  constructor(
    message: string,
    public readonly maxTokens?: number,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'ContextLengthError';
  }
}

/**
 * Thrown when input validation fails
 */
export class LLMValidationError extends LLMError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'LLMValidationError';
  }
}

/**
 * Thrown when permission is denied (403)
 */
export class PermissionError extends LLMError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'PermissionError';
  }
}

/**
 * Thrown when server error occurs (5xx)
 */
export class ServerError extends LLMError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'ServerError';
  }
}

/**
 * Thrown when provider configuration is invalid
 */
export class ConfigurationError extends LLMError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Check if an error is an LLMError or subclass
 */
export function isLLMError(error: unknown): error is LLMError {
  return error instanceof LLMError;
}

/**
 * Wrap unknown errors in an LLMError
 */
export function wrapLLMError(error: unknown, message: string): LLMError {
  if (error instanceof LLMError) {
    return error;
  }
  if (error instanceof Error) {
    return new LLMError(message, error);
  }
  return new LLMError(`${message}: ${String(error)}`);
}
