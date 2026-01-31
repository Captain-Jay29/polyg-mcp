// Tests for seed-extractor functions

import type { EnrichedSemanticMatch, SemanticMatch } from '@polyg-mcp/shared';
import { describe, expect, it, vi } from 'vitest';
import type { CrossLink, CrossLinker } from '../graphs/cross-linker.js';
import { RetrievalValidationError, SeedExtractionError } from './errors.js';
import {
  extractSeedsFromEnrichedMatches,
  filterSeedsByScore,
  getEntityIds,
  type SeedEntity,
  seedFromSemantic,
  seedFromSemanticBatch,
} from './seed-extractor.js';

// Helper to create a mock CrossLinker
function createMockCrossLinker(
  linksBySource: Record<string, CrossLink[]> = {},
): CrossLinker {
  return {
    getLinksFrom: vi.fn(async (sourceId: string) => {
      return linksBySource[sourceId] || [];
    }),
    getLinksTo: vi.fn(async () => []),
    createLink: vi.fn(async () => {}),
    deleteLink: vi.fn(async () => true),
    findLinks: vi.fn(async () => []),
    getEntityRelatedConcepts: vi.fn(async () => []),
    getConceptRelatedEntities: vi.fn(async () => []),
  } as unknown as CrossLinker;
}

// Helper to create a semantic match
function createSemanticMatch(
  uuid: string,
  score: number,
  name = 'Test Concept',
): SemanticMatch {
  return {
    concept: { uuid, name },
    score,
  };
}

// Helper to create a cross-link
function createCrossLink(
  sourceId: string,
  targetId: string,
  linkType: CrossLink['linkType'] = 'X_REPRESENTS',
): CrossLink {
  return { sourceId, targetId, linkType };
}

describe('seedFromSemantic', () => {
  it('should extract entity seeds from semantic matches', async () => {
    const crossLinker = createMockCrossLinker({
      concept1: [createCrossLink('concept1', 'entity1')],
      concept2: [createCrossLink('concept2', 'entity2')],
    });

    const matches = [
      createSemanticMatch('concept1', 0.9),
      createSemanticMatch('concept2', 0.8),
    ];

    const result = await seedFromSemantic(matches, crossLinker);

    expect(result.entitySeeds).toHaveLength(2);
    expect(result.entitySeeds[0].entityId).toBe('entity1');
    expect(result.entitySeeds[0].sourceConceptId).toBe('concept1');
    expect(result.entitySeeds[0].semanticScore).toBe(0.9);
    expect(result.entitySeeds[1].entityId).toBe('entity2');
    expect(result.conceptIds).toEqual(['concept1', 'concept2']);
    expect(result.stats.conceptsSearched).toBe(2);
    expect(result.stats.entitiesFound).toBe(2);
    expect(result.stats.conceptsWithoutLinks).toBe(0);
  });

  it('should handle concepts without X_REPRESENTS links', async () => {
    const crossLinker = createMockCrossLinker({
      concept1: [createCrossLink('concept1', 'entity1')],
      concept2: [], // No links
    });

    const matches = [
      createSemanticMatch('concept1', 0.9),
      createSemanticMatch('concept2', 0.8),
    ];

    const result = await seedFromSemantic(matches, crossLinker);

    expect(result.entitySeeds).toHaveLength(1);
    expect(result.stats.conceptsWithoutLinks).toBe(1);
  });

  it('should filter out non-X_REPRESENTS links', async () => {
    const crossLinker = createMockCrossLinker({
      concept1: [
        createCrossLink('concept1', 'entity1', 'X_REPRESENTS'),
        createCrossLink('concept1', 'event1', 'X_INVOLVES'),
      ],
    });

    const matches = [createSemanticMatch('concept1', 0.9)];

    const result = await seedFromSemantic(matches, crossLinker);

    expect(result.entitySeeds).toHaveLength(1);
    expect(result.entitySeeds[0].entityId).toBe('entity1');
  });

  it('should deduplicate entities found from multiple concepts', async () => {
    const crossLinker = createMockCrossLinker({
      concept1: [createCrossLink('concept1', 'shared-entity')],
      concept2: [createCrossLink('concept2', 'shared-entity')],
    });

    const matches = [
      createSemanticMatch('concept1', 0.9),
      createSemanticMatch('concept2', 0.8),
    ];

    const result = await seedFromSemantic(matches, crossLinker);

    expect(result.entitySeeds).toHaveLength(1);
    expect(result.entitySeeds[0].entityId).toBe('shared-entity');
    // Should use the first (higher score) concept as source
    expect(result.entitySeeds[0].sourceConceptId).toBe('concept1');
    expect(result.entitySeeds[0].semanticScore).toBe(0.9);
  });

  it('should handle empty semantic matches', async () => {
    const crossLinker = createMockCrossLinker({});

    const result = await seedFromSemantic([], crossLinker);

    expect(result.entitySeeds).toHaveLength(0);
    expect(result.conceptIds).toHaveLength(0);
    expect(result.stats.conceptsSearched).toBe(0);
    expect(result.stats.entitiesFound).toBe(0);
  });

  it('should handle multiple entities per concept', async () => {
    const crossLinker = createMockCrossLinker({
      concept1: [
        createCrossLink('concept1', 'entity1'),
        createCrossLink('concept1', 'entity2'),
        createCrossLink('concept1', 'entity3'),
      ],
    });

    const matches = [createSemanticMatch('concept1', 0.9)];

    const result = await seedFromSemantic(matches, crossLinker);

    expect(result.entitySeeds).toHaveLength(3);
    expect(result.stats.entitiesFound).toBe(3);
  });

  describe('validation', () => {
    it('should throw for non-array matches', async () => {
      const crossLinker = createMockCrossLinker({});

      await expect(
        seedFromSemantic(
          'not an array' as unknown as SemanticMatch[],
          crossLinker,
        ),
      ).rejects.toThrow(RetrievalValidationError);
    });

    it('should throw for null crossLinker', async () => {
      await expect(
        seedFromSemantic([], null as unknown as CrossLinker),
      ).rejects.toThrow(RetrievalValidationError);
    });

    it('should throw for invalid semantic match structure', async () => {
      const crossLinker = createMockCrossLinker({});
      const invalidMatches = [{ invalid: true }] as unknown as SemanticMatch[];

      await expect(
        seedFromSemantic(invalidMatches, crossLinker),
      ).rejects.toThrow(RetrievalValidationError);
    });
  });

  describe('error handling', () => {
    it('should wrap crossLinker errors in SeedExtractionError', async () => {
      const crossLinker = {
        getLinksFrom: vi.fn(async () => {
          throw new Error('Database connection failed');
        }),
      } as unknown as CrossLinker;

      const matches = [createSemanticMatch('concept1', 0.9)];

      await expect(seedFromSemantic(matches, crossLinker)).rejects.toThrow(
        SeedExtractionError,
      );
    });
  });
});

describe('seedFromSemanticBatch', () => {
  it('should process matches in batches', async () => {
    const getLinksFrom = vi.fn(async (sourceId: string) => {
      return [createCrossLink(sourceId, `entity-${sourceId}`)];
    });
    const crossLinker = { getLinksFrom } as unknown as CrossLinker;

    const matches = Array.from({ length: 25 }, (_, i) =>
      createSemanticMatch(`concept${i}`, 0.9 - i * 0.01),
    );

    const result = await seedFromSemanticBatch(matches, crossLinker, 10);

    // Should have called getLinksFrom 25 times (once per concept)
    expect(getLinksFrom).toHaveBeenCalledTimes(25);
    expect(result.entitySeeds).toHaveLength(25);
    expect(result.stats.conceptsSearched).toBe(25);
  });

  it('should handle batch size of 1', async () => {
    const crossLinker = createMockCrossLinker({
      concept1: [createCrossLink('concept1', 'entity1')],
      concept2: [createCrossLink('concept2', 'entity2')],
    });

    const matches = [
      createSemanticMatch('concept1', 0.9),
      createSemanticMatch('concept2', 0.8),
    ];

    const result = await seedFromSemanticBatch(matches, crossLinker, 1);

    expect(result.entitySeeds).toHaveLength(2);
  });

  it('should throw for batch size less than 1', async () => {
    const crossLinker = createMockCrossLinker({});

    await expect(seedFromSemanticBatch([], crossLinker, 0)).rejects.toThrow(
      RetrievalValidationError,
    );

    await expect(seedFromSemanticBatch([], crossLinker, -5)).rejects.toThrow(
      RetrievalValidationError,
    );
  });

  it('should deduplicate across batches', async () => {
    const crossLinker = createMockCrossLinker({
      concept1: [createCrossLink('concept1', 'shared')],
      concept2: [createCrossLink('concept2', 'shared')],
      concept3: [createCrossLink('concept3', 'shared')],
    });

    const matches = [
      createSemanticMatch('concept1', 0.9),
      createSemanticMatch('concept2', 0.8),
      createSemanticMatch('concept3', 0.7),
    ];

    const result = await seedFromSemanticBatch(matches, crossLinker, 1);

    expect(result.entitySeeds).toHaveLength(1);
    expect(result.entitySeeds[0].entityId).toBe('shared');
  });

  describe('validation', () => {
    it('should throw for null crossLinker', async () => {
      await expect(
        seedFromSemanticBatch([], null as unknown as CrossLinker),
      ).rejects.toThrow(RetrievalValidationError);
    });

    it('should throw for invalid matches', async () => {
      const crossLinker = createMockCrossLinker({});

      await expect(
        seedFromSemanticBatch(
          'invalid' as unknown as SemanticMatch[],
          crossLinker,
        ),
      ).rejects.toThrow(RetrievalValidationError);
    });
  });
});

describe('getEntityIds', () => {
  it('should extract entity IDs from seeds', () => {
    const seeds: SeedEntity[] = [
      { entityId: 'e1', sourceConceptId: 'c1', semanticScore: 0.9 },
      { entityId: 'e2', sourceConceptId: 'c2', semanticScore: 0.8 },
      { entityId: 'e3', sourceConceptId: 'c3', semanticScore: 0.7 },
    ];

    const ids = getEntityIds(seeds);

    expect(ids).toEqual(['e1', 'e2', 'e3']);
  });

  it('should return empty array for empty seeds', () => {
    const ids = getEntityIds([]);
    expect(ids).toEqual([]);
  });

  it('should throw for non-array input', () => {
    expect(() => getEntityIds('invalid' as unknown as SeedEntity[])).toThrow(
      RetrievalValidationError,
    );
  });
});

describe('filterSeedsByScore', () => {
  const seeds: SeedEntity[] = [
    { entityId: 'high', sourceConceptId: 'c1', semanticScore: 0.9 },
    { entityId: 'mid', sourceConceptId: 'c2', semanticScore: 0.6 },
    { entityId: 'low', sourceConceptId: 'c3', semanticScore: 0.3 },
  ];

  it('should filter seeds by minimum score', () => {
    const filtered = filterSeedsByScore(seeds, 0.5);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((s) => s.entityId)).toEqual(['high', 'mid']);
  });

  it('should include seeds at exact threshold', () => {
    const filtered = filterSeedsByScore(seeds, 0.6);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((s) => s.entityId)).toContain('mid');
  });

  it('should return all seeds for minScore of 0', () => {
    const filtered = filterSeedsByScore(seeds, 0);
    expect(filtered).toHaveLength(3);
  });

  it('should return no seeds for minScore of 1 with no perfect scores', () => {
    const filtered = filterSeedsByScore(seeds, 1);
    expect(filtered).toHaveLength(0);
  });

  it('should return empty array for empty seeds', () => {
    const filtered = filterSeedsByScore([], 0.5);
    expect(filtered).toHaveLength(0);
  });

  describe('validation', () => {
    it('should throw for non-array seeds', () => {
      expect(() =>
        filterSeedsByScore('invalid' as unknown as SeedEntity[], 0.5),
      ).toThrow(RetrievalValidationError);
    });

    it('should throw for minScore below 0', () => {
      expect(() => filterSeedsByScore(seeds, -0.1)).toThrow(
        RetrievalValidationError,
      );
    });

    it('should throw for minScore above 1', () => {
      expect(() => filterSeedsByScore(seeds, 1.5)).toThrow(
        RetrievalValidationError,
      );
    });
  });
});

// Helper to create an enriched semantic match
function createEnrichedMatch(
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

describe('extractSeedsFromEnrichedMatches', () => {
  it('should extract entity seeds from enriched matches', () => {
    const matches = [
      createEnrichedMatch(
        'concept1',
        0.9,
        ['entity1', 'entity2'],
        ['E1', 'E2'],
      ),
      createEnrichedMatch('concept2', 0.8, ['entity3'], ['E3']),
    ];

    const result = extractSeedsFromEnrichedMatches(matches);

    expect(result.entitySeeds).toHaveLength(3);
    expect(result.entitySeeds[0].entityId).toBe('entity1');
    expect(result.entitySeeds[0].sourceConceptId).toBe('concept1');
    expect(result.entitySeeds[0].semanticScore).toBe(0.9);
    expect(result.conceptIds).toEqual(['concept1', 'concept2']);
    expect(result.stats.conceptsSearched).toBe(2);
    expect(result.stats.entitiesFound).toBe(3);
    expect(result.stats.conceptsWithoutLinks).toBe(0);
  });

  it('should filter by minScore', () => {
    const matches = [
      createEnrichedMatch('concept1', 0.9, ['entity1'], ['E1']),
      createEnrichedMatch('concept2', 0.4, ['entity2'], ['E2']), // Below threshold
    ];

    const result = extractSeedsFromEnrichedMatches(matches, 0.5);

    expect(result.entitySeeds).toHaveLength(1);
    expect(result.entitySeeds[0].entityId).toBe('entity1');
    expect(result.conceptIds).toEqual(['concept1']); // Only above threshold
  });

  it('should handle concepts without linked entities', () => {
    const matches = [
      createEnrichedMatch('concept1', 0.9, ['entity1'], ['E1']),
      createEnrichedMatch('concept2', 0.8, [], []), // No links
    ];

    const result = extractSeedsFromEnrichedMatches(matches);

    expect(result.entitySeeds).toHaveLength(1);
    expect(result.stats.conceptsWithoutLinks).toBe(1);
  });

  it('should deduplicate entities across concepts', () => {
    const matches = [
      createEnrichedMatch('concept1', 0.9, ['shared'], ['Shared']),
      createEnrichedMatch('concept2', 0.8, ['shared'], ['Shared']),
    ];

    const result = extractSeedsFromEnrichedMatches(matches);

    expect(result.entitySeeds).toHaveLength(1);
    expect(result.entitySeeds[0].entityId).toBe('shared');
    expect(result.entitySeeds[0].sourceConceptId).toBe('concept1'); // First one wins
    expect(result.entitySeeds[0].semanticScore).toBe(0.9);
  });

  it('should handle empty matches array', () => {
    const result = extractSeedsFromEnrichedMatches([]);

    expect(result.entitySeeds).toHaveLength(0);
    expect(result.conceptIds).toHaveLength(0);
    expect(result.stats.conceptsSearched).toBe(0);
  });

  describe('validation', () => {
    it('should throw for non-array input', () => {
      expect(() =>
        extractSeedsFromEnrichedMatches(
          'invalid' as unknown as EnrichedSemanticMatch[],
        ),
      ).toThrow(RetrievalValidationError);
    });

    it('should throw for minScore below 0', () => {
      expect(() => extractSeedsFromEnrichedMatches([], -0.1)).toThrow(
        RetrievalValidationError,
      );
    });

    it('should throw for minScore above 1', () => {
      expect(() => extractSeedsFromEnrichedMatches([], 1.5)).toThrow(
        RetrievalValidationError,
      );
    });
  });
});
