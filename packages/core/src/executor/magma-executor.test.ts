// Tests for MAGMAExecutor

import type { EnrichedSemanticMatch, MAGMAIntent } from '@polyg-mcp/shared';
import { describe, expect, it, vi } from 'vitest';
import type { CausalGraph } from '../graphs/causal.js';
import type { CrossLinker } from '../graphs/cross-linker.js';
import type { EntityGraph, EntityRelationship } from '../graphs/entity.js';
import type { SemanticGraph } from '../graphs/semantic.js';
import type { TemporalGraph } from '../graphs/temporal.js';
import { ExecutorError, RetrievalValidationError } from '../retrieval/index.js';
import { MAGMAExecutor, type MAGMAGraphRegistry } from './magma-executor.js';

// Mock data helpers
function createEnrichedSemanticMatch(
  uuid: string,
  score: number,
  linkedEntityIds: string[] = [],
  linkedEntityNames: string[] = [],
): EnrichedSemanticMatch {
  return {
    concept: { uuid, name: `Concept ${uuid}` },
    score,
    linkedEntityIds,
    linkedEntityNames,
  };
}

function createValidIntent(
  type: MAGMAIntent['type'] = 'EXPLORE',
  overrides: Partial<MAGMAIntent> = {},
): MAGMAIntent {
  return {
    type,
    entities: ['test-entity'],
    temporalHints: [],
    depthHints: { entity: 1, temporal: 1, causal: 1 },
    ...overrides,
  };
}

// Mock graph factory
function createMockGraphs(
  options: {
    enrichedResults?: EnrichedSemanticMatch[];
    entityRelationships?: Record<
      string,
      {
        source: { uuid: string; name: string; entity_type: string };
        target: { uuid: string; name: string; entity_type: string };
        relationshipType: string;
      }[]
    >;
    temporalEvents?: Record<
      string,
      { uuid: string; description: string; occurred_at: Date }[]
    >;
    causalNodes?: Record<
      string,
      { uuid: string; description: string; node_type: string }[]
    >;
    causalLinks?: { cause: string; effect: string; causeId?: string; effectId?: string; confidence: number }[];
  } = {},
): MAGMAGraphRegistry {
  const {
    enrichedResults = [],
    entityRelationships = {},
    temporalEvents = {},
    causalNodes = {},
    causalLinks = [],
  } = options;

  return {
    semantic: {
      search: vi.fn(async () => enrichedResults),
      searchWithEntities: vi.fn(async () => enrichedResults),
    } as unknown as SemanticGraph,

    entity: {
      getRelationships: vi.fn(async (entityId: string) => {
        return entityRelationships[entityId] || [];
      }),
      getRelationshipsBatch: vi.fn(async (entityIds: string[]) => {
        const result = new Map<string, EntityRelationship[]>();
        for (const entityId of entityIds) {
          result.set(
            entityId,
            (entityRelationships[entityId] || []) as EntityRelationship[],
          );
        }
        return result;
      }),
    } as unknown as EntityGraph,

    temporal: {
      queryTimeline: vi.fn(
        async (_from: Date, _to: Date, entityId?: string) => {
          if (entityId) {
            return temporalEvents[entityId] || [];
          }
          return [];
        },
      ),
      queryTimelineForEntities: vi.fn(async (entityIds: string[]) => {
        const result = new Map<
          string,
          { uuid: string; description: string; occurred_at: Date }[]
        >();
        for (const entityId of entityIds) {
          result.set(entityId, temporalEvents[entityId] || []);
        }
        return result;
      }),
    } as unknown as TemporalGraph,

    causal: {
      traverse: vi.fn(async () => causalLinks),
      getNodesForEntities: vi.fn(async (entityIds: string[]) => {
        const result = new Map<
          string,
          { uuid: string; description: string; node_type: string }[]
        >();
        for (const entityId of entityIds) {
          result.set(entityId, causalNodes[entityId] || []);
        }
        return result;
      }),
      traverseFromNodeIds: vi.fn(async () => causalLinks),
      getUpstreamCauses: vi.fn(async () => []),
      getDownstreamEffects: vi.fn(async () => []),
    } as unknown as CausalGraph,

    crossLinker: {
      getLinksFrom: vi.fn(async () => []),
    } as unknown as CrossLinker,
  };
}

describe('MAGMAExecutor', () => {
  describe('constructor', () => {
    it('should create executor with default config', () => {
      const graphs = createMockGraphs();
      const executor = new MAGMAExecutor(graphs);
      const config = executor.getConfig();

      expect(config.semanticTopK).toBe(10);
      expect(config.minSemanticScore).toBe(0.5);
      expect(config.timeout).toBe(5000);
    });

    it('should accept custom config', () => {
      const graphs = createMockGraphs();
      const executor = new MAGMAExecutor(graphs, {
        semanticTopK: 20,
        minSemanticScore: 0.7,
        timeout: 10000,
      });
      const config = executor.getConfig();

      expect(config.semanticTopK).toBe(20);
      expect(config.minSemanticScore).toBe(0.7);
      expect(config.timeout).toBe(10000);
    });

    it('should throw for invalid semanticTopK', () => {
      const graphs = createMockGraphs();

      expect(() => new MAGMAExecutor(graphs, { semanticTopK: 0 })).toThrow(
        RetrievalValidationError,
      );
      expect(() => new MAGMAExecutor(graphs, { semanticTopK: 150 })).toThrow(
        RetrievalValidationError,
      );
    });

    it('should throw for invalid minSemanticScore', () => {
      const graphs = createMockGraphs();

      expect(
        () => new MAGMAExecutor(graphs, { minSemanticScore: -0.1 }),
      ).toThrow(RetrievalValidationError);
      expect(
        () => new MAGMAExecutor(graphs, { minSemanticScore: 1.5 }),
      ).toThrow(RetrievalValidationError);
    });

    it('should throw for invalid timeout', () => {
      const graphs = createMockGraphs();

      expect(() => new MAGMAExecutor(graphs, { timeout: 50 })).toThrow(
        RetrievalValidationError,
      );
      expect(() => new MAGMAExecutor(graphs, { timeout: 100000 })).toThrow(
        RetrievalValidationError,
      );
    });
  });

  describe('fromConfig', () => {
    it('should create executor from MAGMAConfig', () => {
      const graphs = createMockGraphs();
      const magmaConfig = {
        semanticTopK: 15,
        minSemanticScore: 0.6,
        defaultDepths: { entity: 2, temporal: 1, causal: 3 },
        minNodesPerView: 3,
        maxNodesPerView: 50,
        multiViewBoost: 1.5,
        maxQueryLength: 8000,
        maxContextLength: 4000,
      };

      const executor = MAGMAExecutor.fromConfig(graphs, magmaConfig);
      const config = executor.getConfig();

      expect(config.semanticTopK).toBe(15);
      expect(config.minSemanticScore).toBe(0.6);
    });
  });

  describe('execute', () => {
    describe('validation', () => {
      it('should throw for empty query', async () => {
        const graphs = createMockGraphs();
        const executor = new MAGMAExecutor(graphs);
        const intent = createValidIntent();

        await expect(executor.execute('', intent)).rejects.toThrow(
          RetrievalValidationError,
        );
        await expect(executor.execute('   ', intent)).rejects.toThrow(
          RetrievalValidationError,
        );
      });

      it('should throw for non-string query', async () => {
        const graphs = createMockGraphs();
        const executor = new MAGMAExecutor(graphs);
        const intent = createValidIntent();

        await expect(
          executor.execute(null as unknown as string, intent),
        ).rejects.toThrow(RetrievalValidationError);
      });

      it('should throw for invalid intent', async () => {
        const graphs = createMockGraphs();
        const executor = new MAGMAExecutor(graphs);

        await expect(
          executor.execute('test query', {
            invalid: true,
          } as unknown as MAGMAIntent),
        ).rejects.toThrow(RetrievalValidationError);
      });
    });

    describe('semantic-only flow', () => {
      it('should return semantic view when no entity seeds found', async () => {
        const graphs = createMockGraphs({
          enrichedResults: [
            createEnrichedSemanticMatch('concept1', 0.9), // No linked entities
            createEnrichedSemanticMatch('concept2', 0.8), // No linked entities
          ],
        });

        const executor = new MAGMAExecutor(graphs);
        const intent = createValidIntent();
        const result = await executor.execute('test query', intent);

        expect(result.merged.nodes).toHaveLength(2);
        expect(result.merged.viewContributions.semantic).toBe(2);
        expect(result.merged.viewContributions.entity).toBe(0);
        expect(result.seeds.entitySeeds).toHaveLength(0);
      });
    });

    describe('full pipeline flow', () => {
      it('should execute full MAGMA pipeline with all graphs', async () => {
        const graphs = createMockGraphs({
          enrichedResults: [
            createEnrichedSemanticMatch(
              'concept1',
              0.9,
              ['entity1'],
              ['Entity 1'],
            ),
          ],
          entityRelationships: {
            entity1: [
              {
                source: {
                  uuid: 'entity1',
                  name: 'Entity 1',
                  entity_type: 'type',
                },
                target: {
                  uuid: 'entity2',
                  name: 'Entity 2',
                  entity_type: 'type',
                },
                relationshipType: 'RELATES',
              },
            ],
          },
          temporalEvents: {
            entity1: [
              {
                uuid: 'event1',
                description: 'Test event',
                occurred_at: new Date(),
              },
            ],
          },
          causalNodes: {
            entity1: [
              {
                uuid: 'causal1',
                description: 'Causal node',
                node_type: 'event',
              },
            ],
          },
          causalLinks: [
            { cause: 'cause1', effect: 'effect1', confidence: 0.85 },
          ],
        });

        const executor = new MAGMAExecutor(graphs, { minSemanticScore: 0.5 });
        const intent = createValidIntent('WHY', {
          depthHints: { entity: 1, temporal: 1, causal: 2 },
        });

        const result = await executor.execute(
          'why did the deployment fail?',
          intent,
        );

        // Should have semantic, entity, temporal, and causal views
        expect(result.merged.viewContributions.semantic).toBeGreaterThan(0);
        expect(result.merged.viewContributions.entity).toBeGreaterThan(0);
        expect(result.merged.viewContributions.temporal).toBeGreaterThan(0);
        expect(result.merged.viewContributions.causal).toBeGreaterThan(0);

        // Should have seeds
        expect(result.seeds.entitySeeds).toHaveLength(1);
        expect(result.seeds.entitySeeds[0].entityId).toBe('entity1');

        // Should have timing info
        expect(result.timing.semanticMs).toBeGreaterThanOrEqual(0);
        expect(result.timing.seedExtractionMs).toBeGreaterThanOrEqual(0);
        expect(result.timing.expansionMs).toBeGreaterThanOrEqual(0);
        expect(result.timing.mergeMs).toBeGreaterThanOrEqual(0);
        expect(result.timing.totalMs).toBeGreaterThanOrEqual(0);
      });

      it('should filter seeds by minSemanticScore', async () => {
        const graphs = createMockGraphs({
          enrichedResults: [
            createEnrichedSemanticMatch(
              'concept1',
              0.9,
              ['entity1'],
              ['Entity 1'],
            ), // Above threshold
            createEnrichedSemanticMatch(
              'concept2',
              0.3,
              ['entity2'],
              ['Entity 2'],
            ), // Below threshold
          ],
        });

        const executor = new MAGMAExecutor(graphs, { minSemanticScore: 0.5 });
        const intent = createValidIntent();

        const result = await executor.execute('test query', intent);

        // Only entity1 should be used as seed (concept1 score 0.9 > 0.5)
        // entity2's concept has score 0.3 < 0.5, so filtered out
        expect(result.seeds.entitySeeds).toHaveLength(1);
        expect(result.seeds.entitySeeds[0].entityId).toBe('entity1');
      });

      it('should call semantic search with correct topK', async () => {
        const searchWithEntitiesMock = vi.fn(async () => []);
        const graphs = createMockGraphs();
        graphs.semantic.searchWithEntities = searchWithEntitiesMock;

        const executor = new MAGMAExecutor(graphs, { semanticTopK: 25 });
        const intent = createValidIntent();

        await executor.execute('test query', intent);

        expect(searchWithEntitiesMock).toHaveBeenCalledWith('test query', 25);
      });
    });

    describe('entity expansion', () => {
      it('should expand entity relationships at specified depth', async () => {
        const graphs = createMockGraphs({
          enrichedResults: [
            createEnrichedSemanticMatch(
              'concept1',
              0.9,
              ['entity1'],
              ['Entity 1'],
            ),
          ],
          entityRelationships: {
            entity1: [
              {
                source: {
                  uuid: 'entity1',
                  name: 'Entity 1',
                  entity_type: 'type',
                },
                target: {
                  uuid: 'entity2',
                  name: 'Entity 2',
                  entity_type: 'type',
                },
                relationshipType: 'RELATES',
              },
            ],
            entity2: [
              {
                source: {
                  uuid: 'entity2',
                  name: 'Entity 2',
                  entity_type: 'type',
                },
                target: {
                  uuid: 'entity3',
                  name: 'Entity 3',
                  entity_type: 'type',
                },
                relationshipType: 'RELATES',
              },
            ],
          },
        });

        const executor = new MAGMAExecutor(graphs);
        const intent = createValidIntent('WHO', {
          depthHints: { entity: 2, temporal: 1, causal: 1 },
        });

        const result = await executor.execute('who is involved?', intent);

        // Should have expanded to entity2 and entity3 at depth 2
        expect(result.merged.viewContributions.entity).toBeGreaterThan(0);
      });

      it('should handle entities with no relationships', async () => {
        const graphs = createMockGraphs({
          enrichedResults: [
            createEnrichedSemanticMatch(
              'concept1',
              0.9,
              ['lonely-entity'],
              ['Lonely Entity'],
            ),
          ],
          entityRelationships: {}, // No relationships
        });

        const executor = new MAGMAExecutor(graphs);
        const intent = createValidIntent();

        const result = await executor.execute('test query', intent);

        // Should not fail, just have no entity nodes
        expect(result.merged.viewContributions.entity).toBe(0);
      });
    });

    describe('temporal expansion', () => {
      it('should find temporal events for seed entities', async () => {
        const graphs = createMockGraphs({
          enrichedResults: [
            createEnrichedSemanticMatch(
              'concept1',
              0.9,
              ['entity1'],
              ['Entity 1'],
            ),
          ],
          temporalEvents: {
            entity1: [
              {
                uuid: 'event1',
                description: 'First event',
                occurred_at: new Date(),
              },
              {
                uuid: 'event2',
                description: 'Second event',
                occurred_at: new Date(),
              },
            ],
          },
        });

        const executor = new MAGMAExecutor(graphs);
        const intent = createValidIntent('WHEN', {
          depthHints: { entity: 1, temporal: 2, causal: 1 },
        });

        const result = await executor.execute('when did this happen?', intent);

        expect(result.merged.viewContributions.temporal).toBe(2);
      });

      it('should handle entities with no temporal events', async () => {
        const graphs = createMockGraphs({
          enrichedResults: [
            createEnrichedSemanticMatch(
              'concept1',
              0.9,
              ['entity1'],
              ['Entity 1'],
            ),
          ],
          temporalEvents: {}, // No events
        });

        const executor = new MAGMAExecutor(graphs);
        const intent = createValidIntent('WHEN');

        const result = await executor.execute('test query', intent);

        expect(result.merged.viewContributions.temporal).toBe(0);
      });
    });

    describe('causal expansion', () => {
      it('should traverse causal chains', async () => {
        const graphs = createMockGraphs({
          enrichedResults: [
            createEnrichedSemanticMatch(
              'concept1',
              0.9,
              ['entity1'],
              ['Entity 1'],
            ),
          ],
          causalNodes: {
            entity1: [
              {
                uuid: 'causal1',
                description: 'Causal node',
                node_type: 'event',
              },
            ],
          },
          causalLinks: [
            {
              cause: 'misconfiguration',
              effect: 'server crash',
              confidence: 0.9,
            },
            { cause: 'server crash', effect: 'data loss', confidence: 0.85 },
          ],
        });

        const executor = new MAGMAExecutor(graphs);
        const intent = createValidIntent('WHY', {
          depthHints: { entity: 1, temporal: 1, causal: 3 },
        });

        const result = await executor.execute(
          'why did the server crash?',
          intent,
        );

        // 3 unique nodes: misconfiguration, server crash, data loss
        expect(result.merged.viewContributions.causal).toBeGreaterThan(0);
      });

      it('should handle empty causal results', async () => {
        const graphs = createMockGraphs({
          enrichedResults: [
            createEnrichedSemanticMatch(
              'concept1',
              0.9,
              ['entity1'],
              ['Entity 1'],
            ),
          ],
          causalNodes: {}, // No causal nodes linked to entity
          causalLinks: [],
        });

        const executor = new MAGMAExecutor(graphs);
        const intent = createValidIntent('WHY');

        const result = await executor.execute('test query', intent);

        expect(result.merged.viewContributions.causal).toBe(0);
      });

      it('should use causeId/effectId UUIDs for node identity instead of descriptions', async () => {
        const graphs = createMockGraphs({
          enrichedResults: [
            createEnrichedSemanticMatch(
              'concept1',
              0.9,
              ['entity1'],
              ['Entity 1'],
            ),
          ],
          causalNodes: {
            entity1: [
              {
                uuid: 'causal-node-1',
                description: 'Root cause',
                node_type: 'event',
              },
            ],
          },
          causalLinks: [
            {
              cause: 'Server misconfiguration',
              effect: 'Service outage',
              causeId: 'uuid-cause-1',
              effectId: 'uuid-effect-1',
              confidence: 0.95,
            },
            {
              // Same descriptions but different UUIDs - should create separate nodes
              cause: 'Server misconfiguration',
              effect: 'Data corruption',
              causeId: 'uuid-cause-2',
              effectId: 'uuid-effect-2',
              confidence: 0.85,
            },
          ],
        });

        const executor = new MAGMAExecutor(graphs);
        const intent = createValidIntent('WHY', {
          depthHints: { entity: 1, temporal: 1, causal: 3 },
        });

        const result = await executor.execute('why did the service fail?', intent);

        // Should have 4 unique nodes (based on UUIDs, not descriptions)
        // uuid-cause-1, uuid-effect-1, uuid-cause-2, uuid-effect-2
        const causalNodes = result.merged.nodes.filter(
          (n) => (n.data as Record<string, unknown>)?.type === 'cause' || (n.data as Record<string, unknown>)?.type === 'effect',
        );

        // Extract UUIDs from causal nodes
        const causalUuids = causalNodes.map((n) => n.uuid);

        // Verify UUIDs are the actual UUIDs, not descriptions
        expect(causalUuids).toContain('uuid-cause-1');
        expect(causalUuids).toContain('uuid-effect-1');
        expect(causalUuids).toContain('uuid-cause-2');
        expect(causalUuids).toContain('uuid-effect-2');

        // Verify descriptions are NOT used as UUIDs
        expect(causalUuids).not.toContain('Server misconfiguration');
        expect(causalUuids).not.toContain('Service outage');
        expect(causalUuids).not.toContain('Data corruption');
      });

      it('should fall back to description as UUID when causeId/effectId not provided', async () => {
        const graphs = createMockGraphs({
          enrichedResults: [
            createEnrichedSemanticMatch(
              'concept1',
              0.9,
              ['entity1'],
              ['Entity 1'],
            ),
          ],
          causalNodes: {
            entity1: [
              {
                uuid: 'causal-node-1',
                description: 'Root cause',
                node_type: 'event',
              },
            ],
          },
          causalLinks: [
            {
              // No causeId/effectId - should fall back to description
              cause: 'Network failure',
              effect: 'Connection timeout',
              confidence: 0.9,
            },
          ],
        });

        const executor = new MAGMAExecutor(graphs);
        const intent = createValidIntent('WHY');

        const result = await executor.execute('why did connection fail?', intent);

        const causalNodes = result.merged.nodes.filter(
          (n) => (n.data as Record<string, unknown>)?.type === 'cause' || (n.data as Record<string, unknown>)?.type === 'effect',
        );

        // Should fall back to descriptions as UUIDs
        const causalUuids = causalNodes.map((n) => n.uuid);
        expect(causalUuids).toContain('Network failure');
        expect(causalUuids).toContain('Connection timeout');
      });
    });

    describe('timing', () => {
      it('should record timing for all phases', async () => {
        const graphs = createMockGraphs({
          enrichedResults: [createEnrichedSemanticMatch('concept1', 0.9)],
        });

        const executor = new MAGMAExecutor(graphs);
        const intent = createValidIntent();

        const result = await executor.execute('test query', intent);

        expect(typeof result.timing.semanticMs).toBe('number');
        expect(typeof result.timing.seedExtractionMs).toBe('number');
        expect(typeof result.timing.expansionMs).toBe('number');
        expect(typeof result.timing.mergeMs).toBe('number');
        expect(typeof result.timing.totalMs).toBe('number');

        // Total should be at least the sum of parts
        expect(result.timing.totalMs).toBeGreaterThanOrEqual(
          result.timing.semanticMs +
            result.timing.seedExtractionMs +
            result.timing.expansionMs +
            result.timing.mergeMs -
            10, // Allow small margin for timing variations
        );
      });
    });

    describe('timeout handling', () => {
      it('should timeout slow semantic searches', async () => {
        const graphs = createMockGraphs();
        graphs.semantic.searchWithEntities = vi.fn(
          async (): Promise<EnrichedSemanticMatch[]> =>
            new Promise((resolve) => setTimeout(() => resolve([]), 10000)), // 10s delay
        );

        const executor = new MAGMAExecutor(graphs, { timeout: 100 }); // 100ms timeout
        const intent = createValidIntent();

        await expect(executor.execute('test query', intent)).rejects.toThrow(
          ExecutorError,
        );
      });
    });

    describe('error wrapping', () => {
      it('should wrap semantic search errors in ExecutorError with step', async () => {
        const graphs = createMockGraphs();
        graphs.semantic.searchWithEntities = vi.fn(async () => {
          throw new Error('Embedding API failed');
        });

        const executor = new MAGMAExecutor(graphs);
        const intent = createValidIntent();

        await expect(executor.execute('test query', intent)).rejects.toThrow(
          ExecutorError,
        );

        try {
          await executor.execute('test query', intent);
        } catch (error) {
          expect(error).toBeInstanceOf(ExecutorError);
          expect((error as ExecutorError).step).toBe('semantic_search');
          expect((error as ExecutorError).message).toContain(
            'Semantic search failed',
          );
          expect((error as ExecutorError).message).toContain(
            'Embedding API failed',
          );
        }
      });

      it('should preserve ExecutorError from timeout without double-wrapping', async () => {
        const graphs = createMockGraphs();
        graphs.semantic.searchWithEntities = vi.fn(
          async (): Promise<EnrichedSemanticMatch[]> =>
            new Promise((resolve) => setTimeout(() => resolve([]), 10000)),
        );

        const executor = new MAGMAExecutor(graphs, { timeout: 100 }); // Min timeout is 100ms
        const intent = createValidIntent();

        try {
          await executor.execute('test query', intent);
        } catch (error) {
          expect(error).toBeInstanceOf(ExecutorError);
          // Should be timeout error, not wrapped in semantic_search
          expect((error as ExecutorError).step).toBe('timeout');
          expect((error as ExecutorError).message).toContain('timed out');
        }
      });

      it('should wrap seed extraction errors in ExecutorError with step', async () => {
        const graphs = createMockGraphs({
          enrichedResults: [
            // Invalid match that will cause extraction to fail
            { concept: null, score: 0.9 } as unknown as EnrichedSemanticMatch,
          ],
        });

        const executor = new MAGMAExecutor(graphs);
        const intent = createValidIntent();

        await expect(executor.execute('test query', intent)).rejects.toThrow(
          ExecutorError,
        );

        try {
          await executor.execute('test query', intent);
        } catch (error) {
          expect(error).toBeInstanceOf(ExecutorError);
          expect((error as ExecutorError).step).toBe('seed_extraction');
          expect((error as ExecutorError).message).toContain(
            'Seed extraction failed',
          );
        }
      });

      it('should include original error as cause', async () => {
        const originalError = new Error('Database connection lost');
        const graphs = createMockGraphs();
        graphs.semantic.searchWithEntities = vi.fn(async () => {
          throw originalError;
        });

        const executor = new MAGMAExecutor(graphs);
        const intent = createValidIntent();

        try {
          await executor.execute('test query', intent);
        } catch (error) {
          expect(error).toBeInstanceOf(ExecutorError);
          expect((error as ExecutorError).cause).toBe(originalError);
        }
      });
    });
  });

  describe('graceful degradation', () => {
    it('should return partial results when entity expansion fails', async () => {
      const graphs = createMockGraphs({
        enrichedResults: [
          createEnrichedSemanticMatch('concept-1', 0.9, ['entity-1'], ['Entity 1']),
        ],
        temporalEvents: {
          'entity-1': [
            {
              uuid: 'event-1',
              description: 'Test event',
              occurred_at: new Date('2024-06-15'),
            },
          ],
        },
      });

      // Entity expansion throws an error
      graphs.entity.getRelationshipsBatch = vi.fn(async () => {
        throw new Error('Entity graph connection failed');
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const executor = new MAGMAExecutor(graphs);
      const intent = createValidIntent();

      const result = await executor.execute('test query', intent);

      // Should still have semantic and temporal views
      expect(result.merged).toBeDefined();
      expect(result.merged.nodes.length).toBeGreaterThan(0);

      // Should log warning about failed expansion
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MAGMAExecutor] entity expansion failed:'),
        expect.any(String),
      );

      consoleSpy.mockRestore();
    });

    it('should return partial results when temporal expansion fails', async () => {
      const graphs = createMockGraphs({
        enrichedResults: [
          createEnrichedSemanticMatch('concept-1', 0.9, ['entity-1'], ['Entity 1']),
        ],
        entityRelationships: {
          'entity-1': [
            {
              source: { uuid: 'entity-1', name: 'Entity 1', entity_type: 'person' },
              target: { uuid: 'entity-2', name: 'Entity 2', entity_type: 'org' },
              relationshipType: 'WORKS_FOR',
            },
          ],
        },
      });

      // Temporal expansion throws an error
      graphs.temporal.queryTimelineForEntities = vi.fn(async () => {
        throw new Error('Temporal graph timeout');
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const executor = new MAGMAExecutor(graphs);
      const intent = createValidIntent();

      const result = await executor.execute('test query', intent);

      // Should still have semantic and entity views
      expect(result.merged).toBeDefined();
      expect(result.merged.nodes.length).toBeGreaterThan(0);

      // Should log warning about failed expansion
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MAGMAExecutor] temporal expansion failed:'),
        expect.any(String),
      );

      consoleSpy.mockRestore();
    });

    it('should return partial results when causal expansion fails', async () => {
      const graphs = createMockGraphs({
        enrichedResults: [
          createEnrichedSemanticMatch('concept-1', 0.9, ['entity-1'], ['Entity 1']),
        ],
        entityRelationships: {
          'entity-1': [
            {
              source: { uuid: 'entity-1', name: 'Entity 1', entity_type: 'person' },
              target: { uuid: 'entity-2', name: 'Entity 2', entity_type: 'org' },
              relationshipType: 'WORKS_FOR',
            },
          ],
        },
      });

      // Causal expansion throws an error
      graphs.causal.getNodesForEntities = vi.fn(async () => {
        throw new Error('Causal traversal error');
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const executor = new MAGMAExecutor(graphs);
      const intent = createValidIntent();

      const result = await executor.execute('test query', intent);

      // Should still have semantic and entity views
      expect(result.merged).toBeDefined();
      expect(result.merged.nodes.length).toBeGreaterThan(0);

      // Should log warning about failed expansion
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MAGMAExecutor] causal expansion failed:'),
        expect.any(String),
      );

      consoleSpy.mockRestore();
    });

    it('should return semantic-only results when all expansions fail', async () => {
      const graphs = createMockGraphs({
        enrichedResults: [
          createEnrichedSemanticMatch('concept-1', 0.9, ['entity-1'], ['Entity 1']),
        ],
      });

      // All expansions throw errors
      graphs.entity.getRelationshipsBatch = vi.fn(async () => {
        throw new Error('Entity failure');
      });
      graphs.temporal.queryTimelineForEntities = vi.fn(async () => {
        throw new Error('Temporal failure');
      });
      graphs.causal.getNodesForEntities = vi.fn(async () => {
        throw new Error('Causal failure');
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const executor = new MAGMAExecutor(graphs);
      const intent = createValidIntent();

      const result = await executor.execute('test query', intent);

      // Should still have semantic view at minimum
      expect(result.merged).toBeDefined();
      expect(result.merged.nodes.length).toBe(1); // Only the semantic concept

      // Should log warnings for all three failures
      expect(consoleSpy).toHaveBeenCalledTimes(3);

      consoleSpy.mockRestore();
    });

    it('should handle non-Error rejection reasons', async () => {
      const graphs = createMockGraphs({
        enrichedResults: [
          createEnrichedSemanticMatch('concept-1', 0.9, ['entity-1'], ['Entity 1']),
        ],
      });

      // Expansion rejects with a string instead of Error
      graphs.entity.getRelationshipsBatch = vi.fn(async () => {
        throw 'String error message';
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const executor = new MAGMAExecutor(graphs);
      const intent = createValidIntent();

      const result = await executor.execute('test query', intent);

      expect(result.merged).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MAGMAExecutor] entity expansion failed:'),
        'String error message',
      );

      consoleSpy.mockRestore();
    });

    it('should timeout slow entity expansion and continue with others', async () => {
      const graphs = createMockGraphs({
        enrichedResults: [
          createEnrichedSemanticMatch('concept-1', 0.9, ['entity-1'], ['Entity 1']),
        ],
        temporalEvents: {
          'entity-1': [
            {
              uuid: 'event-1',
              description: 'Test event',
              occurred_at: new Date('2024-06-15'),
            },
          ],
        },
      });

      // Entity expansion takes too long (never resolves within timeout)
      graphs.entity.getRelationshipsBatch = vi.fn(
        async () => new Promise<Map<string, EntityRelationship[]>>((resolve) => setTimeout(() => resolve(new Map()), 10000)),
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Use short timeout
      const executor = new MAGMAExecutor(graphs, { timeout: 100 });
      const intent = createValidIntent();

      const result = await executor.execute('test query', intent);

      // Should still have semantic and temporal views
      expect(result.merged).toBeDefined();
      expect(result.merged.nodes.length).toBeGreaterThan(0);

      // Should log timeout warning for entity expansion
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MAGMAExecutor] entity expansion failed:'),
        expect.stringContaining('timed out'),
      );

      consoleSpy.mockRestore();
    });

    it('should timeout slow temporal expansion and continue with others', async () => {
      const graphs = createMockGraphs({
        enrichedResults: [
          createEnrichedSemanticMatch('concept-1', 0.9, ['entity-1'], ['Entity 1']),
        ],
        entityRelationships: {
          'entity-1': [
            {
              source: { uuid: 'entity-1', name: 'Entity 1', entity_type: 'person' },
              target: { uuid: 'entity-2', name: 'Entity 2', entity_type: 'org' },
              relationshipType: 'WORKS_FOR',
            },
          ],
        },
      });

      // Temporal expansion takes too long (never resolves within timeout)
      graphs.temporal.queryTimelineForEntities = vi.fn(
        async () => new Promise<Map<string, { uuid: string; description: string; occurred_at: Date }[]>>((resolve) => setTimeout(() => resolve(new Map()), 10000)),
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Use short timeout
      const executor = new MAGMAExecutor(graphs, { timeout: 100 });
      const intent = createValidIntent();

      const result = await executor.execute('test query', intent);

      // Should still have semantic and entity views
      expect(result.merged).toBeDefined();
      expect(result.merged.nodes.length).toBeGreaterThan(0);

      // Should log timeout warning for temporal expansion
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MAGMAExecutor] temporal expansion failed:'),
        expect.stringContaining('timed out'),
      );

      consoleSpy.mockRestore();
    });

    it('should timeout slow causal expansion and continue with others', async () => {
      const graphs = createMockGraphs({
        enrichedResults: [
          createEnrichedSemanticMatch('concept-1', 0.9, ['entity-1'], ['Entity 1']),
        ],
        entityRelationships: {
          'entity-1': [
            {
              source: { uuid: 'entity-1', name: 'Entity 1', entity_type: 'person' },
              target: { uuid: 'entity-2', name: 'Entity 2', entity_type: 'org' },
              relationshipType: 'WORKS_FOR',
            },
          ],
        },
      });

      // Causal expansion takes too long (never resolves within timeout)
      graphs.causal.getNodesForEntities = vi.fn(
        async () => new Promise<Map<string, { uuid: string; description: string; node_type: string }[]>>((resolve) => setTimeout(() => resolve(new Map()), 10000)),
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Use short timeout
      const executor = new MAGMAExecutor(graphs, { timeout: 100 });
      const intent = createValidIntent();

      const result = await executor.execute('test query', intent);

      // Should still have semantic and entity views
      expect(result.merged).toBeDefined();
      expect(result.merged.nodes.length).toBeGreaterThan(0);

      // Should log timeout warning for causal expansion
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MAGMAExecutor] causal expansion failed:'),
        expect.stringContaining('timed out'),
      );

      consoleSpy.mockRestore();
    });

    it('should return semantic-only when all expansions timeout', async () => {
      const graphs = createMockGraphs({
        enrichedResults: [
          createEnrichedSemanticMatch('concept-1', 0.9, ['entity-1'], ['Entity 1']),
        ],
      });

      // All expansions take too long (never resolve within timeout)
      graphs.entity.getRelationshipsBatch = vi.fn(
        async () => new Promise<Map<string, EntityRelationship[]>>((resolve) => setTimeout(() => resolve(new Map()), 10000)),
      );
      graphs.temporal.queryTimelineForEntities = vi.fn(
        async () => new Promise<Map<string, { uuid: string; description: string; occurred_at: Date }[]>>((resolve) => setTimeout(() => resolve(new Map()), 10000)),
      );
      graphs.causal.getNodesForEntities = vi.fn(
        async () => new Promise<Map<string, { uuid: string; description: string; node_type: string }[]>>((resolve) => setTimeout(() => resolve(new Map()), 10000)),
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Use short timeout
      const executor = new MAGMAExecutor(graphs, { timeout: 100 });
      const intent = createValidIntent();

      const result = await executor.execute('test query', intent);

      // Should still have semantic view
      expect(result.merged).toBeDefined();
      expect(result.merged.nodes.length).toBe(1); // Only semantic concept

      // Should log timeout warnings for all three
      expect(consoleSpy).toHaveBeenCalledTimes(3);

      consoleSpy.mockRestore();
    });
  });

  describe('getConfig', () => {
    it('should return a copy of config', () => {
      const graphs = createMockGraphs();
      const executor = new MAGMAExecutor(graphs, { semanticTopK: 15 });

      const config1 = executor.getConfig();
      const config2 = executor.getConfig();

      expect(config1).not.toBe(config2); // Different objects
      expect(config1).toEqual(config2); // Same values
    });
  });
});
