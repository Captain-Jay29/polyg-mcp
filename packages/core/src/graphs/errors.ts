// Custom error types for graph operations

/**
 * Base error for all graph-related errors
 */
export class GraphError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'GraphError';

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when an entity is not found in any graph
 */
export class EntityNotFoundError extends GraphError {
  constructor(
    message: string,
    public readonly entityType?: string,
    public readonly identifier?: string,
  ) {
    super(message);
    this.name = 'EntityNotFoundError';
  }
}

/**
 * Thrown when entity resolution fails
 */
export class EntityResolutionError extends GraphError {
  constructor(
    message: string,
    public readonly mentions?: string[],
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'EntityResolutionError';
  }
}

/**
 * Thrown when a graph query fails
 */
export class GraphQueryError extends GraphError {
  constructor(
    message: string,
    public readonly graphType?: string,
    public readonly operation?: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'GraphQueryError';
  }
}

/**
 * Thrown when parsing graph data fails
 */
export class GraphParseError extends GraphError {
  constructor(
    message: string,
    public readonly nodeType?: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'GraphParseError';
  }
}

/**
 * Thrown when embedding generation fails
 */
export class EmbeddingGenerationError extends GraphError {
  constructor(
    message: string,
    public readonly input?: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'EmbeddingGenerationError';
  }
}

/**
 * Thrown when creating a relationship fails
 */
export class RelationshipError extends GraphError {
  constructor(
    message: string,
    public readonly sourceId?: string,
    public readonly targetId?: string,
    public readonly relationshipType?: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'RelationshipError';
  }
}

/**
 * Thrown when temporal operations fail
 */
export class TemporalError extends GraphError {
  constructor(
    message: string,
    public readonly timeframe?: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'TemporalError';
  }
}

/**
 * Thrown when causal chain traversal fails
 */
export class CausalTraversalError extends GraphError {
  constructor(
    message: string,
    public readonly direction?: string,
    public readonly depth?: number,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'CausalTraversalError';
  }
}

/**
 * Check if an error is a GraphError or subclass
 */
export function isGraphError(error: unknown): error is GraphError {
  return error instanceof GraphError;
}

/**
 * Wrap unknown errors in a GraphError
 */
export function wrapGraphError(
  error: unknown,
  message: string,
  graphType?: string,
  operation?: string,
): GraphError {
  if (error instanceof GraphError) {
    return error;
  }
  if (error instanceof Error) {
    return new GraphQueryError(message, graphType, operation, error);
  }
  return new GraphQueryError(
    `${message}: ${String(error)}`,
    graphType,
    operation,
  );
}
