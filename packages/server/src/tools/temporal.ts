// Temporal graph MCP tools
import type {
  AddEventInput,
  AddFactInput,
  QueryTimelineInput,
} from '@polyg-mcp/shared';

export async function queryTimeline(
  _input: QueryTimelineInput,
): Promise<unknown> {
  // TODO: Query timeline (bypass LLM)
  throw new Error('Not implemented');
}

export async function addEvent(_input: AddEventInput): Promise<unknown> {
  // TODO: Add event to temporal graph
  throw new Error('Not implemented');
}

export async function addFact(_input: AddFactInput): Promise<unknown> {
  // TODO: Add fact to temporal graph
  throw new Error('Not implemented');
}
