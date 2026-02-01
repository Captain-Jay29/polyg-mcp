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
