import { describe, expect, it } from 'vitest';
import {
  ConfigValidationError,
  DEFAULT_CONFIG,
  loadConfig,
  SynthesizerOutputSchema,
  VERSION,
  validateEmbeddingsConfig,
  validateFalkorDBConfig,
  validateLLMConfig,
} from './index.js';

describe('shared', () => {
  it('exports VERSION', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('exports DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG).toBeDefined();
    expect(DEFAULT_CONFIG.falkordb).toBeDefined();
    expect(DEFAULT_CONFIG.llm).toBeDefined();
  });
});

describe('config validation', () => {
  describe('loadConfig', () => {
    it('should return valid default config', () => {
      const config = loadConfig();
      expect(config.falkordb.host).toBe('localhost');
      expect(config.falkordb.port).toBe(6379);
      expect(config.llm.provider).toBe('openai');
    });

    it('should use default token limits when env vars not set', () => {
      const originalClassifier = process.env.CLASSIFIER_MAX_TOKENS;
      const originalSynthesizer = process.env.SYNTHESIZER_MAX_TOKENS;
      delete process.env.CLASSIFIER_MAX_TOKENS;
      delete process.env.SYNTHESIZER_MAX_TOKENS;

      const config = loadConfig();
      expect(config.llm.classifierMaxTokens).toBe(2000);
      expect(config.llm.synthesizerMaxTokens).toBe(2000);

      // Restore
      if (originalClassifier)
        process.env.CLASSIFIER_MAX_TOKENS = originalClassifier;
      if (originalSynthesizer)
        process.env.SYNTHESIZER_MAX_TOKENS = originalSynthesizer;
    });

    it('should parse token limits from env vars', () => {
      const originalClassifier = process.env.CLASSIFIER_MAX_TOKENS;
      const originalSynthesizer = process.env.SYNTHESIZER_MAX_TOKENS;
      process.env.CLASSIFIER_MAX_TOKENS = '500';
      process.env.SYNTHESIZER_MAX_TOKENS = '1000';

      const config = loadConfig();
      expect(config.llm.classifierMaxTokens).toBe(500);
      expect(config.llm.synthesizerMaxTokens).toBe(1000);

      // Restore
      if (originalClassifier) {
        process.env.CLASSIFIER_MAX_TOKENS = originalClassifier;
      } else {
        delete process.env.CLASSIFIER_MAX_TOKENS;
      }
      if (originalSynthesizer) {
        process.env.SYNTHESIZER_MAX_TOKENS = originalSynthesizer;
      } else {
        delete process.env.SYNTHESIZER_MAX_TOKENS;
      }
    });

    it('should use default for invalid token limit values', () => {
      const originalClassifier = process.env.CLASSIFIER_MAX_TOKENS;
      const originalSynthesizer = process.env.SYNTHESIZER_MAX_TOKENS;
      process.env.CLASSIFIER_MAX_TOKENS = 'not-a-number';
      process.env.SYNTHESIZER_MAX_TOKENS = '-100';

      const config = loadConfig();
      expect(config.llm.classifierMaxTokens).toBe(2000);
      expect(config.llm.synthesizerMaxTokens).toBe(2000);

      // Restore
      if (originalClassifier) {
        process.env.CLASSIFIER_MAX_TOKENS = originalClassifier;
      } else {
        delete process.env.CLASSIFIER_MAX_TOKENS;
      }
      if (originalSynthesizer) {
        process.env.SYNTHESIZER_MAX_TOKENS = originalSynthesizer;
      } else {
        delete process.env.SYNTHESIZER_MAX_TOKENS;
      }
    });

    it('should merge overrides with defaults', () => {
      const config = loadConfig({
        falkordb: {
          host: 'custom-host',
          port: 6379,
          graphName: 'polyg',
        },
      });
      expect(config.falkordb.host).toBe('custom-host');
      expect(config.falkordb.port).toBe(6379); // Default preserved
    });

    it('should throw ConfigValidationError for invalid port', () => {
      expect(() =>
        loadConfig({
          falkordb: {
            host: 'localhost',
            port: -1,
            graphName: 'polyg',
          },
        }),
      ).toThrow(ConfigValidationError);
    });

    it('should throw ConfigValidationError for invalid provider', () => {
      expect(() =>
        loadConfig({
          llm: {
            provider: 'invalid' as 'openai',
            model: 'gpt-4',
            classifierMaxTokens: 500,
            synthesizerMaxTokens: 1000,
          },
        }),
      ).toThrow(ConfigValidationError);
    });
  });

  describe('validateFalkorDBConfig', () => {
    it('should validate valid config', () => {
      const config = validateFalkorDBConfig({
        host: 'localhost',
        port: 6379,
        graphName: 'test',
      });
      expect(config.host).toBe('localhost');
    });

    it('should throw for missing host', () => {
      expect(() =>
        validateFalkorDBConfig({
          port: 6379,
          graphName: 'test',
        }),
      ).toThrow(ConfigValidationError);
    });

    it('should throw for invalid port range', () => {
      expect(() =>
        validateFalkorDBConfig({
          host: 'localhost',
          port: 70000,
          graphName: 'test',
        }),
      ).toThrow(ConfigValidationError);
    });
  });

  describe('validateLLMConfig', () => {
    it('should validate valid config', () => {
      const config = validateLLMConfig({
        provider: 'openai',
        model: 'gpt-4',
        classifierMaxTokens: 500,
        synthesizerMaxTokens: 1000,
      });
      expect(config.provider).toBe('openai');
    });

    it('should throw for invalid provider', () => {
      expect(() =>
        validateLLMConfig({
          provider: 'invalid',
          model: 'gpt-4',
          classifierMaxTokens: 500,
          synthesizerMaxTokens: 1000,
        }),
      ).toThrow(ConfigValidationError);
    });

    it('should throw for non-positive maxTokens', () => {
      expect(() =>
        validateLLMConfig({
          provider: 'openai',
          model: 'gpt-4',
          classifierMaxTokens: 0,
          synthesizerMaxTokens: 1000,
        }),
      ).toThrow(ConfigValidationError);
    });
  });

  describe('validateEmbeddingsConfig', () => {
    it('should validate valid config', () => {
      const config = validateEmbeddingsConfig({
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimensions: 1536,
      });
      expect(config.provider).toBe('openai');
    });

    it('should throw for invalid provider', () => {
      expect(() =>
        validateEmbeddingsConfig({
          provider: 'invalid',
          model: 'text-embedding-3-small',
          dimensions: 1536,
        }),
      ).toThrow(ConfigValidationError);
    });
  });
});

describe('schema validation', () => {
  describe('SynthesizerOutputSchema', () => {
    it('should validate valid synthesizer output', () => {
      const valid = {
        answer: 'The answer is...',
        confidence: 0.85,
        reasoning: {},
        sources: ['source1', 'source2'],
      };
      const result = SynthesizerOutputSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject missing answer', () => {
      const invalid = {
        confidence: 0.85,
        reasoning: {},
        sources: [],
      };
      const result = SynthesizerOutputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should validate with full reasoning', () => {
      const valid = {
        answer: 'Test answer',
        confidence: 0.9,
        reasoning: {
          causal_chain: [{ cause: 'A', effect: 'B', confidence: 0.8 }],
          entities_involved: [
            {
              uuid: '123',
              name: 'Entity',
              entity_type: 'Person',
              created_at: '2024-01-01',
            },
          ],
        },
        sources: [],
        follow_ups: ['Question 1?'],
      };
      const result = SynthesizerOutputSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });
});
