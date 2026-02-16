// Slow path — per-chunk LLM extraction + graph writes
import type { Entity } from '@polyg-mcp/shared';
import { ZodError } from 'zod';
import { CausalGraph } from '../graphs/causal.js';
import { EntityGraph } from '../graphs/entity.js';
import { TemporalGraph } from '../graphs/temporal.js';
import { buildExtractionPrompt } from './extraction-prompt.js';
import type { NeighborhoodContext } from './neighborhood.js';
import { gather2HopNeighborhood } from './neighborhood.js';
import { normalizeExtraction, stripJsonFences } from './normalize.js';
import type {
  ChunkExtraction,
  DocumentProfile,
  FastPathResult,
  IngestionDeps,
  ParsedChunk,
} from './types.js';
import { ChunkExtractionSchema } from './types.js';

export interface SlowPathResult {
  extractedChunks: number;
  skippedChunks: number;
  skippedChunkIds: string[];
  entities_created: number;
  relationships_created: number;
  facts_created: number;
  causal_nodes_created: number;
  causal_links_created: number;
  cross_links_created: number;
  warnings: string[];
}

export async function runSlowPath(
  chunks: ParsedChunk[],
  fastPathResult: FastPathResult,
  profile: DocumentProfile,
  deps: IngestionDeps,
  _concurrency = 1,
): Promise<SlowPathResult> {
  const entityGraph = new EntityGraph(deps.db);
  const temporalGraph = new TemporalGraph(deps.db);
  const causalGraph = new CausalGraph(deps.db);

  const result: SlowPathResult = {
    extractedChunks: 0,
    skippedChunks: 0,
    skippedChunkIds: [],
    entities_created: 0,
    relationships_created: 0,
    facts_created: 0,
    causal_nodes_created: 0,
    causal_links_created: 0,
    cross_links_created: 0,
    warnings: [],
  };

  // Global entity map across all chunks: normalized name → Entity
  const globalEntityMap = new Map<string, Entity>();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const eventId = fastPathResult.eventIds[i];
    const conceptId = fastPathResult.conceptIds[i];

    // 1. Gather neighborhood context
    const neighborhood = await gather2HopNeighborhood(
      conceptId,
      deps,
      fastPathResult.eventIds,
      i,
      result.warnings,
    );

    // 2. LLM extraction with retry
    const extraction = await extractWithRetry(
      chunk,
      profile,
      neighborhood,
      deps,
      result.warnings,
      chunks.length,
    );
    if (!extraction) {
      result.skippedChunks++;
      result.skippedChunkIds.push(chunk.chunk_id);
      continue;
    }

    // 3. Write extraction to graph
    const writeResult = await writeChunkExtraction(
      extraction,
      eventId,
      entityGraph,
      temporalGraph,
      causalGraph,
      globalEntityMap,
      result.warnings,
    );

    result.extractedChunks++;
    result.entities_created += writeResult.entities_created;
    result.relationships_created += writeResult.relationships_created;
    result.facts_created += writeResult.facts_created;
    result.causal_nodes_created += writeResult.causal_nodes_created;
    result.causal_links_created += writeResult.causal_links_created;
    result.cross_links_created += writeResult.cross_links_created;
  }

  return result;
}

/**
 * Attempt LLM extraction with one retry on failure.
 */
async function extractWithRetry(
  chunk: ParsedChunk,
  profile: DocumentProfile,
  neighborhood: NeighborhoodContext,
  deps: IngestionDeps,
  warnings: string[],
  totalChunks: number,
): Promise<ChunkExtraction | null> {
  const { system, user } = buildExtractionPrompt(
    chunk,
    profile,
    neighborhood,
    totalChunks,
  );
  const prompt = `${system}\n\n${user}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await deps.llm.complete({
        prompt,
        responseFormat: 'json',
      });
      const parsed = ChunkExtractionSchema.parse(
        JSON.parse(stripJsonFences(raw)),
      );
      return normalizeExtraction(parsed);
    } catch (err) {
      // Schema validation errors won't resolve on retry with the same prompt
      if (err instanceof ZodError || err instanceof SyntaxError) {
        warnings.push(
          `Extraction failed for chunk ${chunk.chunk_id} (invalid response structure): ${errMsg(err)}`,
        );
        return null;
      }
      if (attempt === 1) {
        warnings.push(
          `Extraction failed for chunk ${chunk.chunk_id} after 2 attempts: ${errMsg(err)}`,
        );
        return null;
      }
      // retry on transient errors (network/timeout)
    }
  }

  return null;
}

interface WriteResult {
  entities_created: number;
  relationships_created: number;
  facts_created: number;
  causal_nodes_created: number;
  causal_links_created: number;
  cross_links_created: number;
}

/**
 * Write a chunk's extraction to the graph.
 * Follows the pattern from benchmarks/src/locomo/ingest.ts → writeToGraphs().
 */
async function writeChunkExtraction(
  extraction: ChunkExtraction,
  eventId: string,
  entityGraph: EntityGraph,
  temporalGraph: TemporalGraph,
  causalGraph: CausalGraph,
  globalEntityMap: Map<string, Entity>,
  warnings: string[],
): Promise<WriteResult> {
  const result: WriteResult = {
    entities_created: 0,
    relationships_created: 0,
    facts_created: 0,
    causal_nodes_created: 0,
    causal_links_created: 0,
    cross_links_created: 0,
  };

  // 1. Entities — addEntity auto-deduplicates by name+type
  for (const ent of extraction.entities) {
    try {
      const entity = await entityGraph.addEntity(
        ent.name,
        ent.entity_type,
        ent.properties,
      );
      const key = normalizeEntityKey(ent.name);
      if (!globalEntityMap.has(key)) {
        result.entities_created++;
      }
      globalEntityMap.set(key, entity);
    } catch (err) {
      warnings.push(
        `Failed to create entity "${ent.name}" (${ent.entity_type}): ${errMsg(err)}`,
      );
    }
  }

  // 2. Relationships — resolve names via globalEntityMap
  for (const rel of extraction.relationships) {
    try {
      const source = globalEntityMap.get(normalizeEntityKey(rel.source));
      const target = globalEntityMap.get(normalizeEntityKey(rel.target));
      if (source && target) {
        await entityGraph.linkEntities(
          source.uuid,
          target.uuid,
          rel.relationship_type,
        );
        result.relationships_created++;
      }
    } catch (err) {
      warnings.push(
        `Failed to link "${rel.source}" → "${rel.target}" (${rel.relationship_type}): ${errMsg(err)}`,
      );
    }
  }

  // 3. Facts — create fact + link to subject entity
  for (const fact of extraction.facts) {
    try {
      const factNode = await temporalGraph.addFact(
        fact.subject,
        fact.predicate,
        fact.object,
        new Date(fact.valid_from),
        fact.valid_to ? new Date(fact.valid_to) : undefined,
      );
      result.facts_created++;

      // Link fact to subject entity if available
      if (fact.subject_entity) {
        const subjectEntity = globalEntityMap.get(
          normalizeEntityKey(fact.subject_entity),
        );
        if (subjectEntity) {
          await temporalGraph.linkFactToEntity(
            factNode.uuid,
            subjectEntity.uuid,
          );
          result.cross_links_created++;
        }
      }
    } catch (err) {
      warnings.push(
        `Failed to create fact "${fact.subject} ${fact.predicate} ${fact.object}": ${errMsg(err)}`,
      );
    }
  }

  // 4. Causal links — findOrCreate nodes + addLink + link to entities + link to event
  const seenCausalDescriptions = new Set<string>();
  for (const causal of extraction.causal_links) {
    try {
      const causeNode = await causalGraph.findOrCreate(causal.cause);
      const effectNode = await causalGraph.findOrCreate(causal.effect);
      const causeKey = causal.cause.toLowerCase().trim();
      const effectKey = causal.effect.toLowerCase().trim();
      if (!seenCausalDescriptions.has(causeKey)) {
        seenCausalDescriptions.add(causeKey);
        result.causal_nodes_created++;
      }
      if (!seenCausalDescriptions.has(effectKey)) {
        seenCausalDescriptions.add(effectKey);
        result.causal_nodes_created++;
      }

      await causalGraph.addLink(
        causeNode.uuid,
        effectNode.uuid,
        causal.confidence,
        causal.evidence,
      );
      result.causal_links_created++;

      // Link causal nodes to this chunk's event
      await causalGraph.linkToEvent(causeNode.uuid, eventId);
      result.cross_links_created++;

      // Link causal nodes to involved entities
      if (causal.entities) {
        for (const entName of causal.entities) {
          const entity = globalEntityMap.get(normalizeEntityKey(entName));
          if (entity) {
            await causalGraph.linkToEntity(causeNode.uuid, entity.uuid);
            await causalGraph.linkToEntity(effectNode.uuid, entity.uuid);
            result.cross_links_created += 2;
          }
        }
      }
    } catch (err) {
      warnings.push(
        `Failed to create causal link "${causal.cause}" → "${causal.effect}": ${errMsg(err)}`,
      );
    }
  }

  // 5. Cross-link: this chunk's T_Event → X_INVOLVES → extracted entities
  for (const ent of extraction.entities) {
    try {
      const entity = globalEntityMap.get(normalizeEntityKey(ent.name));
      if (entity) {
        await temporalGraph.linkEventToEntity(eventId, entity.uuid);
        result.cross_links_created++;
      }
    } catch (err) {
      warnings.push(
        `Failed to cross-link event ${eventId} to entity "${ent.name}": ${errMsg(err)}`,
      );
    }
  }

  return result;
}

function normalizeEntityKey(name: string): string {
  return name.toLowerCase().trim();
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
