// Plain text parser — paragraph-based chunking with section detection
import type { ParsedChunk } from '../types.js';

// ~400 tokens at ~4 chars/token
const TARGET_CHARS = 1600;

/**
 * Parse plain text into chunks.
 *
 * 1. Split on double newlines → paragraphs
 * 2. Detect section headers (# lines, ALL CAPS lines)
 * 3. Sliding window: ~400 tokens per chunk, 1-paragraph overlap
 * 4. Assign section metadata from nearest preceding header
 */
export function parseText(content: string): ParsedChunk[] {
  const paragraphs = splitParagraphs(content);
  if (paragraphs.length === 0) {
    return [];
  }

  // Tag each paragraph with its section header (if any)
  const tagged = tagSections(paragraphs);

  // Build chunks via sliding window
  const chunks: ParsedChunk[] = [];
  let start = 0;

  while (start < tagged.length) {
    let end = start;
    let charCount = 0;

    // Accumulate paragraphs until we hit the target
    while (end < tagged.length && charCount < TARGET_CHARS) {
      charCount += tagged[end].text.length;
      end++;
    }

    // Build chunk content from paragraphs [start, end)
    const slicedParagraphs = tagged.slice(start, end);
    const chunkContent = slicedParagraphs.map((p) => p.text).join('\n\n');

    // Section = nearest preceding header for this window
    const section = resolveSection(tagged, start);

    const position = chunks.length;
    chunks.push({
      chunk_id: `chunk_${position.toString().padStart(3, '0')}`,
      content: chunkContent,
      position,
      metadata: {
        source_format: 'text',
        ...(section && { section }),
      },
    });

    // Advance with 1-paragraph overlap (unless we consumed everything)
    if (end >= tagged.length) {
      break;
    }
    start = Math.max(start + 1, end - 1);
  }

  return chunks;
}

// --- Internals ---

interface TaggedParagraph {
  text: string;
  section?: string; // set if this paragraph IS a header
}

/**
 * Split content on double newlines into non-empty paragraphs.
 */
function splitParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Detect section headers and tag paragraphs.
 * A header is: a line starting with # (markdown), or an ALL-CAPS line (≥3 chars).
 */
function tagSections(paragraphs: string[]): TaggedParagraph[] {
  return paragraphs.map((text) => {
    const headerMatch = detectHeader(text);
    if (headerMatch) {
      return { text, section: headerMatch };
    }
    return { text };
  });
}

function detectHeader(text: string): string | undefined {
  // Check first line only (a paragraph could have multiple lines)
  const firstLine = text.split('\n')[0].trim();

  // Markdown header: starts with one or more #
  if (/^#{1,6}\s+/.test(firstLine)) {
    return firstLine.replace(/^#+\s+/, '').trim();
  }

  // ALL CAPS line: at least 3 chars, no lowercase letters, allows spaces/punctuation
  if (
    firstLine.length >= 3 &&
    /^[^a-z]*$/.test(firstLine) &&
    /[A-Z]/.test(firstLine)
  ) {
    return firstLine;
  }

  return undefined;
}

/**
 * Find the nearest section header at or before `index`.
 */
function resolveSection(
  tagged: TaggedParagraph[],
  index: number,
): string | undefined {
  for (let i = index; i >= 0; i--) {
    if (tagged[i].section) {
      return tagged[i].section;
    }
  }
  return undefined;
}
