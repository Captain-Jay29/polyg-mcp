// Tests for seed-extractor functions

import type { EnrichedSemanticMatch } from '@polyg-mcp/shared';
import { describe, expect, it } from 'vitest';
import { RetrievalValidationError } from './errors.js';
import {
  extractSeedsFromEnrichedMatches,
  type SeedEntity,
} from './seed-extractor.js';

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

  it('should extract unique entity IDs from seeds', () => {
    const matches = [
      createEnrichedMatch('concept1', 0.9, ['e1', 'e2'], ['E1', 'E2']),
      createEnrichedMatch('concept2', 0.8, ['e3'], ['E3']),
    ];

    const result = extractSeedsFromEnrichedMatches(matches);
    const ids = result.entitySeeds.map((s: SeedEntity) => s.entityId);

    expect(ids).toEqual(['e1', 'e2', 'e3']);
  });

  it('should allow filtering seeds by score after extraction', () => {
    const matches = [
      createEnrichedMatch('concept1', 0.9, ['high'], ['High']),
      createEnrichedMatch('concept2', 0.6, ['mid'], ['Mid']),
      createEnrichedMatch('concept3', 0.3, ['low'], ['Low']),
    ];

    // Use minScore parameter directly in extraction
    const result = extractSeedsFromEnrichedMatches(matches, 0.5);

    expect(result.entitySeeds).toHaveLength(2);
    expect(result.entitySeeds.map((s: SeedEntity) => s.entityId)).toEqual([
      'high',
      'mid',
    ]);
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
