import { describe, expect, it, vi } from 'vitest';
import {
  buildMagmaPrompt,
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

describe('buildMagmaPrompt', () => {
  it('should include context and question', () => {
    const prompt = buildMagmaPrompt('Node: Alice works at Acme', 'Where does Alice work?');
    expect(prompt).toContain('## Retrieved Context');
    expect(prompt).toContain('Node: Alice works at Acme');
    expect(prompt).toContain('## Question');
    expect(prompt).toContain('Where does Alice work?');
  });

  it('should match baseline prompt pattern', () => {
    const prompt = buildMagmaPrompt('test context', 'test question');
    expect(prompt).toContain('Provide a concise answer based only on the context above.');
  });
});

describe('createMagmaRecall', () => {
  it('should call recallRaw and linearize + synthesize via text mode', async () => {
    const mockOrchestrator = {
      recallRaw: vi.fn().mockResolvedValue({
        merged: {
          nodes: [{ uuid: '1', data: {}, viewCount: 1, views: ['semantic'], finalScore: 0.9 }],
          viewContributions: { semantic: 1, entity: 0, temporal: 0, causal: 0 },
        },
        seeds: {
          entitySeeds: [{ entityId: 'e1', sourceConceptId: 'c1', semanticScore: 0.85 }],
          conceptIds: ['c1'],
          stats: { conceptsSearched: 1, entitiesFound: 1, conceptsWithoutLinks: 0 },
        },
        intent: { type: 'WHAT', entities: [], depthHints: { entity: 3, temporal: 1, causal: 1 } },
        timing: { semanticMs: 10, seedExtractionMs: 5, expansionMs: 20, mergeMs: 5, totalMs: 40 },
        failedExpansions: [],
      }),
    };
    const mockLlm = {
      complete: vi.fn().mockResolvedValue('Alice works at Acme Corp'),
    };

    const recall = createMagmaRecall(mockOrchestrator as any, mockLlm as any);
    const result = await recall('Where does Alice work?');

    expect(mockOrchestrator.recallRaw).toHaveBeenCalledWith('Where does Alice work?');
    expect(mockLlm.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        responseFormat: 'text',
        maxTokens: 256,
      }),
    );
    expect(result.answer).toBe('Alice works at Acme Corp');
    expect(result.confidence).toBe(0.85);
  });

  it('should return empty answer when no nodes found', async () => {
    const mockOrchestrator = {
      recallRaw: vi.fn().mockResolvedValue({
        merged: { nodes: [], viewContributions: {} },
        seeds: { entitySeeds: [], conceptIds: [], stats: {} },
        intent: { type: 'WHAT', entities: [], depthHints: { entity: 3, temporal: 1, causal: 1 } },
        timing: {},
        failedExpansions: [],
      }),
    };
    const mockLlm = { complete: vi.fn() };

    const recall = createMagmaRecall(mockOrchestrator as any, mockLlm as any);
    const result = await recall('test');

    expect(result.answer).toBe('No relevant information found.');
    expect(result.confidence).toBe(0);
    expect(mockLlm.complete).not.toHaveBeenCalled();
  });

  it('should return fallback on recallRaw errors', async () => {
    const mockOrchestrator = {
      recallRaw: vi.fn().mockRejectedValue(new Error('Pipeline failed')),
    };
    const mockLlm = { complete: vi.fn() };

    const recall = createMagmaRecall(mockOrchestrator as any, mockLlm as any);
    const result = await recall('test');

    expect(result.answer).toBe('Error: recall failed');
    expect(result.confidence).toBe(0);
  });

  it('should derive confidence from max semantic seed score', async () => {
    const mockOrchestrator = {
      recallRaw: vi.fn().mockResolvedValue({
        merged: {
          nodes: [{ uuid: '1', data: {}, viewCount: 1, views: ['semantic'], finalScore: 0.5 }],
          viewContributions: { semantic: 1, entity: 0, temporal: 0, causal: 0 },
        },
        seeds: {
          entitySeeds: [
            { entityId: 'e1', sourceConceptId: 'c1', semanticScore: 0.6 },
            { entityId: 'e2', sourceConceptId: 'c2', semanticScore: 0.9 },
            { entityId: 'e3', sourceConceptId: 'c3', semanticScore: 0.7 },
          ],
          conceptIds: ['c1', 'c2', 'c3'],
          stats: {},
        },
        intent: { type: 'WHAT', entities: [], depthHints: { entity: 3, temporal: 1, causal: 1 } },
        timing: {},
        failedExpansions: [],
      }),
    };
    const mockLlm = { complete: vi.fn().mockResolvedValue('answer') };

    const recall = createMagmaRecall(mockOrchestrator as any, mockLlm as any);
    const result = await recall('test');

    expect(result.confidence).toBe(0.9); // max of 0.6, 0.9, 0.7
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
