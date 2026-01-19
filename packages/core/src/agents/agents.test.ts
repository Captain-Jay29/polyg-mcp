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

  describe('classifyMAGMA', () => {
    it('should classify valid MAGMA LLM response', async () => {
      const validResponse = JSON.stringify({
        type: 'WHY',
        entities: ['server', 'deployment'],
        temporalHints: [],
        depthHints: { entity: 1, temporal: 1, causal: 3 },
        confidence: 0.9,
      });
      vi.mocked(mockLLM.complete).mockResolvedValue(validResponse);

      const result = await classifier.classifyMAGMA({
        query: 'Why did the server crash?',
      });

      expect(result.type).toBe('WHY');
      expect(result.entities).toEqual(['server', 'deployment']);
      expect(result.depthHints.causal).toBe(3);
      expect(result.confidence).toBe(0.9);
    });

    it('should throw ClassifierError for empty query', async () => {
      await expect(classifier.classifyMAGMA({ query: '' })).rejects.toThrow(
        ClassifierError,
      );
      await expect(classifier.classifyMAGMA({ query: '   ' })).rejects.toThrow(
        'Query cannot be empty',
      );
    });

    it('should throw ClassifierError when LLM fails', async () => {
      vi.mocked(mockLLM.complete).mockRejectedValue(new Error('LLM error'));

      await expect(classifier.classifyMAGMA({ query: 'test' })).rejects.toThrow(
        ClassifierError,
      );
      await expect(classifier.classifyMAGMA({ query: 'test' })).rejects.toThrow(
        'Failed to get LLM response',
      );
    });

    it('should throw LLMResponseParseError for invalid JSON', async () => {
      vi.mocked(mockLLM.complete).mockResolvedValue('not valid json');

      await expect(classifier.classifyMAGMA({ query: 'test' })).rejects.toThrow(
        LLMResponseParseError,
      );
    });

    it('should throw LLMResponseValidationError for invalid schema', async () => {
      const invalidResponse = JSON.stringify({
        type: 'INVALID_TYPE',
        entities: [],
        depthHints: { entity: 1, temporal: 1, causal: 1 },
        confidence: 0.9,
      });
      vi.mocked(mockLLM.complete).mockResolvedValue(invalidResponse);

      await expect(classifier.classifyMAGMA({ query: 'test' })).rejects.toThrow(
        LLMResponseValidationError,
      );
    });

    it('should throw LLMResponseValidationError for confidence out of range', async () => {
      const invalidResponse = JSON.stringify({
        type: 'WHY',
        entities: [],
        depthHints: { entity: 1, temporal: 1, causal: 1 },
        confidence: 1.5, // Invalid - must be 0-1
      });
      vi.mocked(mockLLM.complete).mockResolvedValue(invalidResponse);

      await expect(classifier.classifyMAGMA({ query: 'test' })).rejects.toThrow(
        LLMResponseValidationError,
      );
    });

    it('should validate all MAGMA intent types', async () => {
      const intentTypes = ['WHY', 'WHEN', 'WHO', 'WHAT', 'EXPLORE'];

      for (const type of intentTypes) {
        const validResponse = JSON.stringify({
          type,
          entities: ['test'],
          temporalHints: [],
          depthHints: { entity: 2, temporal: 2, causal: 2 },
          confidence: 0.8,
        });
        vi.mocked(mockLLM.complete).mockResolvedValue(validResponse);

        const result = await classifier.classifyMAGMA({ query: 'test' });
        expect(result.type).toBe(type);
      }
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
          path: ['type'],
          message: 'Invalid enum value',
          code: 'invalid_enum_value',
          received: 'INVALID',
          options: ['WHY', 'WHEN', 'WHO', 'WHAT', 'EXPLORE'],
        },
      ] as unknown as LLMResponseValidationError['validationErrors'];

      const error = new LLMResponseValidationError(
        'Validation failed',
        '{}',
        validationErrors,
      );

      expect(error.validationErrors).toEqual(validationErrors);
      expect(error.getFormattedErrors()).toContain('type');
      expect(error.name).toBe('LLMResponseValidationError');
    });
  });
});
