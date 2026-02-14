// Fast path — batch embed + sequential graph write
import { SemanticGraph } from '../graphs/semantic.js';
import { TemporalGraph } from '../graphs/temporal.js';
import type { FastPathResult, IngestionDeps, ParsedChunk } from './types.js';

/** Max chars sent to the embedding model per chunk. */
export const EMBED_TEXT_LIMIT = 500;
/** Max chars for S_Concept node name. */
export const CONCEPT_NAME_LIMIT = 100;
/** Max chars for S_Concept node description. */
export const CONCEPT_DESC_LIMIT = 500;
/** Interval (ms) between synthetic timestamps for chunks without real ones. */
const SYNTHETIC_INTERVAL_MS = 60_000;

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
  const texts = chunks.map((c) => c.content.slice(0, EMBED_TEXT_LIMIT));
  const embeddings = await deps.embeddings.embedBatch(texts);
  const embeddingTimeMs = Date.now() - t0;

  // Phase B: Sequential write — events, concepts, temporal backbone
  const t1 = Date.now();
  const eventIds: string[] = [];
  const conceptIds: string[] = [];
  let previousEventId: string | null = null;
  const baseTime = resolveBaseTime(chunks);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // 1. Create T_Event
    const occurredAt = chunk.metadata.timestamp
      ? new Date(chunk.metadata.timestamp)
      : new Date(baseTime + i * SYNTHETIC_INTERVAL_MS);
    const event = await temporal.addEvent(chunk.content, occurredAt);
    eventIds.push(event.uuid);

    // 2. Create S_Concept with pre-computed embedding
    const concept = await semantic.addConceptWithEmbedding(
      chunk.content.slice(0, CONCEPT_NAME_LIMIT),
      embeddings[i],
      chunk.content.slice(0, CONCEPT_DESC_LIMIT),
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

/**
 * Resolve a base time for synthetic timestamps.
 * Finds the first chunk with a real timestamp and offsets backwards so that
 * chunk 0 starts at `timestamp - (index * interval)`. If no chunk has a
 * timestamp, falls back to Date.now().
 *
 * Known gap: when multiple chunks have real timestamps scattered throughout
 * (e.g. chunk 0 at 10:00, chunk 5 at 10:02), synthetic chunks between them
 * may have occurred_at values that break chronological order relative to later
 * real timestamps. FOLLOWS edges still preserve correct positional order.
 * This doesn't affect current parsers (conversation = all timestamps or none),
 * but would need interpolation logic if a future parser produces mixed output.
 */
function resolveBaseTime(chunks: ParsedChunk[]): number {
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].metadata.timestamp) {
      return (
        new Date(chunks[i].metadata.timestamp as string).getTime() -
        i * SYNTHETIC_INTERVAL_MS
      );
    }
  }
  return Date.now();
}
