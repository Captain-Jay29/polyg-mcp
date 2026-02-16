import { describe, expect, it, vi } from 'vitest';

// Mock pdf-parse v2 API: PDFParse class with getText() and destroy()
vi.mock('pdf-parse', () => {
  const mockGetText = vi.fn();
  const mockDestroy = vi.fn().mockResolvedValue(undefined);

  return {
    PDFParse: vi.fn().mockImplementation(() => ({
      getText: mockGetText,
      destroy: mockDestroy,
    })),
    __mockGetText: mockGetText,
    __mockDestroy: mockDestroy,
  };
});

import { parsePdf } from './pdf.js';

async function getMockGetText() {
  const mod = (await import('pdf-parse')) as unknown as {
    __mockGetText: ReturnType<typeof vi.fn>;
  };
  return mod.__mockGetText;
}

describe('parsePdf', () => {
  it('should parse PDF content into chunks', async () => {
    const mockGetText = await getMockGetText();
    mockGetText.mockResolvedValue({
      text: 'Hello world. This is a test document with enough content to create chunks.',
      total: 3,
      pages: [],
    });

    const chunks = await parsePdf(
      Buffer.from('fake-pdf-bytes').toString('base64'),
    );

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].metadata.source_format).toBe('text');
    expect(chunks[0].metadata.extra?.total_pages).toBe(3);
  });

  it('should return empty array for empty PDF', async () => {
    const mockGetText = await getMockGetText();
    mockGetText.mockResolvedValue({
      text: '',
      total: 0,
      pages: [],
    });

    const chunks = await parsePdf(
      Buffer.from('fake-pdf-bytes').toString('base64'),
    );

    expect(chunks).toEqual([]);
  });

  it('should annotate all chunks with total_pages', async () => {
    const mockGetText = await getMockGetText();
    // Generate enough text for multiple chunks (TARGET_CHARS = 1600)
    const longText = Array.from(
      { length: 50 },
      (_, i) => `Paragraph ${i}. ${'Lorem ipsum dolor sit amet. '.repeat(20)}`,
    ).join('\n\n');

    mockGetText.mockResolvedValue({
      text: longText,
      total: 12,
      pages: [],
    });

    const chunks = await parsePdf(
      Buffer.from('fake-pdf-bytes').toString('base64'),
    );

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.metadata.extra?.total_pages).toBe(12);
    }
  });
});
