// Custom error types for embedding providers

/**
 * Base error for all embedding-related errors
 */
export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'EmbeddingError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when API key is missing or invalid
 */
export class EmbeddingAuthError extends EmbeddingError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'EmbeddingAuthError';
  }
}

/**
 * Thrown when rate limit is exceeded
 */
export class EmbeddingRateLimitError extends EmbeddingError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'EmbeddingRateLimitError';
  }
}

/**
 * Thrown when the embedding model is unavailable
 */
export class EmbeddingModelError extends EmbeddingError {
  constructor(
    message: string,
    public readonly model?: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'EmbeddingModelError';
  }
}

/**
 * Thrown when input text is too long
 */
export class EmbeddingInputError extends EmbeddingError {
  constructor(
    message: string,
    public readonly maxLength?: number,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'EmbeddingInputError';
  }
}

/**
 * Thrown when permission is denied (403)
 */
export class EmbeddingPermissionError extends EmbeddingError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'EmbeddingPermissionError';
  }
}

/**
 * Thrown when server error occurs (5xx)
 */
export class EmbeddingServerError extends EmbeddingError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'EmbeddingServerError';
  }
}

/**
 * Thrown when provider configuration is invalid
 */
export class EmbeddingConfigError extends EmbeddingError {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingConfigError';
  }
}

/**
 * Check if an error is an EmbeddingError or subclass
 */
export function isEmbeddingError(error: unknown): error is EmbeddingError {
  return error instanceof EmbeddingError;
}

/**
 * Wrap unknown errors in an EmbeddingError
 */
export function wrapEmbeddingError(
  error: unknown,
  message: string,
): EmbeddingError {
  if (error instanceof EmbeddingError) {
    return error;
  }
  if (error instanceof Error) {
    return new EmbeddingError(message, error);
  }
  return new EmbeddingError(`${message}: ${String(error)}`);
}
