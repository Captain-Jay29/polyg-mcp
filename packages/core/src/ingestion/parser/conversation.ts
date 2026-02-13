// Conversation JSON parser — LoCoMo + generic chat formats
import type { ParsedChunk } from '../types.js';

/**
 * Parse a conversation JSON string into chunks.
 *
 * Supports:
 * - LoCoMo format: { speaker, text, timestamp?, turn_id? }
 * - Generic chat: { role, content, timestamp? }
 */
export function parseConversation(content: string): ParsedChunk[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error('Invalid JSON: content is not valid JSON');
  }

  if (!Array.isArray(data)) {
    throw new Error(
      'Invalid conversation format: expected a JSON array of turns',
    );
  }

  if (data.length === 0) {
    return [];
  }

  const chunks: ParsedChunk[] = [];

  for (let i = 0; i < data.length; i++) {
    const turn = data[i];
    if (typeof turn !== 'object' || turn === null) {
      continue; // skip non-object entries
    }

    const record = turn as Record<string, unknown>;

    // Extract speaker: try 'speaker' first (LoCoMo), then 'role' (generic)
    const speaker =
      extractString(record, 'speaker') ?? extractString(record, 'role');

    // Extract content: try 'text' first (LoCoMo), then 'content', then 'message'
    const text =
      extractString(record, 'text') ??
      extractString(record, 'content') ??
      extractString(record, 'message');

    if (!text) {
      continue; // skip turns with no content
    }

    // Extract optional timestamp
    const timestamp =
      extractString(record, 'timestamp') ??
      extractString(record, 'date_time') ??
      extractString(record, 'created_at');

    // Extract optional turn_id
    const turnId =
      extractNumber(record, 'turn_id') ??
      extractNumber(record, 'turn_index') ??
      i;

    const position = chunks.length;
    chunks.push({
      chunk_id: `chunk_${position.toString().padStart(3, '0')}`,
      content: speaker ? `${speaker}: ${text}` : text,
      position,
      metadata: {
        source_format: 'conversation',
        ...(timestamp && { timestamp }),
        ...(speaker && { speaker }),
        turn_index: turnId,
      },
    });
  }

  return chunks;
}

/**
 * Detect whether parsed JSON looks like a conversation.
 * Returns true if it's an array of objects with speaker/role fields.
 */
export function looksLikeConversation(data: unknown): boolean {
  if (!Array.isArray(data) || data.length === 0) {
    return false;
  }

  // Check first few items for speaker/role fields
  const sample = data.slice(0, Math.min(5, data.length));
  let hits = 0;

  for (const item of sample) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    if ('speaker' in record || 'role' in record) {
      hits++;
    }
  }

  // Majority of sampled items should have speaker/role
  return hits > sample.length / 2;
}

function extractString(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const val = obj[key];
  return typeof val === 'string' && val.length > 0 ? val : undefined;
}

function extractNumber(
  obj: Record<string, unknown>,
  key: string,
): number | undefined {
  const val = obj[key];
  return typeof val === 'number' ? val : undefined;
}
