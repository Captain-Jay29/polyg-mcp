import { describe, expect, it } from 'vitest';
import { detectFormat } from './detect.js';

describe('detectFormat', () => {
  describe('conversation detection', () => {
    it('should detect LoCoMo conversation format', () => {
      const content = JSON.stringify([
        { speaker: 'Alice', text: 'Hello' },
        { speaker: 'Bob', text: 'Hi there' },
      ]);
      expect(detectFormat(content)).toBe('conversation');
    });

    it('should detect generic chat format', () => {
      const content = JSON.stringify([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]);
      expect(detectFormat(content)).toBe('conversation');
    });
  });

  describe('structured detection', () => {
    it('should detect array of objects without speaker/role as structured', () => {
      const content = JSON.stringify([
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ]);
      expect(detectFormat(content)).toBe('structured');
    });

    it('should detect single JSON object as structured', () => {
      const content = JSON.stringify({ key: 'value', nested: { a: 1 } });
      expect(detectFormat(content)).toBe('structured');
    });

    it('should detect empty JSON array as structured', () => {
      expect(detectFormat('[]')).toBe('structured');
    });
  });

  describe('text detection', () => {
    it('should detect plain text', () => {
      expect(detectFormat('This is a plain text document.')).toBe('text');
    });

    it('should detect empty string as text', () => {
      expect(detectFormat('')).toBe('text');
    });

    it('should detect whitespace-only as text', () => {
      expect(detectFormat('   \n\t  ')).toBe('text');
    });

    it('should detect invalid JSON starting with [ as text', () => {
      expect(detectFormat('[not valid json')).toBe('text');
    });

    it('should detect invalid JSON starting with { as text', () => {
      expect(detectFormat('{bad json}')).toBe('text');
    });

    it('should detect markdown as text', () => {
      const md = '# Heading\n\nSome paragraph text.\n\n## Another section';
      expect(detectFormat(md)).toBe('text');
    });

    it('should detect primitive JSON values as text', () => {
      // A bare JSON string/number is not useful as structured data
      expect(detectFormat('"just a string"')).toBe('text');
    });
  });

  describe('edge cases', () => {
    it('should handle JSON with leading whitespace', () => {
      const content = `  \n  ${JSON.stringify([{ speaker: 'A', text: 'B' }])}`;
      expect(detectFormat(content)).toBe('conversation');
    });

    it('should handle large arrays by sampling', () => {
      // Even with 1000 items, detection should be fast (samples first few)
      const content = JSON.stringify(
        Array.from({ length: 1000 }, (_, i) => ({
          speaker: `User${i}`,
          text: `Message ${i}`,
        })),
      );
      expect(detectFormat(content)).toBe('conversation');
    });
  });
});
