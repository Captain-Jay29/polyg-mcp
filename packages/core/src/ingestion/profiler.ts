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
    const prompt = buildProfilerPrompt(chunks);
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

function buildProfilerPrompt(chunks: ParsedChunk[]): string {
  // Concatenate content for a broad sample
  const allContent = chunks.map((c) => c.content).join('\n');
  const sampleText = allContent.slice(0, SAMPLE_CHARS);

  // First N chunks as structured examples
  const sampleChunks = chunks.slice(0, SAMPLE_CHUNKS);
  const chunkSamples = sampleChunks
    .map((c, i) => `Chunk ${i + 1}:\n${c.content}`)
    .join('\n\n');

  const system = [
    'You are a document analyst. Given a sample of a document, determine its type,',
    'domain, and the kinds of knowledge that can be extracted from it.',
    'Return a JSON object with exactly these fields:',
    '{',
    '  "document_type": string,          // e.g. "conversation", "technical_doc", "report", "log"',
    '  "domain": string,                 // e.g. "general", "medical", "engineering", "legal"',
    '  "entity_types_expected": string[], // e.g. ["person", "organization", "place"]',
    '  "relationship_types_expected": string[], // e.g. ["knows", "works_at"]',
    '  "causal_patterns": string[],      // e.g. ["decision → action", "event → reaction"]',
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

  const user = [
    'Here is a sample from the document:',
    '',
    sampleText,
    '',
    `First ${sampleChunks.length} chunks:`,
    '',
    chunkSamples,
  ].join('\n');

  return `${system}\n\n${user}`;
}
