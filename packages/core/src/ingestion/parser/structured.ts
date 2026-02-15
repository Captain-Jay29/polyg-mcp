// Structured JSON parser — each record becomes one chunk
import type { ChunkMetadata, ParsedChunk } from '../types.js';

// Max chars per structured chunk content (prevents DoS via large records)
const MAX_RECORD_CHARS = 8000;

const STANDARD_KEYS = new Set([
  'timestamp',
  'speaker',
  'section',
  'turn_index',
]);

/**
 * Parse structured JSON into chunks.
 *
 * Accepts a JSON array of objects or a single object.
 * Each record becomes one chunk with JSON-stringified content.
 */
export function parseStructured(content: string): ParsedChunk[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error('Invalid JSON: content is not valid JSON');
  }

  // Normalize: single object → array
  const records = Array.isArray(data) ? data : [data];

  if (records.length === 0) {
    return [];
  }

  const chunks: ParsedChunk[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (typeof record !== 'object' || record === null) {
      continue; // skip primitives
    }

    const position = chunks.length;
    const { standard, extra } = splitMetadata(
      record as Record<string, unknown>,
    );
    const metadata: ChunkMetadata = {
      source_format: 'structured',
      ...standard,
    };
    if (Object.keys(extra).length > 0) {
      metadata.extra = extra;
    }

    let content = JSON.stringify(record, null, 2);
    if (content.length > MAX_RECORD_CHARS) {
      content = `${content.slice(0, MAX_RECORD_CHARS)}\n... [truncated]`;
    }

    chunks.push({
      chunk_id: `chunk_${position.toString().padStart(3, '0')}`,
      content,
      position,
      metadata,
    });
  }

  return chunks;
}

/**
 * Split flat record fields into standard ChunkMetadata fields and extras.
 * Skips nested objects and arrays to keep metadata flat.
 */
function splitMetadata(record: Record<string, unknown>): {
  standard: Record<string, string | number | undefined>;
  extra: Record<string, unknown>;
} {
  const standard: Record<string, string | number | undefined> = {};
  const extra: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    // Skip keys that conflict with ChunkMetadata fields
    if (key === 'source_format') continue;

    if (typeof value === 'object' || Array.isArray(value) || value === null) {
      // Skip objects, arrays, null — keep metadata flat
      continue;
    }

    if (STANDARD_KEYS.has(key)) {
      standard[key] = value as string | number;
    } else {
      // Coerce booleans to strings for extra metadata
      extra[key] = typeof value === 'boolean' ? String(value) : value;
    }
  }

  return { standard, extra };
}
