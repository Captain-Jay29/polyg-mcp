// Server error types for polyg-mcp
// Follows the same pattern as core package errors

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
