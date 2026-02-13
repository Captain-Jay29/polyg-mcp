import { describe, expect, it } from 'vitest';
import { ChunkExtractionSchema, DocumentProfileSchema } from './types.js';

describe('DocumentProfileSchema', () => {
  const validProfile = {
    document_type: 'conversation',
    domain: 'general',
    entity_types_expected: ['person', 'place'],
    relationship_types_expected: ['knows'],
    causal_patterns: ['decision → action'],
    temporal_structure: 'session_ordered',
    extraction_focus: 'Focus on people.',
    confidence_calibration: {
      explicit_causation: 1.0,
      strong_implication: 0.85,
      weak_inference: 0.65,
    },
  };

  it('should accept a valid profile', () => {
    const result = DocumentProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
  });

  it('should reject invalid temporal_structure', () => {
    const result = DocumentProfileSchema.safeParse({
      ...validProfile,
      temporal_structure: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('should reject confidence values out of range', () => {
    const result = DocumentProfileSchema.safeParse({
      ...validProfile,
      confidence_calibration: {
        explicit_causation: 1.5,
        strong_implication: 0.85,
        weak_inference: 0.65,
      },
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing required fields', () => {
    const { domain: _, ...incomplete } = validProfile;
    const result = DocumentProfileSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('should accept empty arrays for expected types', () => {
    const result = DocumentProfileSchema.safeParse({
      ...validProfile,
      entity_types_expected: [],
      relationship_types_expected: [],
      causal_patterns: [],
    });
    expect(result.success).toBe(true);
  });
});

describe('ChunkExtractionSchema', () => {
  const validExtraction = {
    entities: [
      { name: 'Alice', entity_type: 'person' },
      {
        name: 'Acme Corp',
        entity_type: 'organization',
        properties: { industry: 'tech' },
      },
    ],
    relationships: [
      { source: 'Alice', target: 'Acme Corp', relationship_type: 'works_at' },
    ],
    causal_links: [
      {
        cause: 'Alice joined Acme',
        effect: 'Team grew',
        confidence: 0.9,
        evidence: 'Mentioned in conversation',
        entities: ['Alice'],
      },
    ],
    facts: [
      {
        subject: 'Alice',
        predicate: 'works_at',
        object: 'Acme Corp',
        valid_from: '2024-01-01T00:00:00Z',
        subject_entity: 'Alice',
      },
    ],
  };

  it('should accept a valid extraction', () => {
    const result = ChunkExtractionSchema.safeParse(validExtraction);
    expect(result.success).toBe(true);
  });

  it('should accept minimal extraction (empty arrays)', () => {
    const result = ChunkExtractionSchema.safeParse({
      entities: [],
      relationships: [],
      causal_links: [],
      facts: [],
    });
    expect(result.success).toBe(true);
  });

  it('should reject confidence > 1', () => {
    const result = ChunkExtractionSchema.safeParse({
      ...validExtraction,
      causal_links: [{ cause: 'A', effect: 'B', confidence: 1.5 }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject confidence < 0', () => {
    const result = ChunkExtractionSchema.safeParse({
      ...validExtraction,
      causal_links: [{ cause: 'A', effect: 'B', confidence: -0.1 }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing entity name', () => {
    const result = ChunkExtractionSchema.safeParse({
      ...validExtraction,
      entities: [{ entity_type: 'person' }],
    });
    expect(result.success).toBe(false);
  });

  it('should allow optional fields to be omitted', () => {
    const result = ChunkExtractionSchema.safeParse({
      entities: [{ name: 'Bob', entity_type: 'person' }],
      relationships: [],
      causal_links: [{ cause: 'A', effect: 'B', confidence: 0.8 }],
      facts: [
        {
          subject: 'Bob',
          predicate: 'likes',
          object: 'pizza',
          valid_from: '2024-06-01',
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
