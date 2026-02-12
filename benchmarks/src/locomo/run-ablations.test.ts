import { describe, expect, it, vi } from 'vitest';
import {
  createMagmaRecall,
  getVariantConfig,
  VARIANT_CONFIGS,
  type VariantConfig,
} from './run-ablations.js';

describe('VARIANT_CONFIGS', () => {
  it('should define exactly 6 variants', () => {
    expect(VARIANT_CONFIGS).toHaveLength(6);
  });

  it('should have unique keys', () => {
    const keys = VARIANT_CONFIGS.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('should map "full" to no disabled graphs and no forced depth', () => {
    const full = getVariantConfig('full');
    expect(full).toBeDefined();
    expect(full!.disabledGraphs).toEqual([]);
    expect(full!.forceUniformDepth).toBeUndefined();
  });

  it('should map "minus-adaptive" to forced uniform depth 2', () => {
    const v = getVariantConfig('minus-adaptive');
    expect(v).toBeDefined();
    expect(v!.disabledGraphs).toEqual([]);
    expect(v!.forceUniformDepth).toBe(2);
  });

  it('should map "minus-causal" to causal disabled', () => {
    const v = getVariantConfig('minus-causal');
    expect(v).toBeDefined();
    expect(v!.disabledGraphs).toEqual(['causal']);
    expect(v!.forceUniformDepth).toBeUndefined();
  });

  it('should map "minus-temporal" to temporal disabled', () => {
    const v = getVariantConfig('minus-temporal');
    expect(v).toBeDefined();
    expect(v!.disabledGraphs).toEqual(['temporal']);
    expect(v!.forceUniformDepth).toBeUndefined();
  });

  it('should map "minus-entity" to entity disabled', () => {
    const v = getVariantConfig('minus-entity');
    expect(v).toBeDefined();
    expect(v!.disabledGraphs).toEqual(['entity']);
    expect(v!.forceUniformDepth).toBeUndefined();
  });

  it('should map "semantic-only" to all three graphs disabled', () => {
    const v = getVariantConfig('semantic-only');
    expect(v).toBeDefined();
    expect(v!.disabledGraphs).toEqual(['entity', 'temporal', 'causal']);
    expect(v!.forceUniformDepth).toBeUndefined();
  });

  it('should return undefined for unknown variant key', () => {
    expect(getVariantConfig('nonexistent')).toBeUndefined();
  });
});

describe('createMagmaRecall', () => {
  it('should return a RecallFn that calls orchestrator.recall()', async () => {
    const mockOrchestrator = {
      recall: vi.fn().mockResolvedValue({
        answer: 'test answer',
        confidence: 0.85,
        reasoning: {},
        sources: ['semantic'],
        follow_ups: [],
      }),
    };

    const recall = createMagmaRecall(mockOrchestrator as any);
    const result = await recall('What happened?');

    expect(mockOrchestrator.recall).toHaveBeenCalledWith('What happened?');
    expect(result).toEqual({
      answer: 'test answer',
      confidence: 0.85,
    });
  });

  it('should propagate orchestrator errors', async () => {
    const mockOrchestrator = {
      recall: vi.fn().mockRejectedValue(new Error('Pipeline failed')),
    };

    const recall = createMagmaRecall(mockOrchestrator as any);
    await expect(recall('test')).rejects.toThrow('Pipeline failed');
  });
});

describe('variant config completeness', () => {
  const expectedVariants: Record<
    string,
    { disabledGraphs: string[]; forceUniformDepth?: number }
  > = {
    full: { disabledGraphs: [] },
    'minus-adaptive': { disabledGraphs: [], forceUniformDepth: 2 },
    'minus-causal': { disabledGraphs: ['causal'] },
    'minus-temporal': { disabledGraphs: ['temporal'] },
    'minus-entity': { disabledGraphs: ['entity'] },
    'semantic-only': { disabledGraphs: ['entity', 'temporal', 'causal'] },
  };

  for (const [key, expected] of Object.entries(expectedVariants)) {
    it(`variant "${key}" matches expected config`, () => {
      const config = getVariantConfig(key);
      expect(config).toBeDefined();
      expect(config!.disabledGraphs).toEqual(expected.disabledGraphs);
      if (expected.forceUniformDepth !== undefined) {
        expect(config!.forceUniformDepth).toBe(expected.forceUniformDepth);
      } else {
        expect(config!.forceUniformDepth).toBeUndefined();
      }
    });
  }
});
