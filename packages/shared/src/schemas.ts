// Zod schemas for MCP tool validation
import { z } from 'zod';

// High-level tools
export const RecallInputSchema = z.object({
  query: z.string().describe('Natural language query'),
  include_reasoning: z
    .boolean()
    .optional()
    .describe('Return structured reasoning'),
  max_results: z.number().optional().describe('Maximum results to return'),
});

export const RememberInputSchema = z.object({
  content: z.string().describe('What to remember'),
  context: z.string().optional().describe('Optional context'),
});

// Entity tools
export const GetEntitySchema = z.object({
  name: z.string().describe('Entity name'),
  include_relationships: z
    .boolean()
    .optional()
    .describe('Include relationships'),
});

export const AddEntitySchema = z.object({
  name: z.string().describe('Entity name'),
  entity_type: z.string().describe('Entity type'),
  properties: z.record(z.unknown()).optional().describe('Entity properties'),
});

export const LinkEntitiesSchema = z.object({
  source: z.string().describe('Source entity name or UUID'),
  target: z.string().describe('Target entity name or UUID'),
  relationship: z.string().describe('Relationship type'),
});

// Temporal tools
export const QueryTimelineSchema = z.object({
  from: z.string().describe('Start date (ISO format)'),
  to: z.string().describe('End date (ISO format)'),
  entity: z.string().optional().describe('Filter by entity'),
});

export const AddEventSchema = z.object({
  description: z.string().describe('Event description'),
  occurred_at: z.string().describe('When it occurred (ISO format)'),
});

export const AddFactSchema = z.object({
  subject: z.string().describe('Fact subject'),
  predicate: z.string().describe('Fact predicate'),
  object: z.string().describe('Fact object'),
  valid_from: z.string().describe('Valid from (ISO format)'),
  valid_to: z.string().optional().describe('Valid until (ISO format)'),
});

// Causal tools
export const GetCausalChainSchema = z.object({
  event: z.string().describe('Event to trace'),
  direction: z.enum(['upstream', 'downstream']).describe('Trace direction'),
});

export const AddCausalLinkSchema = z.object({
  cause: z.string().describe('Cause description or UUID'),
  effect: z.string().describe('Effect description or UUID'),
  confidence: z.number().min(0).max(1).optional().describe('Confidence score'),
});

export const ExplainWhySchema = z.object({
  event: z.string().describe('Event to explain'),
});

// Semantic tools
export const SearchSemanticSchema = z.object({
  query: z.string().describe('Search query'),
  limit: z.number().optional().describe('Max results'),
});

export const AddConceptSchema = z.object({
  name: z.string().describe('Concept name'),
  description: z.string().optional().describe('Concept description'),
});

// Management tools
export const ClearGraphSchema = z.object({
  graph: z
    .enum(['semantic', 'temporal', 'causal', 'entity', 'all'])
    .describe('Graph to clear'),
});

export const ExportGraphSchema = z.object({
  format: z.enum(['cypher', 'json']).describe('Export format'),
});

export const GetStatisticsSchema = z.object({});

// ============================================================================
// LLM Output Schemas - for validating LLM responses
// ============================================================================

// Intent types
export const IntentTypeSchema = z.enum([
  'semantic',
  'temporal',
  'causal',
  'entity',
]);

// Entity mention from classifier
export const EntityMentionSchema = z.object({
  mention: z.string(),
  type: z.string().optional(),
  resolved: z.string().optional(),
});

// Timeframe from classifier
export const TimeframeSchema = z.object({
  type: z.enum(['specific', 'range', 'relative']),
  value: z.string(),
  end: z.string().optional(),
});

// Classifier output schema
export const ClassifierOutputSchema = z.object({
  intents: z.array(IntentTypeSchema),
  entities: z.array(EntityMentionSchema),
  timeframe: TimeframeSchema.optional(),
  causal_direction: z.enum(['upstream', 'downstream', 'both']).optional(),
  semantic_query: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

// Causal link for synthesizer reasoning
export const CausalLinkSchema = z.object({
  cause: z.string(),
  effect: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.string().optional(),
});

// Temporal event
export const TemporalEventSchema = z.object({
  uuid: z.string(),
  description: z.string(),
  occurred_at: z.coerce.date(),
  duration: z.number().optional(),
});

// Temporal fact
export const TemporalFactSchema = z.object({
  uuid: z.string(),
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  valid_from: z.coerce.date(),
  valid_to: z.coerce.date().optional(),
});

// Temporal context
export const TemporalContextSchema = z.object({
  events: z.array(TemporalEventSchema).optional(),
  facts: z.array(TemporalFactSchema).optional(),
});

// Entity
export const EntitySchema = z.object({
  uuid: z.string(),
  name: z.string(),
  entity_type: z.string(),
  properties: z.record(z.unknown()).optional(),
  created_at: z.coerce.date(),
});

// Concept
export const ConceptSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  description: z.string().optional(),
  embedding: z.array(z.number()).optional(),
});

// Semantic match
export const SemanticMatchSchema = z.object({
  concept: ConceptSchema,
  score: z.number().min(0).max(1),
});

// Synthesizer reasoning
export const SynthesizerReasoningSchema = z.object({
  causal_chain: z.array(CausalLinkSchema).optional(),
  temporal_context: TemporalContextSchema.optional(),
  entities_involved: z.array(EntitySchema).optional(),
  semantic_matches: z.array(SemanticMatchSchema).optional(),
});

// Synthesizer output schema
export const SynthesizerOutputSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: SynthesizerReasoningSchema,
  sources: z.array(z.string()),
  follow_ups: z.array(z.string()).optional(),
});

// ============================================================================
// Configuration Schemas - for validating config at runtime
// ============================================================================

export const FalkorDBConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  password: z.string().optional(),
  graphName: z.string().min(1),
});

export const LLMConfigSchema = z.object({
  provider: z.literal('openai'),
  model: z.string().min(1),
  apiKey: z.string().optional(),
  classifierMaxTokens: z.number().int().positive(),
  synthesizerMaxTokens: z.number().int().positive(),
});

export const EmbeddingsConfigSchema = z.object({
  provider: z.literal('openai'),
  model: z.string().min(1),
  dimensions: z.number().int().positive(),
});

export const ExecutionConfigSchema = z.object({
  parallelTimeout: z.number().int().positive(),
  maxRetries: z.number().int().min(0),
});

export const PolygConfigSchema = z.object({
  falkordb: FalkorDBConfigSchema,
  llm: LLMConfigSchema,
  embeddings: EmbeddingsConfigSchema,
  execution: ExecutionConfigSchema,
});

// ============================================================================
// LLM Completion Options Schema
// ============================================================================

export const LLMCompletionOptionsSchema = z.object({
  prompt: z.string().min(1),
  responseFormat: z.enum(['text', 'json']).optional(),
  maxTokens: z.number().int().positive().optional(),
});

// ============================================================================
// Storage Schemas - for validating data from FalkorDB
// ============================================================================

// Connection state enum values
export const ConnectionStateSchema = z.enum([
  'disconnected',
  'connecting',
  'connected',
  'error',
]);

// Node data returned from storage operations
export const NodeDataSchema = z.object({
  uuid: z.string().uuid(),
  labels: z.array(z.string()),
  properties: z.record(z.unknown()),
});

// Query result from storage operations
export const StorageQueryResultSchema = z.object({
  records: z.array(z.record(z.unknown())),
  metadata: z.array(z.string()),
});

// Statistics about stored data
export const StorageStatisticsSchema = z.object({
  semantic_nodes: z.number().int().min(0),
  temporal_nodes: z.number().int().min(0),
  causal_nodes: z.number().int().min(0),
  entity_nodes: z.number().int().min(0),
  total_relationships: z.number().int().min(0),
});

// FalkorDB internal node structure (for parsing raw responses)
export const FalkorDBNodeSchema = z.object({
  id: z.number().optional(),
  labels: z.array(z.string()).default([]),
  properties: z.record(z.unknown()).default({}),
});

// ============================================================================
// Server Configuration Schemas
// ============================================================================

// HTTP transport options
export const HTTPServerOptionsSchema = z.object({
  port: z.number().int().min(1).max(65535).describe('Port to listen on'),
  host: z
    .string()
    .min(1)
    .optional()
    .describe('Host to bind to (default: 0.0.0.0)'),
  stateful: z
    .boolean()
    .optional()
    .describe('Enable stateful sessions (default: true)'),
});

// Health status response
export const HealthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  falkordb: z.enum(['connected', 'disconnected']),
  graphs: z.number().int().min(0),
  uptime: z.number().int().min(0),
});

// MCP tool result content
export const ToolContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

// MCP tool result
export const ToolResultSchema = z.object({
  content: z.array(ToolContentSchema),
  isError: z.boolean().optional(),
  structuredContent: z.unknown().optional(),
});

// ============================================================================
// Export inferred types from schemas
// ============================================================================

// MCP Tool input types
export type RecallInput = z.infer<typeof RecallInputSchema>;
export type RememberInput = z.infer<typeof RememberInputSchema>;
export type GetEntityInput = z.infer<typeof GetEntitySchema>;
export type AddEntityInput = z.infer<typeof AddEntitySchema>;
export type LinkEntitiesInput = z.infer<typeof LinkEntitiesSchema>;
export type QueryTimelineInput = z.infer<typeof QueryTimelineSchema>;
export type AddEventInput = z.infer<typeof AddEventSchema>;
export type AddFactInput = z.infer<typeof AddFactSchema>;
export type GetCausalChainInput = z.infer<typeof GetCausalChainSchema>;
export type AddCausalLinkInput = z.infer<typeof AddCausalLinkSchema>;
export type ExplainWhyInput = z.infer<typeof ExplainWhySchema>;
export type SearchSemanticInput = z.infer<typeof SearchSemanticSchema>;
export type AddConceptInput = z.infer<typeof AddConceptSchema>;
export type ClearGraphInput = z.infer<typeof ClearGraphSchema>;
export type ExportGraphInput = z.infer<typeof ExportGraphSchema>;

// LLM output types
export type IntentType = z.infer<typeof IntentTypeSchema>;
export type EntityMention = z.infer<typeof EntityMentionSchema>;
export type Timeframe = z.infer<typeof TimeframeSchema>;
export type ClassifierOutput = z.infer<typeof ClassifierOutputSchema>;
export type CausalLink = z.infer<typeof CausalLinkSchema>;
export type TemporalEvent = z.infer<typeof TemporalEventSchema>;
export type TemporalFact = z.infer<typeof TemporalFactSchema>;
export type TemporalContext = z.infer<typeof TemporalContextSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type Concept = z.infer<typeof ConceptSchema>;
export type SemanticMatch = z.infer<typeof SemanticMatchSchema>;
export type SynthesizerReasoning = z.infer<typeof SynthesizerReasoningSchema>;
export type SynthesizerOutput = z.infer<typeof SynthesizerOutputSchema>;

// Config types
export type FalkorDBConfig = z.infer<typeof FalkorDBConfigSchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type EmbeddingsConfig = z.infer<typeof EmbeddingsConfigSchema>;
export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>;
export type PolygConfig = z.infer<typeof PolygConfigSchema>;

// LLM options
export type LLMCompletionOptions = z.infer<typeof LLMCompletionOptionsSchema>;

// Storage types
export type ConnectionState = z.infer<typeof ConnectionStateSchema>;
export type NodeData = z.infer<typeof NodeDataSchema>;
export type StorageQueryResult = z.infer<typeof StorageQueryResultSchema>;
export type StorageStatistics = z.infer<typeof StorageStatisticsSchema>;
export type FalkorDBNode = z.infer<typeof FalkorDBNodeSchema>;

// Server types
export type HTTPServerOptions = z.infer<typeof HTTPServerOptionsSchema>;
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type ToolContent = z.infer<typeof ToolContentSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
