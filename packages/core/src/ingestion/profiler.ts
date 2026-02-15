// LLM document profiler — analyzes document samples to produce a DocumentProfile
// Maintains an internal content-hash cache to avoid redundant LLM calls.
import { createHash } from 'node:crypto';
import type { LLMProvider } from '@polyg-mcp/shared';
import { getDefaultProfile } from './profiles.js';
import type { DocumentProfile, ParsedChunk } from './types.js';
import { DocumentProfileSchema } from './types.js';

// ~2000 tokens at ~4 chars/token
const SAMPLE_CHARS = 8000;
const SAMPLE_CHUNKS = 5;
const MAX_CACHE_SIZE = 100;

// Module-level cache: content hash → DocumentProfile
const profileCache = new Map<string, DocumentProfile>();

export interface ProfileResult {
  profile: DocumentProfile;
  cached: boolean;
}

/**
 * Profile a document using LLM analysis.
 *
 * Computes a SHA-256 hash of the content sample and checks the internal cache.
 * On cache hit, returns the cached profile without calling the LLM.
 * On miss, calls the LLM, validates the response, and caches successful results.
 * Falls back to default profiles on any failure (fallbacks are NOT cached).
 */
export async function profileDocument(
  chunks: ParsedChunk[],
  llm: LLMProvider,
): Promise<ProfileResult> {
  const sourceFormat = chunks[0]?.metadata.source_format ?? 'text';
  const hash = hashSample(chunks);

  // Cache hit — skip LLM
  const cached = profileCache.get(hash);
  if (cached) {
    return { profile: cached, cached: true };
  }

  // Cache miss — call LLM
  try {
    const prompt = buildProfilerPrompt(chunks, sourceFormat);
    const raw = await llm.complete({ prompt, responseFormat: 'json' });
    const profile = DocumentProfileSchema.parse(JSON.parse(raw));

    // Store in cache (evict oldest if full)
    if (profileCache.size >= MAX_CACHE_SIZE) {
      const oldest = profileCache.keys().next().value;
      if (oldest !== undefined) {
        profileCache.delete(oldest);
      }
    }
    profileCache.set(hash, profile);

    return { profile, cached: false };
  } catch {
    // Do NOT cache fallback — preserves retry on transient LLM errors
    return { profile: getDefaultProfile(sourceFormat), cached: false };
  }
}

/**
 * Clear the internal profile cache.
 * Exported for testing — ensures test isolation.
 */
export function clearProfileCache(): void {
  profileCache.clear();
}

/**
 * Get the current cache size. Exported for testing.
 */
export function getProfileCacheSize(): number {
  return profileCache.size;
}

// --- Internals ---

function hashSample(chunks: ParsedChunk[]): string {
  const sample = chunks
    .map((c) => c.content)
    .join('\n')
    .slice(0, SAMPLE_CHARS);
  return createHash('sha256').update(sample).digest('hex');
}

function buildProfilerPrompt(chunks: ParsedChunk[], sourceFormat: string): string {
  // First N chunks as labeled examples (primary signal)
  const sampleChunks = chunks.slice(0, SAMPLE_CHUNKS);
  const chunkSamples = sampleChunks
    .map((c, i) => `Chunk ${i + 1}:\n${c.content}`)
    .join('\n\n');

  // Additional content beyond the first N chunks for broader coverage
  const remainingChunks = chunks.slice(SAMPLE_CHUNKS);
  let additionalSample = '';
  if (remainingChunks.length > 0) {
    additionalSample = remainingChunks
      .map((c) => c.content)
      .join('\n')
      .slice(0, SAMPLE_CHARS);
  }

  const system = [
    'You are a document analyst. Given a sample of a document, determine its type,',
    'domain, and the kinds of knowledge that can be extracted from it.',
    'Return a JSON object with exactly these fields:',
    '{',
    '  "document_type": string,          // e.g. "conversation", "technical_doc", "report", "log"',
    '  "domain": string,                 // e.g. "general", "medical", "engineering", "legal"',
    '  "entity_types_expected": string[], // Types of entities found in the document (be domain-specific)',
    '  "relationship_types_expected": string[], // Types of relationships between entities (be domain-specific)',
    '  "causal_patterns": string[],      // Cause-effect patterns present in the document',
    '  "temporal_structure": "explicit_timestamps" | "session_ordered" | "implicit",',
    '  "extraction_focus": string,       // human-readable guidance for extraction',
    '  "confidence_calibration": {',
    '    "explicit_causation": number,   // 0.0-1.0, for directly stated causation',
    '    "strong_implication": number,   // 0.0-1.0, for clearly implied causation',
    '    "weak_inference": number        // 0.0-1.0, for loosely suggested causation',
    '  }',
    '}',
    '',
    'Output ONLY valid JSON. Be specific to the document content.',
  ].join('\n');

  const userParts = [
    `Detected document format: ${sourceFormat}`,
    '',
    `First ${sampleChunks.length} chunks from the document:`,
    '',
    chunkSamples,
  ];

  if (additionalSample) {
    userParts.push(
      '',
      'Additional content from later in the document:',
      '',
      additionalSample,
    );
  }

  return `${system}\n\n${userParts.join('\n')}`;
}
