import type { LLMProvider } from '@polyg-mcp/shared';
// Tests for Intent Classifier and Synthesizer
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClassifierError,
  LLMResponseParseError,
  LLMResponseValidationError,
  SynthesizerError,
} from './errors.js';
import { IntentClassifier } from './intent-classifier.js';
import { Synthesizer } from './synthesizer.js';

describe('IntentClassifier', () => {
  let mockLLM: LLMProvider;
  let classifier: IntentClassifier;

  beforeEach(() => {
    mockLLM = {
      complete: vi.fn(),
    };
    classifier = new IntentClassifier(mockLLM);
  });

  describe('classify', () => {
    it('should classify valid LLM response', async () => {
      const validResponse = JSON.stringify({
        intents: ['semantic', 'entity'],
        entities: [{ mention: 'test entity' }],
        confidence: 0.9,
      });
      vi.mocked(mockLLM.complete).mockResolvedValue(validResponse);

      const result = await classifier.classify({ query: 'test query' });

      expect(result.intents).toEqual(['semantic', 'entity']);
      expect(result.confidence).toBe(0.9);
    });

    it('should throw ClassifierError for empty query', async () => {
      await expect(classifier.classify({ query: '' })).rejects.toThrow(
        ClassifierError,
      );
      await expect(classifier.classify({ query: '   ' })).rejects.toThrow(
        'Query cannot be empty',
      );
    });

    it('should throw ClassifierError when LLM fails', async () => {
      vi.mocked(mockLLM.complete).mockRejectedValue(new Error('LLM error'));

      await expect(classifier.classify({ query: 'test' })).rejects.toThrow(
        ClassifierError,
      );
      await expect(classifier.classify({ query: 'test' })).rejects.toThrow(
        'Failed to get LLM response',
      );
    });

    it('should throw LLMResponseParseError for invalid JSON', async () => {
      vi.mocked(mockLLM.complete).mockResolvedValue('not valid json');

      await expect(classifier.classify({ query: 'test' })).rejects.toThrow(
        LLMResponseParseError,
      );
    });

    it('should throw LLMResponseValidationError for invalid schema', async () => {
      const invalidResponse = JSON.stringify({
        intents: ['invalid_intent'],
        entities: [],
        confidence: 0.9,
      });
      vi.mocked(mockLLM.complete).mockResolvedValue(invalidResponse);

      await expect(classifier.classify({ query: 'test' })).rejects.toThrow(
        LLMResponseValidationError,
      );
    });

    it('should throw LLMResponseValidationError for confidence out of range', async () => {
      const invalidResponse = JSON.stringify({
        intents: ['semantic'],
        entities: [],
        confidence: 1.5, // Invalid - must be 0-1
      });
      vi.mocked(mockLLM.complete).mockResolvedValue(invalidResponse);

      await expect(classifier.classify({ query: 'test' })).rejects.toThrow(
        LLMResponseValidationError,
      );
    });

    it('should validate optional fields correctly', async () => {
      const validResponse = JSON.stringify({
        intents: ['causal'],
        entities: [],
        timeframe: { type: 'specific', value: '2024-01-01' },
        causal_direction: 'upstream',
        confidence: 0.8,
      });
      vi.mocked(mockLLM.complete).mockResolvedValue(validResponse);

      const result = await classifier.classify({ query: 'test' });

      expect(result.causal_direction).toBe('upstream');
      expect(result.timeframe?.type).toBe('specific');
    });
  });
});

describe('Synthesizer', () => {
  let mockLLM: LLMProvider;
  let synthesizer: Synthesizer;

  beforeEach(() => {
    mockLLM = {
      complete: vi.fn(),
    };
    synthesizer = new Synthesizer(mockLLM);
  });

  describe('synthesize', () => {
    const validInput = {
      original_query: 'test query',
      classification: {
        intents: ['semantic' as const],
        entities: [],
        confidence: 0.9,
      },
      graph_results: {
        successful: [],
        failed: [],
      },
    };

    it('should synthesize valid LLM response', async () => {
      const validResponse = JSON.stringify({
        answer: 'The answer is...',
        confidence: 0.85,
        reasoning: {},
        sources: ['source1'],
      });
      vi.mocked(mockLLM.complete).mockResolvedValue(validResponse);

      const result = await synthesizer.synthesize(validInput);

      expect(result.answer).toBe('The answer is...');
      expect(result.confidence).toBe(0.85);
    });

    it('should throw SynthesizerError for empty query', async () => {
      await expect(
        synthesizer.synthesize({ ...validInput, original_query: '' }),
      ).rejects.toThrow(SynthesizerError);
      await expect(
        synthesizer.synthesize({ ...validInput, original_query: '   ' }),
      ).rejects.toThrow('Original query cannot be empty');
    });

    it('should throw SynthesizerError when LLM fails', async () => {
      vi.mocked(mockLLM.complete).mockRejectedValue(new Error('LLM error'));

      await expect(synthesizer.synthesize(validInput)).rejects.toThrow(
        SynthesizerError,
      );
      await expect(synthesizer.synthesize(validInput)).rejects.toThrow(
        'Failed to get LLM response',
      );
    });

    it('should throw LLMResponseParseError for invalid JSON', async () => {
      vi.mocked(mockLLM.complete).mockResolvedValue('not valid json');

      await expect(synthesizer.synthesize(validInput)).rejects.toThrow(
        LLMResponseParseError,
      );
    });

    it('should throw LLMResponseValidationError for missing answer', async () => {
      const invalidResponse = JSON.stringify({
        confidence: 0.85,
        reasoning: {},
        sources: [],
      });
      vi.mocked(mockLLM.complete).mockResolvedValue(invalidResponse);

      await expect(synthesizer.synthesize(validInput)).rejects.toThrow(
        LLMResponseValidationError,
      );
    });

    it('should throw LLMResponseValidationError for invalid confidence', async () => {
      const invalidResponse = JSON.stringify({
        answer: 'Test',
        confidence: -0.5, // Invalid - must be 0-1
        reasoning: {},
        sources: [],
      });
      vi.mocked(mockLLM.complete).mockResolvedValue(invalidResponse);

      await expect(synthesizer.synthesize(validInput)).rejects.toThrow(
        LLMResponseValidationError,
      );
    });

    it('should validate complex reasoning correctly', async () => {
      const validResponse = JSON.stringify({
        answer: 'Complex answer',
        confidence: 0.9,
        reasoning: {
          causal_chain: [{ cause: 'A', effect: 'B', confidence: 0.8 }],
        },
        sources: ['db', 'api'],
        follow_ups: ['What about X?'],
      });
      vi.mocked(mockLLM.complete).mockResolvedValue(validResponse);

      const result = await synthesizer.synthesize(validInput);

      expect(result.reasoning.causal_chain).toHaveLength(1);
      expect(result.follow_ups).toEqual(['What about X?']);
    });
  });
});

describe('Error types', () => {
  describe('LLMResponseParseError', () => {
    it('should store raw response', () => {
      const error = new LLMResponseParseError('Parse failed', 'raw response');
      expect(error.rawResponse).toBe('raw response');
      expect(error.name).toBe('LLMResponseParseError');
    });
  });

  describe('LLMResponseValidationError', () => {
    it('should store validation errors and format them', () => {
      // Use a minimal mock - cast to any to avoid complex ZodIssue typing
      const validationErrors = [
        {
          path: ['intents', 0],
          message: 'Invalid enum value',
          code: 'invalid_enum_value',
          received: 'invalid',
          options: ['semantic', 'temporal', 'causal', 'entity'],
        },
      ] as unknown as LLMResponseValidationError['validationErrors'];

      const error = new LLMResponseValidationError(
        'Validation failed',
        '{}',
        validationErrors,
      );

      expect(error.validationErrors).toEqual(validationErrors);
      expect(error.getFormattedErrors()).toContain('intents.0');
      expect(error.name).toBe('LLMResponseValidationError');
    });
  });
});
