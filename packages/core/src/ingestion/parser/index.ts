// Parser router — dispatches to format-specific parsers
import type { InputFormat, ParsedChunk } from '../types.js';
import { parseConversation } from './conversation.js';
import { detectFormat } from './detect.js';

/**
 * Parse raw content into chunks.
 *
 * If format is 'auto' or omitted, auto-detects the format.
 * Dispatches to the appropriate parser.
 */
export function parse(content: string, format?: InputFormat): ParsedChunk[] {
  const resolved =
    format === 'auto' || !format ? detectFormat(content) : format;

  switch (resolved) {
    case 'conversation':
      return parseConversation(content);
    case 'text':
      throw new Error(
        'Not implemented: text parser (Phase 2). Use format "conversation" or provide structured JSON.',
      );
    case 'structured':
      throw new Error(
        'Not implemented: structured parser (Phase 2). Use format "conversation" or provide plain text.',
      );
    default:
      throw new Error(`Unknown format: ${resolved as string}`);
  }
}

export { parseConversation } from './conversation.js';
export { detectFormat } from './detect.js';
