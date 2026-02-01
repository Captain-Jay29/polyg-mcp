/**
 * SeedExtractor - Extracts entity seeds from semantic search results
 *
 * Part of MAGMA retrieval: uses X_REPRESENTS cross-links to find entity IDs
 * from semantic concept matches, providing seeds for graph traversal.
 *
 * Use SemanticGraph.searchWithEntities() which returns EnrichedSemanticMatch
 * with linkedEntityIds already populated (eliminates CrossLinker round-trips).
 */
import { type EnrichedSemanticMatch } from '@polyg-mcp/shared';
import { z } from 'zod';
import { RetrievalValidationError } from './errors.js';

// Schema for seed entity
const SeedEntitySchema = z.object({
  entityId: z.string().min(1),
  sourceConceptId: z.string().min(1),
  semanticScore: z.number().min(0).max(1),
});

export type SeedEntity = z.infer<typeof SeedEntitySchema>;

// Schema for extraction result
const SeedExtractionResultSchema = z.object({
  entitySeeds: z.array(SeedEntitySchema),
  conceptIds: z.array(z.string()),
  stats: z.object({
    conceptsSearched: z.number().int().min(0),
    entitiesFound: z.number().int().min(0),
    conceptsWithoutLinks: z.number().int().min(0),
  }),
});

export type SeedExtractionResult = z.infer<typeof SeedExtractionResultSchema>;

/**
 * Extract entity seeds from enriched semantic matches.
 *
 * This is the recommended approach for seed extraction. Use with
 * SemanticGraph.searchWithEntities() which returns EnrichedSemanticMatch
 * objects with linkedEntityIds already populated.
 *
 * @param enrichedMatches - Results from SemanticGraph.searchWithEntities()
 * @param minScore - Minimum semantic score threshold (0-1)
 * @returns Entity seeds for graph traversal
 * @throws {RetrievalValidationError} If inputs are invalid
 */
export function extractSeedsFromEnrichedMatches(
  enrichedMatches: EnrichedSemanticMatch[],
  minScore = 0,
): SeedExtractionResult {
  if (!Array.isArray(enrichedMatches)) {
    throw new RetrievalValidationError(
      'Enriched matches must be an array',
      'SeedExtractor',
      [`Expected array, got ${typeof enrichedMatches}`],
    );
  }

  if (minScore < 0 || minScore > 1) {
    throw new RetrievalValidationError(
      'minScore must be between 0 and 1',
      'SeedExtractor',
      [`Expected 0 <= minScore <= 1, got ${minScore}`],
    );
  }

  const entitySeeds: SeedEntity[] = [];
  const conceptIds: string[] = [];
  const seenEntities = new Set<string>();
  let conceptsWithoutLinks = 0;

  for (const match of enrichedMatches) {
    // Skip matches below minimum score threshold
    if (match.score < minScore) {
      continue;
    }

    const conceptId = match.concept.uuid;
    conceptIds.push(conceptId);

    if (match.linkedEntityIds.length === 0) {
      conceptsWithoutLinks++;
      continue;
    }

    for (const entityId of match.linkedEntityIds) {
      if (!seenEntities.has(entityId)) {
        seenEntities.add(entityId);
        entitySeeds.push({
          entityId,
          sourceConceptId: conceptId,
          semanticScore: match.score,
        });
      }
    }
  }

  return {
    entitySeeds,
    conceptIds,
    stats: {
      conceptsSearched: enrichedMatches.length,
      entitiesFound: entitySeeds.length,
      conceptsWithoutLinks,
    },
  };
}
