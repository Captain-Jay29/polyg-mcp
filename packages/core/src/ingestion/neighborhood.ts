// 2-hop neighborhood gatherer for slow path context
import { SemanticGraph } from '../graphs/semantic.js';
import type { IngestionDeps } from './types.js';

export interface NeighborhoodContext {
  knownEntities: { name: string; type: string; uuid: string }[];
  recentEvents: { description: string; occurred_at: string }[];
  activeCausalChains: {
    cause: string;
    effect: string;
    confidence: number;
  }[];
  similarConcepts: { name: string; score: number }[];
}

const EMPTY_NEIGHBORHOOD: NeighborhoodContext = {
  knownEntities: [],
  recentEvents: [],
  activeCausalChains: [],
  similarConcepts: [],
};

/**
 * Gather 2-hop neighborhood from a chunk's T_Event and S_Concept.
 *
 * Provides context for the slow path extraction prompt:
 * - Known entities from recent events (via X_INVOLVES → E_Entity → E_RELATES)
 * - Recent event descriptions (temporal window)
 * - Active causal chains (via entities → X_AFFECTS → C_Node → C_CAUSES)
 * - Similar concepts (vector similarity)
 */
export async function gather2HopNeighborhood(
  conceptId: string,
  deps: IngestionDeps,
  eventIds: string[],
  currentPosition: number,
  warnings: string[] = [],
): Promise<NeighborhoodContext> {
  // Window: previous 5 events (or fewer if near start)
  const windowStart = Math.max(0, currentPosition - 5);
  const recentEventIds = eventIds.slice(windowStart, currentPosition + 1);

  if (recentEventIds.length === 0) {
    return EMPTY_NEIGHBORHOOD;
  }

  // Run all queries in parallel
  const [knownEntities, recentEvents, activeCausalChains, similarConcepts] =
    await Promise.all([
      gatherKnownEntities(deps, recentEventIds, warnings),
      gatherRecentEvents(deps, recentEventIds, warnings),
      gatherCausalChains(deps, recentEventIds, warnings),
      gatherSimilarConcepts(deps, conceptId, warnings),
    ]);

  return {
    knownEntities,
    recentEvents,
    activeCausalChains,
    similarConcepts,
  };
}

/**
 * Known entities from recent events: T_Event → X_INVOLVES → E_Entity → E_RELATES → E_Entity
 */
async function gatherKnownEntities(
  deps: IngestionDeps,
  recentEventIds: string[],
  warnings: string[],
): Promise<NeighborhoodContext['knownEntities']> {
  try {
    const result = await deps.db.query(
      `MATCH (e:T_Event)-[:X_INVOLVES]->(ent:E_Entity)
       WHERE e.uuid IN $eventIds
       OPTIONAL MATCH (ent)-[:E_RELATES]-(related:E_Entity)
       WITH collect(DISTINCT ent) + collect(DISTINCT related) AS all_ents
       UNWIND all_ents AS entity
       WITH DISTINCT entity
       WHERE entity IS NOT NULL
       RETURN entity.uuid AS uuid, entity.name AS name, entity.entity_type AS type`,
      { eventIds: recentEventIds },
    );

    return result.records.map(
      (r: Record<string, unknown>) =>
        ({
          uuid: r.uuid as string,
          name: r.name as string,
          type: r.type as string,
        }) as NeighborhoodContext['knownEntities'][number],
    );
  } catch (err) {
    warnings.push(
      `Neighborhood: failed to gather known entities: ${errMsg(err)}`,
    );
    return [];
  }
}

/**
 * Recent events: descriptions from the temporal window
 */
async function gatherRecentEvents(
  deps: IngestionDeps,
  recentEventIds: string[],
  warnings: string[],
): Promise<NeighborhoodContext['recentEvents']> {
  try {
    const result = await deps.db.query(
      `MATCH (e:T_Event)
       WHERE e.uuid IN $eventIds
       RETURN e.description AS description, e.occurred_at AS occurred_at
       ORDER BY e.occurred_at ASC`,
      { eventIds: recentEventIds },
    );

    return result.records.map(
      (r: Record<string, unknown>) =>
        ({
          description: r.description as string,
          occurred_at: r.occurred_at as string,
        }) as NeighborhoodContext['recentEvents'][number],
    );
  } catch (err) {
    warnings.push(
      `Neighborhood: failed to gather recent events: ${errMsg(err)}`,
    );
    return [];
  }
}

/**
 * Active causal chains from entities linked to recent events:
 * E_Entity ← X_AFFECTS ← C_Node → C_CAUSES → C_Node
 */
async function gatherCausalChains(
  deps: IngestionDeps,
  recentEventIds: string[],
  warnings: string[],
): Promise<NeighborhoodContext['activeCausalChains']> {
  try {
    // First get entity IDs from recent events
    const entityResult = await deps.db.query(
      `MATCH (e:T_Event)-[:X_INVOLVES]->(ent:E_Entity)
       WHERE e.uuid IN $eventIds
       RETURN DISTINCT ent.uuid AS uuid`,
      { eventIds: recentEventIds },
    );

    const entityIds = entityResult.records.map(
      (r: Record<string, unknown>) => r.uuid as string,
    );

    if (entityIds.length === 0) {
      return [];
    }

    // Then traverse causal chains from those entities
    const result = await deps.db.query(
      `MATCH (ent:E_Entity)<-[:X_AFFECTS]-(c:C_Node)
       WHERE ent.uuid IN $entityIds
       OPTIONAL MATCH (c)-[link:C_CAUSES]->(effect:C_Node)
       RETURN c.description AS cause, effect.description AS effect, link.confidence AS confidence`,
      { entityIds },
    );

    return result.records
      .filter(
        (r: Record<string, unknown>) => r.cause != null && r.effect != null,
      )
      .map(
        (r: Record<string, unknown>) =>
          ({
            cause: r.cause as string,
            effect: r.effect as string,
            confidence: typeof r.confidence === 'number' ? r.confidence : 1.0,
          }) as NeighborhoodContext['activeCausalChains'][number],
      );
  } catch (err) {
    warnings.push(
      `Neighborhood: failed to gather causal chains: ${errMsg(err)}`,
    );
    return [];
  }
}

/**
 * Similar concepts: vector similarity search from the current chunk's concept
 */
async function gatherSimilarConcepts(
  deps: IngestionDeps,
  conceptId: string,
  warnings: string[],
): Promise<NeighborhoodContext['similarConcepts']> {
  try {
    const semantic = new SemanticGraph(deps.db, deps.embeddings);
    const matches = await semantic.getSimilar(conceptId, 5);

    return matches.map((m) => ({
      name: m.concept.name,
      score: m.score,
    }));
  } catch (err) {
    warnings.push(
      `Neighborhood: failed to gather similar concepts for ${conceptId}: ${errMsg(err)}`,
    );
    return [];
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
