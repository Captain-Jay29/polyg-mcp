// Ingestion pipeline types and Zod schemas

import type { EmbeddingProvider, LLMProvider } from '@polyg-mcp/shared';
import { z } from 'zod';
import type { FalkorDBAdapter } from '../storage/falkordb.js';

// --- Pipeline input ---

export type InputFormat = 'conversation' | 'text' | 'structured' | 'auto';

export interface IngestInput {
  content: string;
  format?: InputFormat; // default: 'auto'
  profileOverride?: DocumentProfile; // skip profiler if provided
  concurrency?: number; // slow path concurrency (default: 1)
}

export interface IngestionDeps {
  db: FalkorDBAdapter;
  llm: LLMProvider;
  embeddings: EmbeddingProvider;
}

// --- Parser output ---

export interface ParsedChunk {
  chunk_id: string; // "chunk_001"
  content: string;
  position: number; // 0-indexed ordering
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  source_format: InputFormat;
  timestamp?: string; // ISO-8601
  speaker?: string;
  section?: string;
  turn_index?: number; // conversation turn number
  extra?: Record<string, unknown>; // Domain-specific metadata from parsers
}

// --- Document Profile ---

export const DocumentProfileSchema = z.object({
  document_type: z.string(),
  domain: z.string(),
  entity_types_expected: z.array(z.string()),
  relationship_types_expected: z.array(z.string()),
  causal_patterns: z.array(z.string()),
  temporal_structure: z.enum([
    'explicit_timestamps',
    'session_ordered',
    'implicit',
  ]),
  extraction_focus: z.string(),
  confidence_calibration: z.object({
    explicit_causation: z.number().min(0).max(1),
    strong_implication: z.number().min(0).max(1),
    weak_inference: z.number().min(0).max(1),
  }),
});

export type DocumentProfile = z.infer<typeof DocumentProfileSchema>;

// --- Slow path extraction (per-chunk LLM output) ---
// Note: Deliberately omits `events` and `concepts` arrays present in the
// LoCoMo ExtractionResultSchema (benchmarks/src/locomo/extraction-prompt.ts).
// Events come from the fast path (T_Event per chunk), and concepts are created
// via batch embeddings (S_Concept per chunk), so the LLM only extracts entities,
// relationships, causal links, and facts.

export const ChunkExtractionSchema = z.object({
  entities: z.array(
    z.object({
      name: z.string(),
      entity_type: z.string(),
      properties: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  relationships: z.array(
    z.object({
      source: z.string(), // entity name
      target: z.string(), // entity name
      relationship_type: z.string(),
    }),
  ),
  causal_links: z.array(
    z.object({
      cause: z.string(),
      effect: z.string(),
      confidence: z.number().min(0).max(1),
      evidence: z.string().optional(),
      entities: z.array(z.string()).optional(),
    }),
  ),
  facts: z.array(
    z.object({
      subject: z.string(),
      predicate: z.string(),
      object: z.string(),
      valid_from: z.string(), // ISO-8601
      valid_to: z.string().optional(),
      subject_entity: z.string().optional(),
    }),
  ),
});

export type ChunkExtraction = z.infer<typeof ChunkExtractionSchema>;

// --- Fast path output (internal bookkeeping) ---

export interface FastPathResult {
  eventIds: string[]; // T_Event UUIDs in order
  conceptIds: string[]; // S_Concept UUIDs in order
  embeddingTimeMs: number;
  writeTimeMs: number;
}

// --- Post-processing ---

export interface DeduplicationResult {
  mergedEntities: number; // entities merged into canonicals
  mergedCausalNodes: number;
  factsWithUpdatedValidity: number;
  orphanedLinksRemoved: number;
}

// --- Ingestion report ---

export interface IngestionReport {
  status: 'completed' | 'completed_with_warnings' | 'failed';
  chunks: {
    total: number;
    parsed: number;
    fast_path_written: number;
    slow_path_extracted: number;
    slow_path_skipped: number; // failed extraction
  };
  graph: {
    entities_created: number;
    events_created: number;
    facts_created: number;
    concepts_created: number;
    causal_nodes_created: number;
    causal_links_created: number;
    cross_links_created: number;
    relationships_created: number;
  };
  deduplication: DeduplicationResult;
  quality_warnings: string[];
  cost: {
    profiler_calls: number;
    extraction_calls: number;
    embedding_calls: number; // should be 1 (batch)
    total_llm_calls: number;
  };
  timing: {
    parse_ms: number;
    profile_ms: number;
    fast_path_ms: number;
    slow_path_ms: number;
    post_process_ms: number;
    total_ms: number;
  };
}
