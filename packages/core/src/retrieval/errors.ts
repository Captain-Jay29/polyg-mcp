/**
 * Error types for MAGMA retrieval components
 */

/**
 * Base error for retrieval operations
 */
export class RetrievalError extends Error {
  constructor(
    message: string,
    public readonly component: string,
    public readonly operation: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'RetrievalError';
  }
}

/**
 * Error for invalid input validation
 */
export class RetrievalValidationError extends RetrievalError {
  constructor(
    message: string,
    component: string,
    public readonly validationErrors: string[],
  ) {
    super(message, component, 'validation');
    this.name = 'RetrievalValidationError';
  }
}

/**
 * Error for merge operations
 */
export class MergeError extends RetrievalError {
  constructor(
    message: string,
    public readonly viewCount: number,
    cause?: Error,
  ) {
    super(message, 'SubgraphMerger', 'merge', cause);
    this.name = 'MergeError';
  }
}

/**
 * Error for linearization operations
 */
export class LinearizationError extends RetrievalError {
  constructor(
    message: string,
    public readonly intentType: string,
    cause?: Error,
  ) {
    super(message, 'ContextLinearizer', 'linearize', cause);
    this.name = 'LinearizationError';
  }
}

/**
 * Error for seed extraction operations
 */
export class SeedExtractionError extends RetrievalError {
  constructor(
    message: string,
    public readonly conceptCount: number,
    cause?: Error,
  ) {
    super(message, 'SeedExtractor', 'extract', cause);
    this.name = 'SeedExtractionError';
  }
}

/**
 * Wrap unknown errors in RetrievalError
 */
export function wrapRetrievalError(
  error: unknown,
  message: string,
  component: string,
  operation: string,
): RetrievalError {
  if (error instanceof RetrievalError) {
    return error;
  }

  const cause = error instanceof Error ? error : new Error(String(error));
  return new RetrievalError(message, component, operation, cause);
}
