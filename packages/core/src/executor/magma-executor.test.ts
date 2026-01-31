// Tests for MAGMAExecutor

import type { EnrichedSemanticMatch, MAGMAIntent } from '@polyg-mcp/shared';
import { describe, expect, it, vi } from 'vitest';
import type { CausalGraph } from '../graphs/causal.js';
import type { CrossLink, CrossLinker } from '../graphs/cross-linker.js';
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

function createCrossLink(
  sourceId: string,
  targetId: string,
  linkType: CrossLink['linkType'] = 'X_REPRESENTS',
): CrossLink {
  return { sourceId, targetId, linkType };
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
    confidence: 0.9,
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
    causalLinks?: { cause: string; effect: string; confidence: number }[];
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
