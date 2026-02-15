// Structured JSON parser — each record becomes one chunk
import type { ParsedChunk } from '../types.js';

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
    chunks.push({
      chunk_id: `chunk_${position.toString().padStart(3, '0')}`,
      content: JSON.stringify(record, null, 2),
      position,
      metadata: {
        source_format: 'structured',
        ...flattenMetadata(record as Record<string, unknown>),
      },
    });
  }

  return chunks;
}

/**
 * Extract flat string/number/boolean fields from a record for metadata.
 * Skips nested objects and arrays to keep metadata flat.
 */
function flattenMetadata(
  record: Record<string, unknown>,
): Record<string, string | number | undefined> {
  const result: Record<string, string | number | undefined> = {};

  for (const [key, value] of Object.entries(record)) {
    // Skip keys that conflict with ChunkMetadata fields
    if (key === 'source_format') continue;

    if (typeof value === 'string') {
      result[key] = value;
    } else if (typeof value === 'number') {
      result[key] = value;
    }
    // Skip booleans, objects, arrays — keep metadata simple
  }

  return result;
}
