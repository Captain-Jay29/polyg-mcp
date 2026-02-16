// Ingestion pipeline — public API
import { runFastPath } from './fast-path.js';
import { parse } from './parser/index.js';
import {
  checkQuality,
  getQualityMetrics,
  runPostProcess,
} from './post-process.js';
import { profileDocument } from './profiler.js';
import { getDefaultProfile } from './profiles.js';
import { runSlowPath } from './slow-path.js';
import type {
  DeduplicationResult,
  DocumentProfile,
  IngestInput,
  IngestionDeps,
  IngestionReport,
} from './types.js';

/**
 * Ingest a document into the multi-graph memory.
 *
 * Pipeline: parse → profile → fast path → slow path → post-process → quality checks.
 */
export async function ingest(
  input: IngestInput,
  deps: IngestionDeps,
): Promise<IngestionReport> {
  const totalStart = Date.now();

  // --- Edge case: empty content ---
  if (!input.content || input.content.trim().length === 0) {
    return failedReport('Empty content provided');
  }

  // --- Step 1: Parse ---
  const parseStart = Date.now();
  let chunks: ReturnType<typeof parse>;
  try {
    if (input.format === 'pdf') {
      const { parsePdf } = await import('./parser/pdf.js');
      chunks = await parsePdf(input.content);
    } else {
      chunks = parse(input.content, input.format);
    }
  } catch (err) {
    return failedReport(`Parse failed: ${errMsg(err)}`);
  }
  const parseMs = Date.now() - parseStart;

  if (chunks.length === 0) {
    return failedReport('No chunks produced after parsing');
  }

  // --- Step 2: Profile ---
  const profileStart = Date.now();
  let profile: DocumentProfile;
  let profilerCalls = 0;
  if (input.profileOverride) {
    profile = input.profileOverride;
  } else {
    const detectedFormat = chunks[0]?.metadata.source_format ?? 'auto';
    if (detectedFormat === 'conversation') {
      profile = getDefaultProfile('conversation');
    } else {
      const profileResult = await profileDocument(chunks, deps.llm);
      profile = profileResult.profile;
      profilerCalls = profileResult.cached ? 0 : 1;
    }
  }
  const profileMs = Date.now() - profileStart;

  // --- Step 3: Fast path ---
  const fastStart = Date.now();
  const fastResult = await runFastPath(chunks, deps);
  const fastMs = Date.now() - fastStart;

  // --- Step 4: Slow path ---
  const slowStart = Date.now();
  const slowResult = await runSlowPath(
    chunks,
    fastResult,
    profile,
    deps,
    input.concurrency,
  );
  const slowMs = Date.now() - slowStart;

  // --- Step 5: Post-process (non-fatal) ---
  let deduplication: DeduplicationResult = {
    mergedEntities: 0,
    mergedCausalNodes: 0,
    factsWithUpdatedValidity: 0,
    orphanedLinksRemoved: 0,
  };
  const postProcessWarnings: string[] = [];
  const postStart = Date.now();
  try {
    deduplication = await runPostProcess(deps);
  } catch (err) {
    postProcessWarnings.push(`Post-processing failed: ${errMsg(err)}`);
  }
  const postMs = Date.now() - postStart;

  // --- Step 6: Quality checks (non-fatal) ---
  let qualityWarnings: string[] = [];
  try {
    const metrics = await getQualityMetrics(deps);
    qualityWarnings = checkQuality(
      metrics.entityCount,
      chunks.length,
      slowResult.skippedChunks,
      metrics.disconnectedRatio,
      metrics.maxCausalDepth,
    );
  } catch (err) {
    qualityWarnings.push(`Quality check failed: ${errMsg(err)}`);
  }

  // --- Step 7: Compile report ---
  const allWarnings = [
    ...slowResult.warnings,
    ...postProcessWarnings,
    ...qualityWarnings,
  ];
  const totalMs = Date.now() - totalStart;

  return {
    status: allWarnings.length > 0 ? 'completed_with_warnings' : 'completed',
    chunks: {
      total: chunks.length,
      parsed: chunks.length,
      fast_path_written: fastResult.eventIds.length,
      slow_path_extracted: slowResult.extractedChunks,
      slow_path_skipped: slowResult.skippedChunks,
    },
    graph: {
      entities_created: slowResult.entities_created,
      events_created: fastResult.eventIds.length,
      facts_created: slowResult.facts_created,
      concepts_created: fastResult.conceptIds.length,
      causal_nodes_created: slowResult.causal_nodes_created,
      causal_links_created: slowResult.causal_links_created,
      cross_links_created: slowResult.cross_links_created,
      relationships_created: slowResult.relationships_created,
    },
    deduplication,
    quality_warnings: allWarnings,
    cost: {
      profiler_calls: profilerCalls,
      extraction_calls: slowResult.extractedChunks + slowResult.skippedChunks,
      embedding_calls: 1,
      total_llm_calls:
        profilerCalls + slowResult.extractedChunks + slowResult.skippedChunks,
    },
    timing: {
      parse_ms: parseMs,
      profile_ms: profileMs,
      fast_path_ms: fastMs,
      slow_path_ms: slowMs,
      post_process_ms: postMs,
      total_ms: totalMs,
    },
  };
}

function failedReport(reason: string): IngestionReport {
  return {
    status: 'failed',
    chunks: {
      total: 0,
      parsed: 0,
      fast_path_written: 0,
      slow_path_extracted: 0,
      slow_path_skipped: 0,
    },
    graph: {
      entities_created: 0,
      events_created: 0,
      facts_created: 0,
      concepts_created: 0,
      causal_nodes_created: 0,
      causal_links_created: 0,
      cross_links_created: 0,
      relationships_created: 0,
    },
    deduplication: {
      mergedEntities: 0,
      mergedCausalNodes: 0,
      factsWithUpdatedValidity: 0,
      orphanedLinksRemoved: 0,
    },
    quality_warnings: [reason],
    cost: {
      profiler_calls: 0,
      extraction_calls: 0,
      embedding_calls: 0,
      total_llm_calls: 0,
    },
    timing: {
      parse_ms: 0,
      profile_ms: 0,
      fast_path_ms: 0,
      slow_path_ms: 0,
      post_process_ms: 0,
      total_ms: 0,
    },
  };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Re-export public types
export type {
  DeduplicationResult,
  DocumentProfile,
  IngestInput,
  IngestionDeps,
  IngestionReport,
  InputFormat,
} from './types.js';
