// Retry utility with exponential backoff for LLM calls
import { loggers } from '@polyg-mcp/shared';
import { RateLimitError } from '../llm/errors.js';

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in ms between retries (default: 30000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 2,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Execute a function with automatic retry on rate limit errors.
 *
 * Uses exponential backoff with the following strategy:
 * 1. If RateLimitError has retryAfter, wait that duration
 * 2. Otherwise, use exponential backoff: initialDelay * multiplier^attempt
 * 3. Never exceed maxDelay
 *
 * @param fn - The async function to execute
 * @param config - Optional retry configuration
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: RetryConfig,
): Promise<T> {
  const { maxRetries, initialDelayMs, maxDelayMs, backoffMultiplier } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only retry on rate limit errors
      if (!(error instanceof RateLimitError)) {
        throw error;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        throw error;
      }

      // Calculate delay
      let delayMs: number;

      if (error.retryAfter !== undefined && error.retryAfter > 0) {
        // Use server-provided retry-after (in seconds)
        delayMs = Math.min(error.retryAfter * 1000, maxDelayMs);
        loggers.agents.warn(
          `Rate limited, waiting ${delayMs}ms (server retry-after: ${error.retryAfter}s)`,
          { attempt: attempt + 1, maxAttempts: maxRetries + 1 },
        );
      } else {
        // Use exponential backoff
        delayMs = Math.min(
          initialDelayMs * backoffMultiplier ** attempt,
          maxDelayMs,
        );
        loggers.agents.warn(
          `Rate limited, waiting ${delayMs}ms (exponential backoff)`,
          { attempt: attempt + 1, maxAttempts: maxRetries + 1 },
        );
      }

      await sleep(delayMs);
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError ?? new Error('Retry failed with unknown error');
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
