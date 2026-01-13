// Temporal graph MCP tools
import type {
  AddEventInput,
  AddFactInput,
  QueryTimelineInput,
} from '@polyg-mcp/shared';

export async function queryTimeline(
  input: QueryTimelineInput,
): Promise<unknown> {
  // TODO: Query timeline (bypass LLM)
  throw new Error('Not implemented');
}

export async function addEvent(input: AddEventInput): Promise<unknown> {
  // TODO: Add event to temporal graph
  throw new Error('Not implemented');
}

export async function addFact(input: AddFactInput): Promise<unknown> {
  // TODO: Add fact to temporal graph
  throw new Error('Not implemented');
}
