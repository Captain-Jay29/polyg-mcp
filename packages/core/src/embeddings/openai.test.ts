// Tests for OpenAI embeddings provider
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EmbeddingAuthError,
  EmbeddingError,
  EmbeddingInputError,
  EmbeddingModelError,
  EmbeddingRateLimitError,
} from './errors.js';
import { OpenAIEmbeddings } from './openai.js';

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
      embeddings: {
        create: mockCreate,
      },
    })),
    APIError: MockAPIError,
  };
});

describe('OpenAIEmbeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw EmbeddingAuthError if API key is missing', () => {
      expect(() => new OpenAIEmbeddings('')).toThrow(EmbeddingAuthError);
      expect(() => new OpenAIEmbeddings('')).toThrow(
        'OpenAI API key is required',
      );
    });

    it('should create provider with valid API key', () => {
      const provider = new OpenAIEmbeddings('sk-test-key');
      expect(provider).toBeInstanceOf(OpenAIEmbeddings);
    });

    it('should use default model if not specified', () => {
      const provider = new OpenAIEmbeddings('sk-test-key');
      expect(provider).toBeDefined();
    });
  });

  describe('embed', () => {
    it('should return embedding array on success', async () => {
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.embeddings.create as ReturnType<
        typeof vi.fn
      >;

      const mockEmbedding = Array(1536).fill(0.1);
      mockCreate.mockResolvedValueOnce({
        data: [{ embedding: mockEmbedding, index: 0 }],
      });

      const provider = new OpenAIEmbeddings('sk-test-key');
      const result = await provider.embed('test text');

      expect(result).toEqual(mockEmbedding);
      expect(result.length).toBe(1536);
    });

    it('should throw EmbeddingInputError for empty text', async () => {
      const provider = new OpenAIEmbeddings('sk-test-key');
      await expect(provider.embed('')).rejects.toThrow(EmbeddingInputError);
      await expect(provider.embed('   ')).rejects.toThrow(EmbeddingInputError);
    });

    it('should throw EmbeddingError when no embedding in response', async () => {
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.embeddings.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockResolvedValueOnce({
        data: [],
      });

      const provider = new OpenAIEmbeddings('sk-test-key');
      await expect(provider.embed('test')).rejects.toThrow(EmbeddingError);
    });
  });

  describe('embedBatch', () => {
    it('should return embeddings for multiple texts', async () => {
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.embeddings.create as ReturnType<
        typeof vi.fn
      >;

      const mockEmbedding1 = Array(1536).fill(0.1);
      const mockEmbedding2 = Array(1536).fill(0.2);
      mockCreate.mockResolvedValueOnce({
        data: [
          { embedding: mockEmbedding1, index: 0 },
          { embedding: mockEmbedding2, index: 1 },
        ],
      });

      const provider = new OpenAIEmbeddings('sk-test-key');
      const result = await provider.embedBatch(['text1', 'text2']);

      expect(result.length).toBe(2);
      expect(result[0]).toEqual(mockEmbedding1);
      expect(result[1]).toEqual(mockEmbedding2);
    });

    it('should return empty array for empty input', async () => {
      const provider = new OpenAIEmbeddings('sk-test-key');
      const result = await provider.embedBatch([]);
      expect(result).toEqual([]);
    });

    it('should filter out empty texts', async () => {
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.embeddings.create as ReturnType<
        typeof vi.fn
      >;

      const mockEmbedding = Array(1536).fill(0.1);
      mockCreate.mockResolvedValueOnce({
        data: [{ embedding: mockEmbedding, index: 0 }],
      });

      const provider = new OpenAIEmbeddings('sk-test-key');
      await provider.embedBatch(['valid', '', '   ']);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          input: ['valid'],
        }),
      );
    });

    it('should throw EmbeddingInputError when all texts are empty', async () => {
      const provider = new OpenAIEmbeddings('sk-test-key');
      await expect(provider.embedBatch(['', '   '])).rejects.toThrow(
        EmbeddingInputError,
      );
    });

    it('should maintain order based on index', async () => {
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.embeddings.create as ReturnType<
        typeof vi.fn
      >;

      const mockEmbedding1 = Array(1536).fill(0.1);
      const mockEmbedding2 = Array(1536).fill(0.2);
      // Return out of order
      mockCreate.mockResolvedValueOnce({
        data: [
          { embedding: mockEmbedding2, index: 1 },
          { embedding: mockEmbedding1, index: 0 },
        ],
      });

      const provider = new OpenAIEmbeddings('sk-test-key');
      const result = await provider.embedBatch(['text1', 'text2']);

      // Should be sorted by index
      expect(result[0]).toEqual(mockEmbedding1);
      expect(result[1]).toEqual(mockEmbedding2);
    });
  });

  describe('getDimension', () => {
    it('should return 1536 for text-embedding-3-small', () => {
      const provider = new OpenAIEmbeddings(
        'sk-test-key',
        'text-embedding-3-small',
      );
      expect(provider.getDimension()).toBe(1536);
    });

    it('should return 3072 for text-embedding-3-large', () => {
      const provider = new OpenAIEmbeddings(
        'sk-test-key',
        'text-embedding-3-large',
      );
      expect(provider.getDimension()).toBe(3072);
    });
  });

  describe('error handling', () => {
    it('should wrap 401 errors as EmbeddingAuthError', async () => {
      const { APIError } = await import('openai');
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.embeddings.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockRejectedValueOnce(
        new APIError(401, undefined, 'Invalid API key', undefined),
      );

      const provider = new OpenAIEmbeddings('sk-test-key');
      await expect(provider.embed('test')).rejects.toThrow(EmbeddingAuthError);
    });

    it('should wrap 429 errors as EmbeddingRateLimitError', async () => {
      const { APIError } = await import('openai');
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.embeddings.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockRejectedValueOnce(
        new APIError(429, undefined, 'Rate limit exceeded', undefined),
      );

      const provider = new OpenAIEmbeddings('sk-test-key');
      await expect(provider.embed('test')).rejects.toThrow(
        EmbeddingRateLimitError,
      );
    });

    it('should wrap 404 errors as EmbeddingModelError', async () => {
      const { APIError } = await import('openai');
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.embeddings.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockRejectedValueOnce(
        new APIError(404, undefined, 'Model not found', undefined),
      );

      const provider = new OpenAIEmbeddings('sk-test-key');
      await expect(provider.embed('test')).rejects.toThrow(EmbeddingModelError);
    });

    it('should wrap input too long errors as EmbeddingInputError', async () => {
      const { APIError } = await import('openai');
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.embeddings.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockRejectedValueOnce(
        new APIError(400, undefined, 'input too long', undefined),
      );

      const provider = new OpenAIEmbeddings('sk-test-key');
      await expect(provider.embed('test')).rejects.toThrow(EmbeddingInputError);
    });

    it('should wrap unknown errors as EmbeddingError', async () => {
      const OpenAI = (await import('openai')).default;
      const mockClient = new OpenAI({ apiKey: 'test' });
      const mockCreate = mockClient.embeddings.create as ReturnType<
        typeof vi.fn
      >;

      mockCreate.mockRejectedValueOnce(new Error('Unknown error'));

      const provider = new OpenAIEmbeddings('sk-test-key');
      await expect(provider.embed('test')).rejects.toThrow(EmbeddingError);
    });
  });
});
