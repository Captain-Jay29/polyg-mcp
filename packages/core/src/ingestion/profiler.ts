// LLM document profiler — analyzes document samples to produce a DocumentProfile
import type { LLMProvider } from '@polyg-mcp/shared';
import { getDefaultProfile } from './profiles.js';
import type { DocumentProfile, ParsedChunk } from './types.js';
import { DocumentProfileSchema } from './types.js';

// ~2000 tokens at ~4 chars/token
const SAMPLE_CHARS = 8000;
const SAMPLE_CHUNKS = 5;

export interface ProfilerOptions {
  cache?: Map<string, DocumentProfile>;
}

/**
 * Profile a document using LLM analysis.
 *
 * Takes a sample of chunks, asks the LLM to classify the document and
 * determine extraction parameters. Results are cached by document_type.
 * Falls back to default profiles on any failure.
 */
export async function profileDocument(
  chunks: ParsedChunk[],
  llm: LLMProvider,
  options?: ProfilerOptions,
): Promise<DocumentProfile> {
  const cache = options?.cache;
  const sourceFormat = chunks[0]?.metadata.source_format ?? 'text';

  try {
    const prompt = buildProfilerPrompt(chunks);
    const raw = await llm.complete({ prompt, responseFormat: 'json' });
    const profile = DocumentProfileSchema.parse(JSON.parse(raw));

    // Cache by document_type
    if (cache) {
      cache.set(profile.document_type, profile);
    }

    return profile;
  } catch {
    // Check cache for a previously profiled result
    if (cache && cache.size > 0) {
      // Return any cached profile — better than a generic default
      const first = cache.values().next();
      if (!first.done) {
        return first.value;
      }
    }

    return getDefaultProfile(sourceFormat);
  }
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
