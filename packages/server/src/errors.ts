// Server error types for polyg-mcp
// Follows the same pattern as core package errors

import {
  CausalTraversalError,
  EmbeddingGenerationError,
  EntityNotFoundError,
  EntityResolutionError,
  type GraphError,
  GraphParseError,
  GraphQueryError,
  isGraphError,
  RelationshipError,
  TemporalError,
} from '@polyg-mcp/core';

/**
 * Base error class for all server-related errors
 */
export class ServerError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'ServerError';

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    // Set cause for error chaining
    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * Thrown when server configuration is invalid
 */
export class ServerConfigError extends ServerError {
  constructor(
    message: string,
    public readonly field?: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'ServerConfigError';
  }
}

/**
 * Thrown when HTTP transport configuration is invalid
 */
export class TransportConfigError extends ServerError {
  constructor(
    message: string,
    public readonly field?: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'TransportConfigError';
  }
}

/**
 * Thrown when server fails to start
 */
export class ServerStartError extends ServerError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'ServerStartError';
  }
}

/**
 * Thrown when server fails to stop gracefully
 */
export class ServerStopError extends ServerError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'ServerStopError';
  }
}

/**
 * Thrown when a tool execution fails
 */
export class ToolExecutionError extends ServerError {
  constructor(
    message: string,
    public readonly toolName: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'ToolExecutionError';
  }
}

/**
 * Thrown when tool input validation fails
 */
export class ToolInputValidationError extends ServerError {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly validationErrors: Array<{ path: string; message: string }>,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'ToolInputValidationError';
  }
}

/**
 * Thrown when health check fails
 */
export class HealthCheckError extends ServerError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'HealthCheckError';
  }
}

/**
 * Thrown when a session is not found
 */
export class SessionNotFoundError extends ServerError {
  constructor(
    public readonly sessionId: string,
    cause?: Error,
  ) {
    super(`Session not found: ${sessionId}`, cause);
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Thrown when session limit is reached
 */
export class SessionLimitError extends ServerError {
  constructor(
    public readonly maxSessions: number,
    cause?: Error,
  ) {
    super(
      `Session limit reached: maximum ${maxSessions} sessions allowed`,
      cause,
    );
    this.name = 'SessionLimitError';
  }
}

/**
 * Thrown when session ID is required but not provided
 */
export class SessionRequiredError extends ServerError {
  constructor(cause?: Error) {
    super('Session ID required for this request', cause);
    this.name = 'SessionRequiredError';
  }
}

/**
 * Thrown when session creation fails
 */
export class SessionCreationError extends ServerError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'SessionCreationError';
  }
}

/**
 * Type guard to check if an error is a ServerError
 */
export function isServerError(error: unknown): error is ServerError {
  return error instanceof ServerError;
}

/**
 * Wrap an unknown error as a ServerError
 */
export function wrapServerError(error: unknown, message: string): ServerError {
  if (error instanceof ServerError) {
    return error;
  }
  if (error instanceof Error) {
    return new ServerError(message, error);
  }
  return new ServerError(`${message}: ${String(error)}`);
}

/**
 * Format error for MCP tool response
 */
export function formatToolError(
  error: unknown,
  toolName: string,
): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  let errorMessage: string;

  if (error instanceof ToolInputValidationError) {
    errorMessage = `Validation error in ${toolName}:\n${error.validationErrors.map((e) => `  - ${e.path}: ${e.message}`).join('\n')}`;
  } else if (error instanceof ToolExecutionError) {
    errorMessage = `Error executing ${toolName}: ${error.message}`;
  } else if (isGraphError(error)) {
    // Handle graph-specific errors with user-friendly messages
    errorMessage = formatGraphError(error, toolName);
  } else if (error instanceof Error) {
    errorMessage = `Error in ${toolName}: ${error.message}`;
  } else {
    errorMessage = `Unknown error in ${toolName}: ${String(error)}`;
  }

  return {
    content: [{ type: 'text' as const, text: errorMessage }],
    isError: true,
  };
}

/**
 * Format graph-specific errors with user-friendly messages
 */
function formatGraphError(error: GraphError, toolName: string): string {
  if (error instanceof EntityNotFoundError) {
    const identifier = error.identifier ? ` '${error.identifier}'` : '';
    return `Entity${identifier} not found`;
  }

  if (error instanceof EntityResolutionError) {
    return `Could not resolve entity: ${error.message}`;
  }

  if (error instanceof EmbeddingGenerationError) {
    return `Failed to generate embedding: ${error.message}`;
  }

  if (error instanceof GraphParseError) {
    const nodeType = error.nodeType ? ` (${error.nodeType})` : '';
    return `Failed to parse graph data${nodeType}: ${error.message}`;
  }

  if (error instanceof GraphQueryError) {
    const operation = error.operation ? ` during ${error.operation}` : '';
    return `Graph query failed${operation}: ${error.message}`;
  }

  if (error instanceof RelationshipError) {
    return `Failed to ${error.message.includes('remove') ? 'remove' : 'create'} relationship: ${error.message}`;
  }

  if (error instanceof TemporalError) {
    return `Temporal query failed: ${error.message}`;
  }

  if (error instanceof CausalTraversalError) {
    const direction = error.direction ? ` (${error.direction})` : '';
    return `Causal traversal failed${direction}: ${error.message}`;
  }

  // Generic graph error
  return `Graph error in ${toolName}: ${error.message}`;
}

/**
 * Safely parse a date string, throwing a descriptive error if invalid
 */
export function safeParseDate(dateStr: string, fieldName: string): Date {
  if (!dateStr || dateStr.trim().length === 0) {
    throw new ToolInputValidationError(
      `Missing required date field: ${fieldName}`,
      'date_parse',
      [{ path: fieldName, message: 'Date string is required' }],
    );
  }

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    throw new ToolInputValidationError(
      `Invalid date format for '${fieldName}': ${dateStr}`,
      'date_parse',
      [{ path: fieldName, message: `Invalid date format: ${dateStr}` }],
    );
  }

  return date;
}
