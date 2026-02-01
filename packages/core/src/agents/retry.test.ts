import { describe, expect, it, vi } from 'vitest';
import { RateLimitError } from '../llm/errors.js';
import { withRetry } from './retry.js';

describe('withRetry', () => {
  it('should return result on first try if successful', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on RateLimitError and succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError('Rate limited'))
      .mockResolvedValueOnce('success after retry');

    const result = await withRetry(fn, {
      maxRetries: 2,
      initialDelayMs: 10, // Fast for testing
    });

    expect(result).toBe('success after retry');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should use retryAfter from RateLimitError when provided', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError('Rate limited', 0.01)) // 10ms
      .mockResolvedValueOnce('success');

    const start = Date.now();
    const result = await withRetry(fn, { maxRetries: 2 });
    const elapsed = Date.now() - start;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
    // Should have waited at least 10ms (but less than 1000ms default)
    expect(elapsed).toBeGreaterThanOrEqual(5);
    expect(elapsed).toBeLessThan(500);
  });

  it('should throw after exhausting all retries', async () => {
    const rateLimitError = new RateLimitError('Rate limited');
    const fn = vi.fn().mockRejectedValue(rateLimitError);

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
      }),
    ).rejects.toThrow(RateLimitError);

    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('should not retry on non-RateLimitError', async () => {
    const error = new Error('Generic error');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { maxRetries: 2 })).rejects.toThrow(
      'Generic error',
    );

    expect(fn).toHaveBeenCalledTimes(1); // No retry
  });

  it('should respect maxDelayMs cap', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError('Rate limited', 100)) // 100 seconds
      .mockResolvedValueOnce('success');

    const start = Date.now();
    const result = await withRetry(fn, {
      maxRetries: 2,
      maxDelayMs: 50, // Cap at 50ms
    });
    const elapsed = Date.now() - start;

    expect(result).toBe('success');
    // Should have capped delay at 50ms, not waited 100s
    expect(elapsed).toBeLessThan(200);
  });

  it('should use exponential backoff when no retryAfter', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError('Rate limited'))
      .mockRejectedValueOnce(new RateLimitError('Rate limited'))
      .mockResolvedValueOnce('success');

    const start = Date.now();
    await withRetry(fn, {
      maxRetries: 2,
      initialDelayMs: 10,
      backoffMultiplier: 2,
    });
    const elapsed = Date.now() - start;

    expect(fn).toHaveBeenCalledTimes(3);
    // First retry: 10ms, Second retry: 20ms = 30ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(25);
  });

  it('should pass with zero maxRetries (no retries)', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn, { maxRetries: 0 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw on first failure with zero maxRetries', async () => {
    const fn = vi.fn().mockRejectedValue(new RateLimitError('Rate limited'));

    await expect(withRetry(fn, { maxRetries: 0 })).rejects.toThrow(
      RateLimitError,
    );

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
