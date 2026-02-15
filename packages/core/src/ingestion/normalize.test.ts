import { describe, expect, it } from 'vitest';
import {
  normalizeEntityType,
  normalizeExtraction,
  stripJsonFences,
} from './normalize.js';
import type { ChunkExtraction } from './types.js';

describe('normalizeEntityType', () => {
  it('should map person synonyms', () => {
    expect(normalizeEntityType('individual')).toBe('person');
    expect(normalizeEntityType('human')).toBe('person');
    expect(normalizeEntityType('character')).toBe('person');
    expect(normalizeEntityType('participant')).toBe('person');
    expect(normalizeEntityType('speaker')).toBe('person');
  });

  it('should map organization synonyms', () => {
    expect(normalizeEntityType('company')).toBe('organization');
    expect(normalizeEntityType('firm')).toBe('organization');
    expect(normalizeEntityType('corporation')).toBe('organization');
    expect(normalizeEntityType('institution')).toBe('organization');
    expect(normalizeEntityType('agency')).toBe('organization');
  });

  it('should map location synonyms', () => {
    expect(normalizeEntityType('place')).toBe('location');
    expect(normalizeEntityType('city')).toBe('location');
    expect(normalizeEntityType('country')).toBe('location');
    expect(normalizeEntityType('region')).toBe('location');
    expect(normalizeEntityType('venue')).toBe('location');
  });

  it('should map event synonyms', () => {
    expect(normalizeEntityType('incident')).toBe('event');
    expect(normalizeEntityType('occurrence')).toBe('event');
    expect(normalizeEntityType('activity')).toBe('event');
  });

  it('should map concept synonyms', () => {
    expect(normalizeEntityType('idea')).toBe('concept');
    expect(normalizeEntityType('theme')).toBe('concept');
    expect(normalizeEntityType('subject')).toBe('concept');
  });

  it('should be case insensitive', () => {
    expect(normalizeEntityType('COMPANY')).toBe('organization');
    expect(normalizeEntityType('Human')).toBe('person');
    expect(normalizeEntityType('PLACE')).toBe('location');
  });

  it('should trim whitespace', () => {
    expect(normalizeEntityType('  company  ')).toBe('organization');
    expect(normalizeEntityType(' person ')).toBe('person');
  });

  it('should pass through unknown types', () => {
    expect(normalizeEntityType('product')).toBe('product');
    expect(normalizeEntityType('metric')).toBe('metric');
    expect(normalizeEntityType('custom_type')).toBe('custom_type');
  });

  it('should pass through already-canonical types', () => {
    expect(normalizeEntityType('person')).toBe('person');
    expect(normalizeEntityType('organization')).toBe('organization');
    expect(normalizeEntityType('location')).toBe('location');
    expect(normalizeEntityType('event')).toBe('event');
    expect(normalizeEntityType('concept')).toBe('concept');
  });
});

describe('normalizeExtraction', () => {
  it('should normalize entity types in extraction', () => {
    const extraction: ChunkExtraction = {
      entities: [
        { name: 'Alice', entity_type: 'Individual' },
        { name: 'Acme', entity_type: 'Company' },
        { name: 'Paris', entity_type: 'City' },
      ],
      relationships: [
        { source: 'Alice', target: 'Acme', relationship_type: 'works_at' },
      ],
      causal_links: [],
      facts: [],
    };

    const result = normalizeExtraction(extraction);

    expect(result.entities[0].entity_type).toBe('person');
    expect(result.entities[1].entity_type).toBe('organization');
    expect(result.entities[2].entity_type).toBe('location');
    // Should return the same object (mutated in place)
    expect(result).toBe(extraction);
  });

  it('should handle empty extraction', () => {
    const extraction: ChunkExtraction = {
      entities: [],
      relationships: [],
      causal_links: [],
      facts: [],
    };

    const result = normalizeExtraction(extraction);

    expect(result.entities).toEqual([]);
    expect(result).toBe(extraction);
  });

  it('should preserve unknown entity types', () => {
    const extraction: ChunkExtraction = {
      entities: [{ name: 'Widget', entity_type: 'product' }],
      relationships: [],
      causal_links: [],
      facts: [],
    };

    normalizeExtraction(extraction);

    expect(extraction.entities[0].entity_type).toBe('product');
  });
});

describe('stripJsonFences', () => {
  it('should return bare JSON unchanged', () => {
    const json = '{"key": "value"}';
    expect(stripJsonFences(json)).toBe('{"key": "value"}');
  });

  it('should strip ```json fences', () => {
    const fenced = '```json\n{"key": "value"}\n```';
    expect(stripJsonFences(fenced)).toBe('{"key": "value"}');
  });

  it('should strip bare ``` fences', () => {
    const fenced = '```\n{"key": "value"}\n```';
    expect(stripJsonFences(fenced)).toBe('{"key": "value"}');
  });

  it('should handle leading/trailing whitespace', () => {
    const fenced = '  ```json\n{"key": "value"}\n```  ';
    expect(stripJsonFences(fenced)).toBe('{"key": "value"}');
  });

  it('should handle multiline JSON inside fences', () => {
    const fenced = '```json\n{\n  "entities": [],\n  "facts": []\n}\n```';
    expect(stripJsonFences(fenced)).toBe(
      '{\n  "entities": [],\n  "facts": []\n}',
    );
  });

  it('should not strip fences from mid-content backticks', () => {
    const json = '{"code": "use ```bash``` for shell"}';
    expect(stripJsonFences(json)).toBe(json);
  });
});
