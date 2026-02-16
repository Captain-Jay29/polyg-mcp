// PDF parser — decode base64, extract text via pdf-parse, delegate to text parser
import type { ParsedChunk } from '../types.js';
import { parseText } from './text.js';

/**
 * Parse a base64-encoded PDF into chunks.
 * Decodes the content, runs pdf-parse to extract text, then delegates
 * to parseText() for paragraph-based chunking.
 * Annotates each chunk with `metadata.extra.total_pages`.
 */
export async function parsePdf(content: string): Promise<ParsedChunk[]> {
  const { PDFParse } = await import('pdf-parse');

  const buffer = Buffer.from(content, 'base64');
  const pdf = new PDFParse({ data: new Uint8Array(buffer) });
  const textResult = await pdf.getText();
  await pdf.destroy();

  if (!textResult.text || textResult.text.trim().length === 0) {
    return [];
  }

  const chunks = parseText(textResult.text);

  // Annotate all chunks with PDF metadata
  for (const chunk of chunks) {
    chunk.metadata.extra = {
      ...chunk.metadata.extra,
      total_pages: textResult.total,
    };
  }

  return chunks;
}
