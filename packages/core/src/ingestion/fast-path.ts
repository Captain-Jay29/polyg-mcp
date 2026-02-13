// Fast path — batch embed + sequential graph write
import { SemanticGraph } from '../graphs/semantic.js';
import { TemporalGraph } from '../graphs/temporal.js';
import type { FastPathResult, IngestionDeps, ParsedChunk } from './types.js';

/**
 * Run the fast path: batch embed all chunks, then sequentially write
 * T_Event + S_Concept nodes with a temporal backbone (FOLLOWS edges).
 *
 * This creates the structural skeleton that the slow path enriches.
 */
export async function runFastPath(
  chunks: ParsedChunk[],
  deps: IngestionDeps,
): Promise<FastPathResult> {
  const semantic = new SemanticGraph(deps.db, deps.embeddings);
  const temporal = new TemporalGraph(deps.db);

  // Phase A: Batch embed all chunk content in a single API call
  const t0 = Date.now();
  const texts = chunks.map((c) => c.content.slice(0, 200));
  const embeddings = await deps.embeddings.embedBatch(texts);
  const embeddingTimeMs = Date.now() - t0;

  // Phase B: Sequential write — events, concepts, temporal backbone
  const t1 = Date.now();
  const eventIds: string[] = [];
  const conceptIds: string[] = [];
  let previousEventId: string | null = null;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // 1. Create T_Event
    const occurredAt = chunk.metadata.timestamp
      ? new Date(chunk.metadata.timestamp)
      : new Date();
    const event = await temporal.addEvent(chunk.content, occurredAt);
    eventIds.push(event.uuid);

    // 2. Create S_Concept with pre-computed embedding
    const concept = await semantic.addConceptWithEmbedding(
      chunk.content.slice(0, 100), // name: truncated
      embeddings[i],
      chunk.content.slice(0, 500), // description: longer context
    );
    conceptIds.push(concept.uuid);

    // 3. Temporal backbone: chain events with FOLLOWS edges
    if (previousEventId) {
      await temporal.linkEventsSequentially(previousEventId, event.uuid);
    }
    previousEventId = event.uuid;
  }

  return {
    eventIds,
    conceptIds,
    embeddingTimeMs,
    writeTimeMs: Date.now() - t1,
  };
}
