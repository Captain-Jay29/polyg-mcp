/**
 * SeedExtractor - Extracts entity seeds from semantic search results
 *
 * Part of MAGMA retrieval: uses X_REPRESENTS cross-links to find entity IDs
 * from semantic concept matches, providing seeds for graph traversal.
 */
import type { SemanticMatch } from '@polyg-mcp/shared';
import type { CrossLinker } from '../graphs/cross-linker.js';

export interface SeedEntity {
  /** Entity UUID */
  entityId: string;
  /** Source concept UUID that linked to this entity */
  sourceConceptId: string;
  /** Semantic score from the original match */
  semanticScore: number;
}

export interface SeedExtractionResult {
  /** Entity IDs suitable for graph traversal */
  entitySeeds: SeedEntity[];
  /** Concept IDs from semantic search (for fallback) */
  conceptIds: string[];
  /** Statistics */
  stats: {
    conceptsSearched: number;
    entitiesFound: number;
    conceptsWithoutLinks: number;
  };
}

/**
 * Extract entity seeds from semantic search results using X_REPRESENTS links.
 *
 * Flow:
 * 1. Semantic search returns Concept nodes with similarity scores
 * 2. For each Concept, follow X_REPRESENTS links to find Entity nodes
 * 3. Return Entity IDs as seeds for entity/temporal/causal expansion
 *
 * @param semanticMatches - Results from semantic graph search
 * @param crossLinker - CrossLinker instance for following X_REPRESENTS
 * @returns Entity seeds for graph traversal
 */
export async function seedFromSemantic(
  semanticMatches: SemanticMatch[],
  crossLinker: CrossLinker,
): Promise<SeedExtractionResult> {
  const entitySeeds: SeedEntity[] = [];
  const conceptIds: string[] = [];
  const seenEntities = new Set<string>();
  let conceptsWithoutLinks = 0;

  for (const match of semanticMatches) {
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

  return {
    entitySeeds,
    conceptIds,
    stats: {
      conceptsSearched: semanticMatches.length,
      entitiesFound: entitySeeds.length,
      conceptsWithoutLinks,
    },
  };
}

/**
 * Batch version of seed extraction for efficiency with large result sets.
 * Groups concepts and makes fewer database calls.
 */
export async function seedFromSemanticBatch(
  semanticMatches: SemanticMatch[],
  crossLinker: CrossLinker,
  batchSize = 10,
): Promise<SeedExtractionResult> {
  const entitySeeds: SeedEntity[] = [];
  const conceptIds: string[] = [];
  const seenEntities = new Set<string>();
  let conceptsWithoutLinks = 0;

  // Process in batches
  for (let i = 0; i < semanticMatches.length; i += batchSize) {
    const batch = semanticMatches.slice(i, i + batchSize);

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

  return {
    entitySeeds,
    conceptIds,
    stats: {
      conceptsSearched: semanticMatches.length,
      entitiesFound: entitySeeds.length,
      conceptsWithoutLinks,
    },
  };
}

/**
 * Get unique entity IDs from seeds (simple array for traversal)
 */
export function getEntityIds(seeds: SeedEntity[]): string[] {
  return seeds.map((s) => s.entityId);
}

/**
 * Filter seeds by minimum semantic score
 */
export function filterSeedsByScore(
  seeds: SeedEntity[],
  minScore: number,
): SeedEntity[] {
  return seeds.filter((s) => s.semanticScore >= minScore);
}
