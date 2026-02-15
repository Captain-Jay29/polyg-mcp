import { describe, expect, it } from 'vitest';
import { parseText } from './text.js';

describe('parseText', () => {
  it('should return empty array for empty string', () => {
    expect(parseText('')).toEqual([]);
  });

  it('should return empty array for whitespace-only', () => {
    expect(parseText('   \n\n   ')).toEqual([]);
  });

  it('should parse a single paragraph into one chunk', () => {
    const chunks = parseText('Hello world. This is a test.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('Hello world. This is a test.');
    expect(chunks[0].chunk_id).toBe('chunk_000');
    expect(chunks[0].position).toBe(0);
    expect(chunks[0].metadata.source_format).toBe('text');
  });

  it('should split on double newlines', () => {
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const chunks = parseText(text);
    // All 3 paragraphs fit within 1600 chars → 1 chunk
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain('First paragraph.');
    expect(chunks[0].content).toContain('Second paragraph.');
    expect(chunks[0].content).toContain('Third paragraph.');
  });

  it('should detect markdown headers and assign section metadata', () => {
    const text =
      '# Introduction\n\nSome intro text.\n\n## Methods\n\nSome method text.';
    const chunks = parseText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].metadata.section).toBe('Introduction');
  });

  it('should detect ALL CAPS headers', () => {
    const text = 'INTRODUCTION\n\nSome text here.\n\nMETHODS\n\nMore text.';
    const chunks = parseText(text);
    expect(chunks[0].metadata.section).toBe('INTRODUCTION');
  });

  it('should not treat short caps strings as headers', () => {
    const text = 'OK\n\nSome text here.';
    const chunks = parseText(text);
    // "OK" is only 2 chars, below the 3-char minimum for caps headers
    expect(chunks[0].metadata.section).toBeUndefined();
  });

  it('should handle chunks without any section headers', () => {
    const text = 'Just a plain paragraph.\n\nAnother paragraph.';
    const chunks = parseText(text);
    expect(chunks[0].metadata.section).toBeUndefined();
  });

  it('should create multiple chunks for long content', () => {
    // Each paragraph ~200 chars, so ~800 chars per 4 paragraphs
    // TARGET_CHARS = 1600, so ~8 paragraphs per chunk
    const paragraphs: string[] = [];
    for (let i = 0; i < 20; i++) {
      paragraphs.push(`Paragraph ${i}: ${'x'.repeat(180)}`);
    }
    const text = paragraphs.join('\n\n');
    const chunks = parseText(text);

    expect(chunks.length).toBeGreaterThan(1);

    // All chunks should have proper IDs and positions
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunk_id).toBe(`chunk_${i.toString().padStart(3, '0')}`);
      expect(chunks[i].position).toBe(i);
      expect(chunks[i].metadata.source_format).toBe('text');
    }
  });

  it('should have 1-paragraph overlap between chunks', () => {
    // Create content that will definitely span multiple chunks
    const paragraphs: string[] = [];
    for (let i = 0; i < 20; i++) {
      paragraphs.push(`Unique paragraph ${i}: ${'y'.repeat(180)}`);
    }
    const text = paragraphs.join('\n\n');
    const chunks = parseText(text);

    if (chunks.length >= 2) {
      // The last paragraph of chunk N should appear in chunk N+1
      const firstChunkParas = chunks[0].content.split('\n\n');
      const secondChunkParas = chunks[1].content.split('\n\n');
      const lastOfFirst = firstChunkParas[firstChunkParas.length - 1];
      const firstOfSecond = secondChunkParas[0];
      expect(firstOfSecond).toBe(lastOfFirst);
    }
  });

  it('should propagate section to subsequent chunks', () => {
    const parts = ['# Chapter One'];
    for (let i = 0; i < 20; i++) {
      parts.push(`Content paragraph ${i}: ${'z'.repeat(180)}`);
    }
    const text = parts.join('\n\n');
    const chunks = parseText(text);

    // All chunks should inherit the "Chapter One" section
    for (const chunk of chunks) {
      expect(chunk.metadata.section).toBe('Chapter One');
    }
  });

  it('should handle multi-section documents', () => {
    const text = [
      '# Section A',
      'Content for section A.',
      '# Section B',
      'Content for section B.',
    ].join('\n\n');

    const chunks = parseText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // First chunk starts with Section A
    expect(chunks[0].metadata.section).toBe('Section A');
  });

  it('should handle triple+ newlines as paragraph separators', () => {
    const text = 'Para 1.\n\n\n\nPara 2.\n\n\n\n\nPara 3.';
    const chunks = parseText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain('Para 1.');
    expect(chunks[0].content).toContain('Para 2.');
    expect(chunks[0].content).toContain('Para 3.');
  });
});
