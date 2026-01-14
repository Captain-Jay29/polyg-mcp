// Semantic graph MCP tools
import type { AddConceptInput, SearchSemanticInput } from '@polyg-mcp/shared';

export async function searchSemantic(
  _input: SearchSemanticInput,
): Promise<unknown> {
  // TODO: Direct semantic search (bypass LLM)
  throw new Error('Not implemented');
}

export async function addConcept(_input: AddConceptInput): Promise<unknown> {
  // TODO: Add concept to semantic graph
  throw new Error('Not implemented');
}
