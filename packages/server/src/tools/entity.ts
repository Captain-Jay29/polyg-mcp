// Entity graph MCP tools
import type {
  AddEntityInput,
  GetEntityInput,
  LinkEntitiesInput,
} from '@polyg-mcp/shared';

export async function getEntity(input: GetEntityInput): Promise<unknown> {
  // TODO: Get entity (bypass LLM)
  throw new Error('Not implemented');
}

export async function addEntity(input: AddEntityInput): Promise<unknown> {
  // TODO: Add entity
  throw new Error('Not implemented');
}

export async function linkEntities(input: LinkEntitiesInput): Promise<unknown> {
  // TODO: Link two entities
  throw new Error('Not implemented');
}
