import { describe, expect, it } from 'vitest';
import {
  ParseError,
  parseCausalLinkFromRecord,
  parseCausalNode,
  parseConcept,
  parseCrossLinkRecord,
  parseEntity,
  parseTemporalEvent,
  parseTemporalFact,
  safeNumber,
  safeString,
} from './parsers.js';

// Helper to create a mock FalkorDB node structure
function mockNode(props: Record<string, unknown>) {
  return { properties: props };
}

describe('parseEntity', () => {
  it('should parse a valid entity node', () => {
    const node = mockNode({
      uuid: 'entity-123',
      name: 'Alice',
      entity_type: 'person',
      properties: '{"role": "engineer"}',
      created_at: '2024-01-15T10:00:00.000Z',
    });

    const entity = parseEntity(node);

    expect(entity.uuid).toBe('entity-123');
    expect(entity.name).toBe('Alice');
    expect(entity.entity_type).toBe('person');
    expect(entity.properties).toEqual({ role: 'engineer' });
    expect(entity.created_at).toBeInstanceOf(Date);
  });

  it('should handle empty properties string', () => {
    const node = mockNode({
      uuid: 'entity-456',
      name: 'Bob',
      entity_type: 'person',
      properties: '{}',
      created_at: '2024-01-15T10:00:00.000Z',
    });

    const entity = parseEntity(node);

    expect(entity.properties).toEqual({});
  });

  it('should handle missing properties field with default', () => {
    const node = mockNode({
      uuid: 'entity-789',
      name: 'Charlie',
      entity_type: 'company',
      created_at: '2024-01-15T10:00:00.000Z',
    });

    const entity = parseEntity(node);

    expect(entity.properties).toEqual({});
  });

  it('should handle invalid JSON in properties gracefully', () => {
    const node = mockNode({
      uuid: 'entity-invalid',
      name: 'Test',
      entity_type: 'test',
      properties: 'not valid json',
      created_at: '2024-01-15T10:00:00.000Z',
    });

    const entity = parseEntity(node);

    expect(entity.properties).toEqual({});
  });

  it('should throw ParseError for invalid node structure', () => {
    const invalidNode = { notProperties: {} };

    expect(() => parseEntity(invalidNode)).toThrow(ParseError);
    expect(() => parseEntity(invalidNode)).toThrow(
      'Invalid FalkorDB node structure',
    );
  });

  it('should throw ParseError for missing required fields', () => {
    const node = mockNode({
      uuid: 'entity-123',
      // missing name, entity_type, created_at
    });

    expect(() => parseEntity(node)).toThrow(ParseError);
    expect(() => parseEntity(node)).toThrow('Invalid Entity node');
  });

  it('should throw ParseError for null input', () => {
    expect(() => parseEntity(null)).toThrow(ParseError);
  });

  it('should throw ParseError for undefined input', () => {
    expect(() => parseEntity(undefined)).toThrow(ParseError);
  });

  it('should parse complex nested properties', () => {
    const node = mockNode({
      uuid: 'entity-complex',
      name: 'Acme Corp',
      entity_type: 'company',
      properties: JSON.stringify({
        industry: 'tech',
        employees: 500,
        locations: ['NYC', 'SF'],
        metadata: { founded: 2020 },
      }),
      created_at: '2024-01-15T10:00:00.000Z',
    });

    const entity = parseEntity(node);

    expect(entity.properties).toEqual({
      industry: 'tech',
      employees: 500,
      locations: ['NYC', 'SF'],
      metadata: { founded: 2020 },
    });
  });
});

describe('parseTemporalEvent', () => {
  it('should parse a valid temporal event node', () => {
    const node = mockNode({
      uuid: 'event-123',
      description: 'Deployment completed',
      occurred_at: '2024-01-15T10:00:00.000Z',
    });

    const event = parseTemporalEvent(node);

    expect(event.uuid).toBe('event-123');
    expect(event.description).toBe('Deployment completed');
    expect(event.occurred_at).toBeInstanceOf(Date);
    expect(event.duration).toBeUndefined();
  });

  it('should parse event with duration', () => {
    const node = mockNode({
      uuid: 'event-456',
      description: 'Meeting',
      occurred_at: '2024-01-15T14:00:00.000Z',
      duration: 3600,
    });

    const event = parseTemporalEvent(node);

    expect(event.duration).toBe(3600);
  });

  it('should throw ParseError for invalid node structure', () => {
    const invalidNode = 'not an object';

    expect(() => parseTemporalEvent(invalidNode)).toThrow(ParseError);
  });

  it('should throw ParseError for missing required fields', () => {
    const node = mockNode({
      uuid: 'event-123',
      // missing description and occurred_at
    });

    expect(() => parseTemporalEvent(node)).toThrow(ParseError);
    expect(() => parseTemporalEvent(node)).toThrow(
      'Invalid TemporalEvent node',
    );
  });

  it('should convert occurred_at string to Date', () => {
    const dateString = '2024-06-15T12:30:00.000Z';
    const node = mockNode({
      uuid: 'event-date',
      description: 'Test event',
      occurred_at: dateString,
    });

    const event = parseTemporalEvent(node);

    expect(event.occurred_at.toISOString()).toBe(dateString);
  });
});

describe('parseTemporalFact', () => {
  it('should parse a valid temporal fact node', () => {
    const node = mockNode({
      uuid: 'fact-123',
      subject: 'Alice',
      predicate: 'works_at',
      object: 'Acme Corp',
      valid_from: '2024-01-01T00:00:00.000Z',
    });

    const fact = parseTemporalFact(node);

    expect(fact.uuid).toBe('fact-123');
    expect(fact.subject).toBe('Alice');
    expect(fact.predicate).toBe('works_at');
    expect(fact.object).toBe('Acme Corp');
    expect(fact.valid_from).toBeInstanceOf(Date);
    expect(fact.valid_to).toBeUndefined();
  });

  it('should parse fact with valid_to date', () => {
    const node = mockNode({
      uuid: 'fact-456',
      subject: 'Bob',
      predicate: 'managed',
      object: 'Project X',
      valid_from: '2024-01-01T00:00:00.000Z',
      valid_to: '2024-06-30T23:59:59.000Z',
    });

    const fact = parseTemporalFact(node);

    expect(fact.valid_to).toBeInstanceOf(Date);
    expect(fact.valid_to?.toISOString()).toBe('2024-06-30T23:59:59.000Z');
  });

  it('should throw ParseError for missing required fields', () => {
    const node = mockNode({
      uuid: 'fact-123',
      subject: 'Alice',
      // missing predicate, object, valid_from
    });

    expect(() => parseTemporalFact(node)).toThrow(ParseError);
    expect(() => parseTemporalFact(node)).toThrow('Invalid TemporalFact node');
  });

  it('should throw ParseError for invalid node structure', () => {
    expect(() => parseTemporalFact(null)).toThrow(ParseError);
  });
});

describe('parseCausalNode', () => {
  it('should parse a valid causal node', () => {
    const node = mockNode({
      uuid: 'causal-123',
      description: 'Missing configuration',
      node_type: 'cause',
    });

    const causalNode = parseCausalNode(node);

    expect(causalNode.uuid).toBe('causal-123');
    expect(causalNode.description).toBe('Missing configuration');
    expect(causalNode.node_type).toBe('cause');
  });

  it('should parse effect node type', () => {
    const node = mockNode({
      uuid: 'causal-456',
      description: 'Service crash',
      node_type: 'effect',
    });

    const causalNode = parseCausalNode(node);

    expect(causalNode.node_type).toBe('effect');
  });

  it('should throw ParseError for missing required fields', () => {
    const node = mockNode({
      uuid: 'causal-123',
      // missing description and node_type
    });

    expect(() => parseCausalNode(node)).toThrow(ParseError);
    expect(() => parseCausalNode(node)).toThrow('Invalid CausalNode');
  });

  it('should throw ParseError for invalid node structure', () => {
    expect(() => parseCausalNode(undefined)).toThrow(ParseError);
  });
});

describe('parseConcept', () => {
  it('should parse a valid concept node', () => {
    const node = mockNode({
      uuid: 'concept-123',
      name: 'Machine Learning',
      description: 'A branch of AI',
    });

    const concept = parseConcept(node);

    expect(concept.uuid).toBe('concept-123');
    expect(concept.name).toBe('Machine Learning');
    expect(concept.description).toBe('A branch of AI');
    expect(concept.embedding).toBeUndefined();
  });

  it('should parse concept with embedding', () => {
    const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    const node = mockNode({
      uuid: 'concept-456',
      name: 'Neural Networks',
      description: 'Computing systems inspired by biological neural networks',
      embedding: JSON.stringify(embedding),
    });

    const concept = parseConcept(node);

    expect(concept.embedding).toEqual(embedding);
  });

  it('should handle invalid embedding JSON gracefully', () => {
    const node = mockNode({
      uuid: 'concept-789',
      name: 'Test Concept',
      embedding: 'not valid json',
    });

    const concept = parseConcept(node);

    expect(concept.embedding).toBeUndefined();
  });

  it('should handle missing optional fields', () => {
    const node = mockNode({
      uuid: 'concept-minimal',
      name: 'Minimal Concept',
    });

    const concept = parseConcept(node);

    expect(concept.uuid).toBe('concept-minimal');
    expect(concept.name).toBe('Minimal Concept');
    expect(concept.description).toBeUndefined();
    expect(concept.embedding).toBeUndefined();
  });

  it('should throw ParseError for missing required fields', () => {
    const node = mockNode({
      // missing uuid and name
      description: 'Some description',
    });

    expect(() => parseConcept(node)).toThrow(ParseError);
    expect(() => parseConcept(node)).toThrow('Invalid Concept node');
  });

  it('should throw ParseError for invalid node structure', () => {
    expect(() => parseConcept(null)).toThrow(ParseError);
  });
});

describe('parseCausalLinkFromRecord', () => {
  it('should parse causal link with confidence and evidence', () => {
    const causeNode = mockNode({
      uuid: 'cause-123',
      description: 'Config error',
      node_type: 'cause',
    });
    const effectNode = mockNode({
      uuid: 'effect-456',
      description: 'Service failure',
      node_type: 'effect',
    });
    const record = {
      confidence: 0.95,
      evidence: 'Logs showed missing AUTH_SECRET',
    };

    const link = parseCausalLinkFromRecord(causeNode, effectNode, record);

    expect(link.cause).toBe('Config error');
    expect(link.effect).toBe('Service failure');
    expect(link.confidence).toBe(0.95);
    expect(link.evidence).toBe('Logs showed missing AUTH_SECRET');
  });

  it('should use default confidence when not provided', () => {
    const causeNode = mockNode({
      uuid: 'cause-123',
      description: 'Root cause',
      node_type: 'cause',
    });
    const effectNode = mockNode({
      uuid: 'effect-456',
      description: 'Downstream effect',
      node_type: 'effect',
    });
    const record = {};

    const link = parseCausalLinkFromRecord(causeNode, effectNode, record);

    expect(link.confidence).toBe(1.0);
    expect(link.evidence).toBeUndefined();
  });

  it('should handle null evidence', () => {
    const causeNode = mockNode({
      uuid: 'cause-123',
      description: 'Cause',
      node_type: 'cause',
    });
    const effectNode = mockNode({
      uuid: 'effect-456',
      description: 'Effect',
      node_type: 'effect',
    });
    const record = {
      confidence: 0.8,
      evidence: null,
    };

    const link = parseCausalLinkFromRecord(causeNode, effectNode, record);

    expect(link.evidence).toBeUndefined();
  });

  it('should throw if cause node is invalid', () => {
    const invalidCause = { notProperties: {} };
    const effectNode = mockNode({
      uuid: 'effect-456',
      description: 'Effect',
      node_type: 'effect',
    });

    expect(() =>
      parseCausalLinkFromRecord(invalidCause, effectNode, {}),
    ).toThrow(ParseError);
  });

  it('should throw if effect node is invalid', () => {
    const causeNode = mockNode({
      uuid: 'cause-123',
      description: 'Cause',
      node_type: 'cause',
    });
    const invalidEffect = null;

    expect(() =>
      parseCausalLinkFromRecord(causeNode, invalidEffect, {}),
    ).toThrow(ParseError);
  });
});

describe('parseCrossLinkRecord', () => {
  it('should parse a valid cross-link record', () => {
    const record = {
      sourceId: 'source-123',
      targetId: 'target-456',
      linkType: 'X_REPRESENTS',
      createdAt: '2024-01-15T10:00:00.000Z',
    };

    const link = parseCrossLinkRecord(record);

    expect(link.sourceId).toBe('source-123');
    expect(link.targetId).toBe('target-456');
    expect(link.linkType).toBe('X_REPRESENTS');
    expect(link.createdAt).toBeInstanceOf(Date);
  });

  it('should handle missing createdAt', () => {
    const record = {
      sourceId: 'source-123',
      targetId: 'target-456',
      linkType: 'X_INVOLVES',
    };

    const link = parseCrossLinkRecord(record);

    expect(link.createdAt).toBeUndefined();
  });

  it('should handle null createdAt', () => {
    const record = {
      sourceId: 'source-123',
      targetId: 'target-456',
      linkType: 'X_AFFECTS',
      createdAt: null,
    };

    const link = parseCrossLinkRecord(record);

    expect(link.createdAt).toBeUndefined();
  });

  it('should throw ParseError for missing required fields', () => {
    const record = {
      sourceId: 'source-123',
      // missing targetId and linkType
    };

    expect(() => parseCrossLinkRecord(record)).toThrow(ParseError);
    expect(() => parseCrossLinkRecord(record)).toThrow(
      'Invalid cross-link record',
    );
  });

  it('should parse all link types', () => {
    const linkTypes = [
      'X_REPRESENTS',
      'X_INVOLVES',
      'X_REFERS_TO',
      'X_AFFECTS',
    ];

    for (const linkType of linkTypes) {
      const record = {
        sourceId: 'src',
        targetId: 'tgt',
        linkType,
      };

      const link = parseCrossLinkRecord(record);
      expect(link.linkType).toBe(linkType);
    }
  });
});

describe('safeString', () => {
  it('should return string values as-is', () => {
    expect(safeString('hello')).toBe('hello');
    expect(safeString('')).toBe('');
    expect(safeString('  spaces  ')).toBe('  spaces  ');
  });

  it('should return default for null', () => {
    expect(safeString(null)).toBe('');
    expect(safeString(null, 'default')).toBe('default');
  });

  it('should return default for undefined', () => {
    expect(safeString(undefined)).toBe('');
    expect(safeString(undefined, 'fallback')).toBe('fallback');
  });

  it('should convert numbers to strings', () => {
    expect(safeString(123)).toBe('123');
    expect(safeString(0)).toBe('0');
    expect(safeString(-45.67)).toBe('-45.67');
  });

  it('should convert booleans to strings', () => {
    expect(safeString(true)).toBe('true');
    expect(safeString(false)).toBe('false');
  });

  it('should convert objects to strings', () => {
    expect(safeString({})).toBe('[object Object]');
    expect(safeString([])).toBe('');
  });

  it('should use custom default value', () => {
    expect(safeString(null, 'N/A')).toBe('N/A');
    expect(safeString(undefined, 'unknown')).toBe('unknown');
  });
});

describe('safeNumber', () => {
  it('should return number values as-is', () => {
    expect(safeNumber(123)).toBe(123);
    expect(safeNumber(0)).toBe(0);
    expect(safeNumber(-45.67)).toBe(-45.67);
    expect(safeNumber(1.23456)).toBe(1.23456);
  });

  it('should parse numeric strings', () => {
    expect(safeNumber('123')).toBe(123);
    expect(safeNumber('45.67')).toBe(45.67);
    expect(safeNumber('-100')).toBe(-100);
    expect(safeNumber('0')).toBe(0);
  });

  it('should return default for non-numeric strings', () => {
    expect(safeNumber('hello')).toBe(0);
    expect(safeNumber('hello', 42)).toBe(42);
    expect(safeNumber('abc123')).toBe(0);
  });

  it('should return default for null', () => {
    expect(safeNumber(null)).toBe(0);
    expect(safeNumber(null, -1)).toBe(-1);
  });

  it('should return default for undefined', () => {
    expect(safeNumber(undefined)).toBe(0);
    expect(safeNumber(undefined, 999)).toBe(999);
  });

  it('should return default for objects', () => {
    expect(safeNumber({})).toBe(0);
    expect(safeNumber([])).toBe(0);
    expect(safeNumber({ value: 123 })).toBe(0);
  });

  it('should return default for booleans', () => {
    expect(safeNumber(true)).toBe(0);
    expect(safeNumber(false)).toBe(0);
  });

  it('should handle NaN from string parsing', () => {
    expect(safeNumber('NaN')).toBe(0);
  });

  it('should handle Infinity string (parses as valid number)', () => {
    // 'Infinity' parses to the number Infinity, which is a valid number
    expect(safeNumber('Infinity')).toBe(Number.POSITIVE_INFINITY);
    expect(safeNumber('-Infinity')).toBe(Number.NEGATIVE_INFINITY);
  });

  it('should use custom default value', () => {
    expect(safeNumber('invalid', 42)).toBe(42);
    expect(safeNumber(null, -999)).toBe(-999);
  });
});

describe('ParseError', () => {
  it('should create error with message and nodeType', () => {
    const error = new ParseError('Test error', 'Entity');

    expect(error.message).toBe('Test error');
    expect(error.nodeType).toBe('Entity');
    expect(error.name).toBe('ParseError');
    expect(error.cause).toBeUndefined();
  });

  it('should create error with cause', () => {
    const cause = new Error('Original error');
    const error = new ParseError('Wrapper error', 'Concept', cause);

    expect(error.message).toBe('Wrapper error');
    expect(error.nodeType).toBe('Concept');
    expect(error.cause).toBe(cause);
  });

  it('should be instance of Error', () => {
    const error = new ParseError('Test', 'Test');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ParseError);
  });

  it('should have proper stack trace', () => {
    const error = new ParseError('Test', 'Test');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ParseError');
  });
});
