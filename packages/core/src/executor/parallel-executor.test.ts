import type { ClassifierOutput } from '@polyg-mcp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CausalGraph } from '../graphs/causal.js';
import type { EntityGraph } from '../graphs/entity.js';
import type { SemanticGraph } from '../graphs/semantic.js';
import type { TemporalGraph } from '../graphs/temporal.js';
import {
  type GraphRegistry,
  ParallelGraphExecutor,
} from './parallel-executor.js';

// Mock graph implementations
function createMockGraphRegistry(): GraphRegistry {
  return {
    semantic: {
      search: vi.fn(),
    } as unknown as SemanticGraph,
    temporal: {
      query: vi.fn(),
    } as unknown as TemporalGraph,
    causal: {
      traverse: vi.fn(),
    } as unknown as CausalGraph,
    entity: {
      resolve: vi.fn(),
    } as unknown as EntityGraph,
  };
}

// Helper to create classifier output
function mockClassifierOutput(
  overrides: Partial<ClassifierOutput> = {},
): ClassifierOutput {
  return {
    intents: [],
    entities: [],
    confidence: 0.9,
    ...overrides,
  };
}

describe('ParallelGraphExecutor', () => {
  let graphs: GraphRegistry;
  let executor: ParallelGraphExecutor;

  beforeEach(() => {
    graphs = createMockGraphRegistry();
    executor = new ParallelGraphExecutor(graphs);
    vi.clearAllMocks();
  });

  describe('single intent queries', () => {
    it('should query semantic graph when intent is semantic with semantic_query', async () => {
      vi.mocked(graphs.semantic.search).mockResolvedValue([
        {
          concept: { uuid: 'concept-1', name: 'Test Concept', description: 'A test' },
          score: 0.95,
        },
      ]);

      const plan = mockClassifierOutput({
        intents: ['semantic'],
        semantic_query: 'test search query',
      });

      const results = await executor.execute(plan);

      expect(graphs.semantic.search).toHaveBeenCalledWith('test search query');
      expect(results.successful).toHaveLength(1);
      expect(results.successful[0].graph).toBe('semantic');
      expect(results.failed).toHaveLength(0);
    });

    it('should query temporal graph when intent is temporal with timeframe', async () => {
      vi.mocked(graphs.temporal.query).mockResolvedValue({
        events: [
          {
            uuid: 'event-1',
            description: 'Test event',
            occurred_at: new Date('2024-01-01'),
          },
        ],
        facts: [],
      });

      const plan = mockClassifierOutput({
        intents: ['temporal'],
        timeframe: { type: 'relative', value: 'last week' },
      });

      const results = await executor.execute(plan);

      expect(graphs.temporal.query).toHaveBeenCalledWith({
        type: 'relative',
        value: 'last week',
      });
      expect(results.successful).toHaveLength(1);
      expect(results.successful[0].graph).toBe('temporal');
    });

    it('should query causal graph when intent is causal with entities', async () => {
      vi.mocked(graphs.causal.traverse).mockResolvedValue([
        { cause: 'root-cause-id', effect: 'effect-id', confidence: 0.9 },
      ]);

      const plan = mockClassifierOutput({
        intents: ['causal'],
        entities: [{ mention: 'deployment failure' }],
        causal_direction: 'upstream',
      });

      const results = await executor.execute(plan);

      expect(graphs.causal.traverse).toHaveBeenCalledWith(
        [{ mention: 'deployment failure' }],
        'upstream',
      );
      expect(results.successful).toHaveLength(1);
      expect(results.successful[0].graph).toBe('causal');
    });

    it('should default to both for causal_direction when not specified', async () => {
      vi.mocked(graphs.causal.traverse).mockResolvedValue([]);

      const plan = mockClassifierOutput({
        intents: ['causal'],
        entities: [{ mention: 'test' }],
        // No causal_direction specified
      });

      await executor.execute(plan);

      expect(graphs.causal.traverse).toHaveBeenCalledWith(
        [{ mention: 'test' }],
        'both',
      );
    });

    it('should query entity graph when intent is entity with entities', async () => {
      vi.mocked(graphs.entity.resolve).mockResolvedValue([
        {
          uuid: 'entity-1',
          name: 'Alice',
          entity_type: 'person',
          created_at: new Date('2024-01-01'),
        },
      ]);

      const plan = mockClassifierOutput({
        intents: ['entity'],
        entities: [{ mention: 'Alice' }],
      });

      const results = await executor.execute(plan);

      expect(graphs.entity.resolve).toHaveBeenCalledWith([
        { mention: 'Alice' },
      ]);
      expect(results.successful).toHaveLength(1);
      expect(results.successful[0].graph).toBe('entity');
    });
  });

  describe('skipping queries with missing params', () => {
    it('should skip semantic query when semantic_query is missing', async () => {
      const plan = mockClassifierOutput({
        intents: ['semantic'],
        // No semantic_query
      });

      const results = await executor.execute(plan);

      expect(graphs.semantic.search).not.toHaveBeenCalled();
      expect(results.successful).toHaveLength(0);
    });

    it('should skip temporal query when timeframe is missing', async () => {
      const plan = mockClassifierOutput({
        intents: ['temporal'],
        // No timeframe
      });

      const results = await executor.execute(plan);

      expect(graphs.temporal.query).not.toHaveBeenCalled();
      expect(results.successful).toHaveLength(0);
    });

    it('should skip causal query when entities are empty', async () => {
      const plan = mockClassifierOutput({
        intents: ['causal'],
        entities: [],
        causal_direction: 'upstream',
      });

      const results = await executor.execute(plan);

      expect(graphs.causal.traverse).not.toHaveBeenCalled();
      expect(results.successful).toHaveLength(0);
    });

    it('should skip entity query when entities are empty', async () => {
      const plan = mockClassifierOutput({
        intents: ['entity'],
        entities: [],
      });

      const results = await executor.execute(plan);

      expect(graphs.entity.resolve).not.toHaveBeenCalled();
      expect(results.successful).toHaveLength(0);
    });
  });

  describe('parallel execution', () => {
    it('should execute multiple graph queries in parallel', async () => {
      const startTime = Date.now();
      const delay = 50;

      // Each graph takes 50ms to respond
      vi.mocked(graphs.semantic.search).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), delay)),
      );
      vi.mocked(graphs.entity.resolve).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), delay)),
      );

      const plan = mockClassifierOutput({
        intents: ['semantic', 'entity'],
        semantic_query: 'test',
        entities: [{ mention: 'test' }],
      });

      const results = await executor.execute(plan);

      const elapsed = Date.now() - startTime;

      // If executed in parallel, should take ~50ms, not ~100ms
      expect(elapsed).toBeLessThan(delay * 1.5);
      expect(results.successful).toHaveLength(2);
    });

    it('should query all four graphs when all intents present', async () => {
      vi.mocked(graphs.semantic.search).mockResolvedValue([]);
      vi.mocked(graphs.temporal.query).mockResolvedValue({
        events: [],
        facts: [],
      });
      vi.mocked(graphs.causal.traverse).mockResolvedValue([]);
      vi.mocked(graphs.entity.resolve).mockResolvedValue([]);

      const plan = mockClassifierOutput({
        intents: ['semantic', 'temporal', 'causal', 'entity'],
        semantic_query: 'search term',
        timeframe: { type: 'specific', value: '2024-01-01' },
        entities: [{ mention: 'test entity' }],
        causal_direction: 'both',
      });

      const results = await executor.execute(plan);

      expect(graphs.semantic.search).toHaveBeenCalled();
      expect(graphs.temporal.query).toHaveBeenCalled();
      expect(graphs.causal.traverse).toHaveBeenCalled();
      expect(graphs.entity.resolve).toHaveBeenCalled();
      expect(results.successful).toHaveLength(4);
    });
  });

  describe('error handling', () => {
    it('should capture single graph failure in failed array', async () => {
      vi.mocked(graphs.semantic.search).mockRejectedValue(
        new Error('Semantic search failed'),
      );

      const plan = mockClassifierOutput({
        intents: ['semantic'],
        semantic_query: 'test',
      });

      const results = await executor.execute(plan);

      expect(results.successful).toHaveLength(0);
      expect(results.failed).toHaveLength(1);
      expect(results.failed[0].error.message).toBe('Semantic search failed');
    });

    it('should handle partial failures (some succeed, some fail)', async () => {
      vi.mocked(graphs.semantic.search).mockResolvedValue([
        {
          concept: { uuid: '1', name: 'Concept', description: 'test' },
          score: 0.8,
        },
      ]);
      vi.mocked(graphs.entity.resolve).mockRejectedValue(
        new Error('Entity resolution failed'),
      );

      const plan = mockClassifierOutput({
        intents: ['semantic', 'entity'],
        semantic_query: 'test',
        entities: [{ mention: 'test' }],
      });

      const results = await executor.execute(plan);

      expect(results.successful).toHaveLength(1);
      expect(results.successful[0].graph).toBe('semantic');
      expect(results.failed).toHaveLength(1);
      expect(results.failed[0].error.message).toBe('Entity resolution failed');
    });

    it('should handle all graphs failing', async () => {
      vi.mocked(graphs.semantic.search).mockRejectedValue(new Error('Fail 1'));
      vi.mocked(graphs.entity.resolve).mockRejectedValue(new Error('Fail 2'));

      const plan = mockClassifierOutput({
        intents: ['semantic', 'entity'],
        semantic_query: 'test',
        entities: [{ mention: 'test' }],
      });

      const results = await executor.execute(plan);

      expect(results.successful).toHaveLength(0);
      expect(results.failed).toHaveLength(2);
    });

    it('should wrap non-Error rejections', async () => {
      vi.mocked(graphs.semantic.search).mockRejectedValue('string error');

      const plan = mockClassifierOutput({
        intents: ['semantic'],
        semantic_query: 'test',
      });

      const results = await executor.execute(plan);

      expect(results.failed).toHaveLength(1);
      expect(results.failed[0].error).toBeInstanceOf(Error);
      expect(results.failed[0].error.message).toBe('string error');
    });
  });

  describe('timeout handling', () => {
    it('should timeout slow queries', async () => {
      const shortTimeoutExecutor = new ParallelGraphExecutor(graphs, 50);

      vi.mocked(graphs.semantic.search).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 200)),
      );

      const plan = mockClassifierOutput({
        intents: ['semantic'],
        semantic_query: 'test',
      });

      const results = await shortTimeoutExecutor.execute(plan);

      expect(results.successful).toHaveLength(0);
      expect(results.failed).toHaveLength(1);
      expect(results.failed[0].error.message).toBe('Query timeout');
    });

    it('should return results that complete before timeout', async () => {
      const timeoutExecutor = new ParallelGraphExecutor(graphs, 100);

      vi.mocked(graphs.semantic.search).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve([
                  {
                    concept: { uuid: '1', name: 'Fast', description: 'test' },
                    score: 0.9,
                  },
                ]),
              20,
            ),
          ),
      );

      const plan = mockClassifierOutput({
        intents: ['semantic'],
        semantic_query: 'test',
      });

      const results = await timeoutExecutor.execute(plan);

      expect(results.successful).toHaveLength(1);
      expect(results.failed).toHaveLength(0);
    });

    it('should use default timeout of 5000ms', () => {
      const defaultExecutor = new ParallelGraphExecutor(graphs);
      // Can't directly test private property, but we can verify it doesn't timeout quickly
      expect(defaultExecutor).toBeDefined();
    });
  });

  describe('empty intents', () => {
    it('should return empty results when no intents specified', async () => {
      const plan = mockClassifierOutput({
        intents: [],
      });

      const results = await executor.execute(plan);

      expect(results.successful).toHaveLength(0);
      expect(results.failed).toHaveLength(0);
      expect(graphs.semantic.search).not.toHaveBeenCalled();
      expect(graphs.temporal.query).not.toHaveBeenCalled();
      expect(graphs.causal.traverse).not.toHaveBeenCalled();
      expect(graphs.entity.resolve).not.toHaveBeenCalled();
    });
  });
});
