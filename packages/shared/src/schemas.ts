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
  properties: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Entity properties'),
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

// Legacy intent types (kept for backwards compatibility)
export const IntentTypeSchema = z.enum([
  'semantic',
  'temporal',
  'causal',
  'entity',
]);

// ============================================================================
// MAGMA Schemas - for MAGMA-style retrieval
// ============================================================================

// MAGMA intent types (question-centric)
export const MAGMAIntentTypeSchema = z.enum([
  'WHY', // Causal reasoning - deep causal traversal
  'WHEN', // Temporal queries - deep temporal traversal
  'WHO', // Entity identification - deep entity traversal
  'WHAT', // Entity description - deep entity traversal
  'EXPLORE', // General exploration - balanced traversal
]);

// Depth hints for graph traversal
export const DepthHintsSchema = z.object({
  entity: z.number().int().min(1).max(5).default(2),
  temporal: z.number().int().min(1).max(5).default(2),
  causal: z.number().int().min(1).max(5).default(3),
});

// MAGMA classifier output
export const MAGMAIntentSchema = z.object({
  type: MAGMAIntentTypeSchema,
  entities: z.array(z.string()).default([]),
  temporalHints: z.array(z.string()).optional(),
  depthHints: DepthHintsSchema,
  confidence: z.number().min(0).max(1).default(0.5),
});

// Graph view source types
export const GraphViewSourceSchema = z.enum([
  'semantic',
  'entity',
  'temporal',
  'causal',
]);

// Node in a graph view (generic)
export const GraphViewNodeSchema = z.object({
  uuid: z.string(),
  data: z.unknown(),
  score: z.number().optional(),
});

// A single graph view result
export const GraphViewSchema = z.object({
  source: GraphViewSourceSchema,
  nodes: z.array(GraphViewNodeSchema),
});

// Scored node after multi-view merge
export const ScoredNodeSchema = z.object({
  uuid: z.string(),
  data: z.unknown(),
  viewCount: z.number().int().min(1), // How many views found this node
  views: z.array(GraphViewSourceSchema), // Which views found it
  finalScore: z.number(), // Score with multi-view boost applied
});

// Merged subgraph from all views
export const MergedSubgraphSchema = z.object({
  nodes: z.array(ScoredNodeSchema),
  viewContributions: z.record(GraphViewSourceSchema, z.number()),
});

// ============================================================================
// MAGMA Tool Schemas - for MAGMA-style retrieval MCP tools
// ============================================================================

// semantic_search - Find seed concepts via vector similarity
export const SemanticSearchSchema = z.object({
  query: z.string().describe('Natural language query for semantic search'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Maximum number of results (default: 10)'),
  min_score: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Minimum similarity score threshold (default: 0.5)'),
});

// entity_lookup - Expand entity relationships from seeds
export const EntityLookupSchema = z.object({
  entity_ids: z
    .array(z.string())
    .min(1)
    .describe('Entity UUIDs or names to expand from'),
  depth: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe('Relationship traversal depth (default: 2)'),
  include_properties: z
    .boolean()
    .optional()
    .describe('Include entity properties in response'),
});

// temporal_expand - Query events involving seed entities
export const TemporalExpandSchema = z.object({
  entity_ids: z
    .array(z.string())
    .min(1)
    .describe('Entity UUIDs to find events for'),
  from: z.string().optional().describe('Start date (ISO format)'),
  to: z.string().optional().describe('End date (ISO format)'),
  depth: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe('Temporal chain traversal depth (default: 2)'),
});

// causal_expand - Traverse causal chains from seed entities
export const CausalExpandSchema = z.object({
  entity_ids: z
    .array(z.string())
    .min(1)
    .describe('Entity UUIDs to find causal chains for'),
  direction: z
    .enum(['upstream', 'downstream', 'both'])
    .optional()
    .describe('Direction to traverse (default: both)'),
  depth: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe('Causal chain traversal depth (default: 3)'),
});

// subgraph_merge - Combine and score graph views
export const SubgraphMergeSchema = z.object({
  views: z.array(GraphViewSchema).min(1).describe('Graph views to merge'),
  multi_view_boost: z
    .number()
    .min(1)
    .optional()
    .describe('Score multiplier for nodes in multiple views (default: 1.5)'),
  min_score: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Minimum score threshold for pruning'),
});

// linearize_context - Format merged subgraph for LLM
export const LinearizeContextSchema = z.object({
  subgraph: MergedSubgraphSchema.describe('Merged subgraph to linearize'),
  intent: MAGMAIntentTypeSchema.describe(
    'Intent type for ordering strategy (WHY, WHEN, WHO, WHAT, EXPLORE)',
  ),
  max_tokens: z
    .number()
    .int()
    .min(100)
    .max(100000)
    .optional()
    .describe('Maximum context tokens (default: 4000)'),
});

// MAGMA configuration
export const MAGMAConfigSchema = z.object({
  // Seeding
  semanticTopK: z.number().int().min(1).max(100).default(10),
  minSemanticScore: z.number().min(0).max(1).default(0.5),

  // Default traversal depths (overridden by intent)
  defaultDepths: DepthHintsSchema.default({
    entity: 2,
    temporal: 2,
    causal: 3,
  }),

  // Fallback thresholds
  minNodesPerView: z.number().int().min(0).default(3),
  maxNodesPerView: z.number().int().min(1).default(50),

  // Multi-view scoring
  multiViewBoost: z.number().min(1).default(1.5),
});

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

/**
 * Classifier output schema (legacy graph-centric)
 * @deprecated Use MAGMAIntentSchema for new implementations.
 * This schema uses graph-centric intents (semantic/temporal/causal/entity)
 * which will be replaced by question-centric intents (WHY/WHEN/WHO/WHAT).
 */
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
  properties: z.record(z.string(), z.unknown()).optional(),
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
  properties: z.record(z.string(), z.unknown()),
});

// Query result from storage operations
export const StorageQueryResultSchema = z.object({
  records: z.array(z.record(z.string(), z.unknown())),
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
  properties: z.record(z.string(), z.unknown()).default({}),
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
  sessionTimeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Session inactivity timeout in milliseconds (default: 1800000 = 30 min)',
    ),
  cleanupIntervalMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Cleanup timer interval in milliseconds (default: 300000 = 5 min)',
    ),
  maxSessions: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum concurrent sessions (default: 100)'),
});

// Session metrics for health response
export const SessionMetricsSchema = z.object({
  active: z.number().int().min(0),
  max: z.number().int().min(0),
});

// Health status response
export const HealthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  falkordb: z.enum(['connected', 'disconnected']),
  graphs: z.number().int().min(0),
  uptime: z.number().int().min(0),
  sessions: SessionMetricsSchema.optional(),
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

// MAGMA tool input types
export type SemanticSearchInput = z.infer<typeof SemanticSearchSchema>;
export type EntityLookupInput = z.infer<typeof EntityLookupSchema>;
export type TemporalExpandInput = z.infer<typeof TemporalExpandSchema>;
export type CausalExpandInput = z.infer<typeof CausalExpandSchema>;
export type SubgraphMergeInput = z.infer<typeof SubgraphMergeSchema>;
export type LinearizeContextInput = z.infer<typeof LinearizeContextSchema>;

// LLM output types (legacy)
export type IntentType = z.infer<typeof IntentTypeSchema>;
export type EntityMention = z.infer<typeof EntityMentionSchema>;
export type Timeframe = z.infer<typeof TimeframeSchema>;
export type ClassifierOutput = z.infer<typeof ClassifierOutputSchema>;

// MAGMA types
export type MAGMAIntentType = z.infer<typeof MAGMAIntentTypeSchema>;
export type DepthHints = z.infer<typeof DepthHintsSchema>;
export type MAGMAIntent = z.infer<typeof MAGMAIntentSchema>;
export type GraphViewSource = z.infer<typeof GraphViewSourceSchema>;
export type GraphViewNode = z.infer<typeof GraphViewNodeSchema>;
export type GraphView = z.infer<typeof GraphViewSchema>;
export type ScoredNode = z.infer<typeof ScoredNodeSchema>;
export type MergedSubgraph = z.infer<typeof MergedSubgraphSchema>;
export type MAGMAConfig = z.infer<typeof MAGMAConfigSchema>;
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
export type SessionMetrics = z.infer<typeof SessionMetricsSchema>;
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type ToolContent = z.infer<typeof ToolContentSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
