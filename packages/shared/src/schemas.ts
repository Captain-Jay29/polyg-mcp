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

// Export types
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
