// Tests for OpenAI LLM provider
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthenticationError,
  ContentFilterError,
  ContextLengthError,
  LLMError,
  LLMValidationError,
  ModelError,
  PermissionError,
  RateLimitError,
  ServerError,
} from './errors.js';
import { OpenAIProvider } from './openai.js';

// Mock the OpenAI module
vi.mock('openai', () => {
  const mockCreate = vi.fn();

  // Match actual OpenAI APIError signature:
  // constructor(status, error, message, headers)
  class MockAPIError extends Error {
    status: number;
    error: object | undefined;
    headers: Record<string, string> | undefined;
    constructor(
      status: number,
      error: object | undefined,
      message: string | undefined,
      headers: Record<string, string> | undefined,
    ) {
      super(message || 'Unknown error');
      this.name = 'APIError';
      this.status = status;
      this.error = error;
      this.headers = headers;
    }
  }

  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
    APIError: MockAPIError,
  };
});

describe('OpenAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw AuthenticationError if API key is missing', () => {
      expect(() => new OpenAIProvider('')).toThrow(AuthenticationError);
      expect(() => new OpenAIProvider('')).toThrow(
        'OpenAI API key is required',
      );
    });

    it('should create provider with valid API key', () => {
      const provider = new OpenAIProvider('sk-test-key');
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it('should use default model if not specified', () => {
      const provider = new OpenAIProvider('sk-test-key');
      expect(provider).toBeDefined();
    });

    it('should accept custom model', () => {
      const provider = new OpenAIProvider('sk-test-key', 'gpt-5');
      expect(provider).toBeDefined();
    });
  });

  describe('complete', () => {
    it('should return completion text on success', async () => {
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.chat.completions.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Hello, world!' } }],
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.complete({ prompt: 'Say hello' });

      expect(result).toBe('Hello, world!');
    });

    it('should throw LLMError when no content in response', async () => {
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.chat.completions.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null } }],
      });

      const provider = new OpenAIProvider('sk-test-key');
      await expect(provider.complete({ prompt: 'test' })).rejects.toThrow(
        LLMError,
      );
    });

    it('should pass responseFormat as json_object when specified', async () => {
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.chat.completions.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"key": "value"}' } }],
      });

      const provider = new OpenAIProvider('sk-test-key');
      await provider.complete({ prompt: 'test', responseFormat: 'json' });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: { type: 'json_object' },
        }),
      );
    });

    it('should pass maxTokens when specified', async () => {
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.chat.completions.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'response' } }],
      });

      const provider = new OpenAIProvider('sk-test-key');
      await provider.complete({ prompt: 'test', maxTokens: 100 });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 100,
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should wrap 401 errors as AuthenticationError', async () => {
      const { APIError } = await import('openai');
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.chat.completions.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockRejectedValueOnce(
        new APIError(401, undefined, 'Invalid API key', undefined),
      );

      const provider = new OpenAIProvider('sk-test-key');
      await expect(provider.complete({ prompt: 'test' })).rejects.toThrow(
        AuthenticationError,
      );
    });

    it('should wrap 429 errors as RateLimitError', async () => {
      const { APIError } = await import('openai');
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.chat.completions.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockRejectedValueOnce(
        new APIError(429, undefined, 'Rate limit exceeded', undefined),
      );

      const provider = new OpenAIProvider('sk-test-key');
      await expect(provider.complete({ prompt: 'test' })).rejects.toThrow(
        RateLimitError,
      );
    });

    it('should wrap 404 errors as ModelError', async () => {
      const { APIError } = await import('openai');
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.chat.completions.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockRejectedValueOnce(
        new APIError(404, undefined, 'Model not found', undefined),
      );

      const provider = new OpenAIProvider('sk-test-key');
      await expect(provider.complete({ prompt: 'test' })).rejects.toThrow(
        ModelError,
      );
    });

    it('should wrap context length errors as ContextLengthError', async () => {
      const { APIError } = await import('openai');
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.chat.completions.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockRejectedValueOnce(
        new APIError(
          400,
          undefined,
          'maximum context length exceeded',
          undefined,
        ),
      );

      const provider = new OpenAIProvider('sk-test-key');
      await expect(provider.complete({ prompt: 'test' })).rejects.toThrow(
        ContextLengthError,
      );
    });

    it('should wrap content filter errors as ContentFilterError', async () => {
      const { APIError } = await import('openai');
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.chat.completions.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockRejectedValueOnce(
        new APIError(400, undefined, 'content_filter triggered', undefined),
      );

      const provider = new OpenAIProvider('sk-test-key');
      await expect(provider.complete({ prompt: 'test' })).rejects.toThrow(
        ContentFilterError,
      );
    });

    it('should wrap unknown errors as LLMError', async () => {
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.chat.completions.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockRejectedValueOnce(new Error('Unknown error'));

      const provider = new OpenAIProvider('sk-test-key');
      await expect(provider.complete({ prompt: 'test' })).rejects.toThrow(
        LLMError,
      );
    });

    it('should wrap 403 errors as PermissionError', async () => {
      const { APIError } = await import('openai');
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.chat.completions.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockRejectedValueOnce(
        new APIError(403, undefined, 'Permission denied', undefined),
      );

      const provider = new OpenAIProvider('sk-test-key');
      await expect(provider.complete({ prompt: 'test' })).rejects.toThrow(
        PermissionError,
      );
    });

    it('should wrap 5xx errors as ServerError', async () => {
      const { APIError } = await import('openai');
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.chat.completions.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockRejectedValueOnce(
        new APIError(500, undefined, 'Internal server error', undefined),
      );

      const provider = new OpenAIProvider('sk-test-key');
      await expect(provider.complete({ prompt: 'test' })).rejects.toThrow(
        ServerError,
      );
    });

    it('should wrap 503 errors as ServerError', async () => {
      const { APIError } = await import('openai');
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.chat.completions.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockRejectedValueOnce(
        new APIError(503, undefined, 'Service unavailable', undefined),
      );

      const provider = new OpenAIProvider('sk-test-key');
      await expect(provider.complete({ prompt: 'test' })).rejects.toThrow(
        ServerError,
      );
    });
  });

  describe('input validation', () => {
    it('should throw LLMValidationError for empty prompt', async () => {
      const provider = new OpenAIProvider('sk-test-key');
      await expect(provider.complete({ prompt: '' })).rejects.toThrow(
        LLMValidationError,
      );
      await expect(provider.complete({ prompt: '' })).rejects.toThrow(
        'Prompt cannot be empty',
      );
    });

    it('should throw LLMValidationError for whitespace-only prompt', async () => {
      const provider = new OpenAIProvider('sk-test-key');
      await expect(provider.complete({ prompt: '   ' })).rejects.toThrow(
        LLMValidationError,
      );
    });

    it('should throw LLMValidationError for negative maxTokens', async () => {
      const provider = new OpenAIProvider('sk-test-key');
      await expect(
        provider.complete({ prompt: 'test', maxTokens: -1 }),
      ).rejects.toThrow(LLMValidationError);
      await expect(
        provider.complete({ prompt: 'test', maxTokens: -1 }),
      ).rejects.toThrow('maxTokens must be a positive integer');
    });

    it('should throw LLMValidationError for zero maxTokens', async () => {
      const provider = new OpenAIProvider('sk-test-key');
      await expect(
        provider.complete({ prompt: 'test', maxTokens: 0 }),
      ).rejects.toThrow(LLMValidationError);
    });

    it('should throw LLMValidationError for non-integer maxTokens', async () => {
      const provider = new OpenAIProvider('sk-test-key');
      await expect(
        provider.complete({ prompt: 'test', maxTokens: 1.5 }),
      ).rejects.toThrow(LLMValidationError);
    });
  });
});
