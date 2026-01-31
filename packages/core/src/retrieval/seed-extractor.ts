/**
 * SeedExtractor - Extracts entity seeds from semantic search results
 *
 * Part of MAGMA retrieval: uses X_REPRESENTS cross-links to find entity IDs
 * from semantic concept matches, providing seeds for graph traversal.
 *
 * NOTE: The seedFromSemantic() function is deprecated.
 * Use SemanticGraph.searchWithEntities() instead, which returns EnrichedSemanticMatch
 * with linkedEntityIds already populated (eliminates CrossLinker round-trips).
 */
import {
  type EnrichedSemanticMatch,
  type SemanticMatch,
  SemanticMatchSchema,
} from '@polyg-mcp/shared';
import { z } from 'zod';
import type { CrossLinker } from '../graphs/cross-linker.js';
import { RetrievalValidationError, SeedExtractionError } from './errors.js';

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
 * Validate semantic matches array
 */
function validateSemanticMatches(matches: SemanticMatch[]): SemanticMatch[] {
  if (!Array.isArray(matches)) {
    throw new RetrievalValidationError(
      'Semantic matches must be an array',
      'SeedExtractor',
      [`Expected array, got ${typeof matches}`],
    );
  }

  const errors: string[] = [];
  const validated: SemanticMatch[] = [];

  for (let i = 0; i < matches.length; i++) {
    const result = SemanticMatchSchema.safeParse(matches[i]);
    if (result.success) {
      validated.push(result.data);
    } else {
      errors.push(
        ...result.error.issues.map(
          (issue) => `matches[${i}].${issue.path.join('.')}: ${issue.message}`,
        ),
      );
    }
  }

  if (errors.length > 0) {
    throw new RetrievalValidationError(
      `Invalid semantic matches: ${errors.length} validation error(s)`,
      'SeedExtractor',
      errors,
    );
  }

  return validated;
}

/**
 * Validate extraction result
 */
function validateResult(result: SeedExtractionResult): SeedExtractionResult {
  const validated = SeedExtractionResultSchema.safeParse(result);
  if (!validated.success) {
    throw new RetrievalValidationError(
      'Invalid extraction result',
      'SeedExtractor',
      validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }
  return validated.data;
}

/**
 * Extract entity seeds from semantic search results using X_REPRESENTS links.
 *
 * @deprecated Use SemanticGraph.searchWithEntities() instead.
 * This function performs separate CrossLinker lookups for each concept,
 * which adds unnecessary database round-trips. The new searchWithEntities()
 * method fetches entity IDs in the same query as the semantic search.
 *
 * Flow:
 * 1. Semantic search returns Concept nodes with similarity scores
 * 2. For each Concept, follow X_REPRESENTS links to find Entity nodes
 * 3. Return Entity IDs as seeds for entity/temporal/causal expansion
 *
 * @param semanticMatches - Results from semantic graph search
 * @param crossLinker - CrossLinker instance for following X_REPRESENTS
 * @returns Entity seeds for graph traversal
 * @throws {RetrievalValidationError} If inputs are invalid
 * @throws {SeedExtractionError} If extraction fails
 */
export async function seedFromSemantic(
  semanticMatches: SemanticMatch[],
  crossLinker: CrossLinker,
): Promise<SeedExtractionResult> {
  // Validate inputs
  const validatedMatches = validateSemanticMatches(semanticMatches);

  if (!crossLinker) {
    throw new RetrievalValidationError(
      'CrossLinker is required',
      'SeedExtractor',
      ['crossLinker parameter is null or undefined'],
    );
  }

  try {
    const entitySeeds: SeedEntity[] = [];
    const conceptIds: string[] = [];
    const seenEntities = new Set<string>();
    let conceptsWithoutLinks = 0;

    for (const match of validatedMatches) {
      const conceptId = match.concept.uuid;
      conceptIds.push(conceptId);

      // Get all outgoing cross-links from this concept
      const links = await crossLinker.getLinksFrom(conceptId);

      // Filter to X_REPRESENTS links (Concept → Entity)
      const entityLinks = links.filter((l) => l.linkType === 'X_REPRESENTS');

      if (entityLinks.length === 0) {
        conceptsWithoutLinks++;
        continue;
      }

      // Add each linked entity as a seed
      for (const link of entityLinks) {
        if (!seenEntities.has(link.targetId)) {
          seenEntities.add(link.targetId);
          entitySeeds.push({
            entityId: link.targetId,
            sourceConceptId: conceptId,
            semanticScore: match.score,
          });
        }
      }
    }

    const result: SeedExtractionResult = {
      entitySeeds,
      conceptIds,
      stats: {
        conceptsSearched: validatedMatches.length,
        entitiesFound: entitySeeds.length,
        conceptsWithoutLinks,
      },
    };

    return validateResult(result);
  } catch (error) {
    if (error instanceof RetrievalValidationError) {
      throw error;
    }
    throw new SeedExtractionError(
      'Failed to extract seeds from semantic matches',
      semanticMatches.length,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Batch version of seed extraction for efficiency with large result sets.
 * Groups concepts and makes fewer database calls.
 *
 * @throws {RetrievalValidationError} If inputs are invalid
 * @throws {SeedExtractionError} If extraction fails
 */
export async function seedFromSemanticBatch(
  semanticMatches: SemanticMatch[],
  crossLinker: CrossLinker,
  batchSize = 10,
): Promise<SeedExtractionResult> {
  // Validate inputs
  const validatedMatches = validateSemanticMatches(semanticMatches);

  if (!crossLinker) {
    throw new RetrievalValidationError(
      'CrossLinker is required',
      'SeedExtractor',
      ['crossLinker parameter is null or undefined'],
    );
  }

  if (batchSize < 1) {
    throw new RetrievalValidationError(
      'Batch size must be at least 1',
      'SeedExtractor',
      [`Expected batchSize >= 1, got ${batchSize}`],
    );
  }

  try {
    const entitySeeds: SeedEntity[] = [];
    const conceptIds: string[] = [];
    const seenEntities = new Set<string>();
    let conceptsWithoutLinks = 0;

    // Process in batches
    for (let i = 0; i < validatedMatches.length; i += batchSize) {
      const batch = validatedMatches.slice(i, i + batchSize);

      // Process batch in parallel
      const linkResults = await Promise.all(
        batch.map(async (match) => {
          const conceptId = match.concept.uuid;
          conceptIds.push(conceptId);
          const links = await crossLinker.getLinksFrom(conceptId);
          return { match, conceptId, links };
        }),
      );

      // Collect results
      for (const { match, conceptId, links } of linkResults) {
        const entityLinks = links.filter((l) => l.linkType === 'X_REPRESENTS');

        if (entityLinks.length === 0) {
          conceptsWithoutLinks++;
          continue;
        }

        for (const link of entityLinks) {
          if (!seenEntities.has(link.targetId)) {
            seenEntities.add(link.targetId);
            entitySeeds.push({
              entityId: link.targetId,
              sourceConceptId: conceptId,
              semanticScore: match.score,
            });
          }
        }
      }
    }

    const result: SeedExtractionResult = {
      entitySeeds,
      conceptIds,
      stats: {
        conceptsSearched: validatedMatches.length,
        entitiesFound: entitySeeds.length,
        conceptsWithoutLinks,
      },
    };

    return validateResult(result);
  } catch (error) {
    if (error instanceof RetrievalValidationError) {
      throw error;
    }
    throw new SeedExtractionError(
      'Failed to extract seeds from semantic matches (batch)',
      semanticMatches.length,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Get unique entity IDs from seeds (simple array for traversal)
 */
export function getEntityIds(seeds: SeedEntity[]): string[] {
  if (!Array.isArray(seeds)) {
    throw new RetrievalValidationError(
      'Seeds must be an array',
      'SeedExtractor',
      [`Expected array, got ${typeof seeds}`],
    );
  }
  return seeds.map((s) => s.entityId);
}

/**
 * Filter seeds by minimum semantic score
 */
export function filterSeedsByScore(
  seeds: SeedEntity[],
  minScore: number,
): SeedEntity[] {
  if (!Array.isArray(seeds)) {
    throw new RetrievalValidationError(
      'Seeds must be an array',
      'SeedExtractor',
      [`Expected array, got ${typeof seeds}`],
    );
  }
  if (minScore < 0 || minScore > 1) {
    throw new RetrievalValidationError(
      'minScore must be between 0 and 1',
      'SeedExtractor',
      [`Expected 0 <= minScore <= 1, got ${minScore}`],
    );
  }
  return seeds.filter((s) => s.semanticScore >= minScore);
}

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
