// Management MCP tools
// These are now registered directly in the PolygMCPServer class
// This file exports the types and schemas for reference

import { z } from 'zod';

/**
 * Schema for clear_graph tool input
 */
export const ClearGraphInputSchema = z.object({
  graph: z
    .enum(['semantic', 'temporal', 'causal', 'entity', 'all'])
    .describe('Which graph to clear'),
});

export type ClearGraphInput = z.infer<typeof ClearGraphInputSchema>;

/**
 * Schema for export_graph tool input (to be implemented)
 */
export const ExportGraphInputSchema = z.object({
  format: z.enum(['cypher', 'json']).describe('Export format'),
});

export type ExportGraphInput = z.infer<typeof ExportGraphInputSchema>;
