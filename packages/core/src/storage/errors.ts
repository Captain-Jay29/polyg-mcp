// Custom error types for storage layer

/**
 * Base error for all storage-related errors
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'StorageError';

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when connection to database fails or is not established
 */
export class ConnectionError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'ConnectionError';
  }
}

/**
 * Thrown when a database query fails
 */
export class QueryError extends StorageError {
  constructor(
    message: string,
    public readonly query?: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'QueryError';
  }
}

/**
 * Thrown when storage configuration is invalid
 */
export class StorageConfigError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'StorageConfigError';
  }
}

/**
 * Thrown when input validation fails
 */
export class ValidationError extends StorageError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Thrown when a requested entity is not found
 */
export class NotFoundError extends StorageError {
  constructor(
    message: string,
    public readonly entityType?: string,
    public readonly identifier?: string,
  ) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Thrown when operation times out
 */
export class TimeoutError extends StorageError {
  constructor(
    message: string,
    public readonly timeoutMs?: number,
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Check if an error is a StorageError or subclass
 */
export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}

/**
 * Wrap unknown errors in a StorageError
 */
export function wrapError(error: unknown, message: string): StorageError {
  if (error instanceof StorageError) {
    return error;
  }
  if (error instanceof Error) {
    return new StorageError(message, error);
  }
  return new StorageError(`${message}: ${String(error)}`);
}
