// Format auto-detection for ingestion parser
import type { InputFormat } from '../types.js';
import { looksLikeConversation } from './conversation.js';

/**
 * Detect the format of raw content.
 *
 * 1. Try JSON.parse:
 *    - If array with speaker/role fields -> 'conversation'
 *    - If array otherwise -> 'structured'
 *    - If object -> 'structured'
 * 2. If not valid JSON -> 'text'
 */
export function detectFormat(content: string): InputFormat {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return 'text';
  }

  // Quick check: does it look like JSON?
  const firstChar = trimmed[0];
  if (firstChar !== '[' && firstChar !== '{') {
    return 'text';
  }

  try {
    const data = JSON.parse(trimmed);

    if (Array.isArray(data)) {
      return looksLikeConversation(data) ? 'conversation' : 'structured';
    }

    if (typeof data === 'object' && data !== null) {
      return 'structured';
    }

    // Primitive JSON values (string, number, boolean, null)
    return 'text';
  } catch {
    return 'text';
  }
}
