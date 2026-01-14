import type {
  CausalLink,
  Concept,
  Entity,
  TemporalEvent,
  TemporalFact,
} from '@polyg-mcp/shared';
// Type-safe parsers for FalkorDB node data
import { z } from 'zod';

/**
 * Schema for raw FalkorDB node structure
 */
const FalkorDBNodeSchema = z.object({
  properties: z.record(z.string(), z.unknown()),
});

/**
 * Schema for Entity node properties from FalkorDB
 */
const EntityPropsSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  entity_type: z.string(),
  properties: z.string().optional().default('{}'),
  created_at: z.string(),
});

/**
 * Schema for TemporalEvent node properties from FalkorDB
 */
const TemporalEventPropsSchema = z.object({
  uuid: z.string(),
  description: z.string(),
  occurred_at: z.string(),
  duration: z.number().optional(),
});

/**
 * Schema for TemporalFact node properties from FalkorDB
 */
const TemporalFactPropsSchema = z.object({
  uuid: z.string(),
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  valid_from: z.string(),
  valid_to: z.string().optional(),
});

/**
 * Schema for CausalNode properties from FalkorDB
 */
const CausalNodePropsSchema = z.object({
  uuid: z.string(),
  description: z.string(),
  node_type: z.string(),
});

/**
 * Schema for Concept node properties from FalkorDB
 */
const ConceptPropsSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  description: z.string().optional(),
  embedding: z.string().optional(),
});

/**
 * Error thrown when parsing fails
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly nodeType: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * Extract properties from a FalkorDB node
 */
function extractNodeProps(node: unknown): Record<string, unknown> {
  const parsed = FalkorDBNodeSchema.safeParse(node);
  if (!parsed.success) {
    throw new ParseError(
      'Invalid FalkorDB node structure',
      'unknown',
      new Error(parsed.error.message),
    );
  }
  return parsed.data.properties;
}

/**
 * Safely parse a FalkorDB node into an Entity
 */
export function parseEntity(node: unknown): Entity {
  const props = extractNodeProps(node);
  const parsed = EntityPropsSchema.safeParse(props);

  if (!parsed.success) {
    throw new ParseError(
      `Invalid Entity node: ${parsed.error.message}`,
      'Entity',
      new Error(parsed.error.message),
    );
  }

  let parsedProperties: Record<string, unknown> = {};
  if (parsed.data.properties) {
    try {
      parsedProperties = JSON.parse(parsed.data.properties);
    } catch {
      parsedProperties = {};
    }
  }

  return {
    uuid: parsed.data.uuid,
    name: parsed.data.name,
    entity_type: parsed.data.entity_type,
    properties: parsedProperties,
    created_at: new Date(parsed.data.created_at),
  };
}

/**
 * Safely parse a FalkorDB node into a TemporalEvent
 */
export function parseTemporalEvent(node: unknown): TemporalEvent {
  const props = extractNodeProps(node);
  const parsed = TemporalEventPropsSchema.safeParse(props);

  if (!parsed.success) {
    throw new ParseError(
      `Invalid TemporalEvent node: ${parsed.error.message}`,
      'TemporalEvent',
      new Error(parsed.error.message),
    );
  }

  return {
    uuid: parsed.data.uuid,
    description: parsed.data.description,
    occurred_at: new Date(parsed.data.occurred_at),
    duration: parsed.data.duration,
  };
}

/**
 * Safely parse a FalkorDB node into a TemporalFact
 */
export function parseTemporalFact(node: unknown): TemporalFact {
  const props = extractNodeProps(node);
  const parsed = TemporalFactPropsSchema.safeParse(props);

  if (!parsed.success) {
    throw new ParseError(
      `Invalid TemporalFact node: ${parsed.error.message}`,
      'TemporalFact',
      new Error(parsed.error.message),
    );
  }

  return {
    uuid: parsed.data.uuid,
    subject: parsed.data.subject,
    predicate: parsed.data.predicate,
    object: parsed.data.object,
    valid_from: new Date(parsed.data.valid_from),
    valid_to: parsed.data.valid_to ? new Date(parsed.data.valid_to) : undefined,
  };
}

/**
 * CausalNode type (internal, not in shared schemas)
 */
export interface CausalNode {
  uuid: string;
  description: string;
  node_type: string;
}

/**
 * Safely parse a FalkorDB node into a CausalNode
 */
export function parseCausalNode(node: unknown): CausalNode {
  const props = extractNodeProps(node);
  const parsed = CausalNodePropsSchema.safeParse(props);

  if (!parsed.success) {
    throw new ParseError(
      `Invalid CausalNode: ${parsed.error.message}`,
      'CausalNode',
      new Error(parsed.error.message),
    );
  }

  return {
    uuid: parsed.data.uuid,
    description: parsed.data.description,
    node_type: parsed.data.node_type,
  };
}

/**
 * Safely parse a FalkorDB node into a Concept
 */
export function parseConcept(node: unknown): Concept {
  const props = extractNodeProps(node);
  const parsed = ConceptPropsSchema.safeParse(props);

  if (!parsed.success) {
    throw new ParseError(
      `Invalid Concept node: ${parsed.error.message}`,
      'Concept',
      new Error(parsed.error.message),
    );
  }

  let embedding: number[] | undefined;
  if (parsed.data.embedding) {
    try {
      embedding = JSON.parse(parsed.data.embedding);
    } catch {
      embedding = undefined;
    }
  }

  return {
    uuid: parsed.data.uuid,
    name: parsed.data.name,
    description: parsed.data.description,
    embedding,
  };
}

/**
 * Schema for query result record with relationship data
 */
const _RelationshipRecordSchema = z.object({
  relType: z.string(),
});

/**
 * Schema for causal link record from query
 */
const CausalLinkRecordSchema = z.object({
  confidence: z.number().optional(),
  evidence: z.string().optional().nullable(),
});

/**
 * Parse a causal link from query results
 */
export function parseCausalLinkFromRecord(
  causeNode: unknown,
  effectNode: unknown,
  record: Record<string, unknown>,
): CausalLink {
  const cause = parseCausalNode(causeNode);
  const effect = parseCausalNode(effectNode);
  const linkData = CausalLinkRecordSchema.safeParse(record);

  return {
    cause: cause.description,
    effect: effect.description,
    confidence: linkData.success ? (linkData.data.confidence ?? 1.0) : 1.0,
    evidence: linkData.success
      ? (linkData.data.evidence ?? undefined)
      : undefined,
  };
}

/**
 * Schema for cross-link record
 */
const CrossLinkRecordSchema = z.object({
  sourceId: z.string(),
  targetId: z.string(),
  linkType: z.string(),
  createdAt: z.string().optional().nullable(),
});

/**
 * Parse a cross-link record
 */
export function parseCrossLinkRecord(record: Record<string, unknown>): {
  sourceId: string;
  targetId: string;
  linkType: string;
  createdAt?: Date;
} {
  const parsed = CrossLinkRecordSchema.safeParse(record);

  if (!parsed.success) {
    throw new ParseError(
      `Invalid cross-link record: ${parsed.error.message}`,
      'CrossLink',
      new Error(parsed.error.message),
    );
  }

  return {
    sourceId: parsed.data.sourceId,
    targetId: parsed.data.targetId,
    linkType: parsed.data.linkType,
    createdAt: parsed.data.createdAt
      ? new Date(parsed.data.createdAt)
      : undefined,
  };
}

/**
 * Safe string extraction from record
 */
export function safeString(value: unknown, defaultValue = ''): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return defaultValue;
  return String(value);
}

/**
 * Safe number extraction from record
 */
export function safeNumber(value: unknown, defaultValue = 0): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}
