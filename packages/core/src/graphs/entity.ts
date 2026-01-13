// Entity Graph - persistent entities, properties, and hierarchies
import type { Entity } from '@polyg-mcp/shared';
import type { FalkorDBAdapter } from '../storage/falkordb.js';

export interface EntityRelationship {
  source: Entity;
  target: Entity;
  relationshipType: string;
}

export class EntityGraph {
  constructor(private db: FalkorDBAdapter) {}

  async addEntity(
    name: string,
    entityType: string,
    properties?: Record<string, unknown>,
  ): Promise<Entity> {
    // TODO: Create E_Entity node
    throw new Error('Not implemented');
  }

  async getEntity(nameOrId: string): Promise<Entity | null> {
    // TODO: Get entity by name or UUID
    throw new Error('Not implemented');
  }

  async updateEntity(
    id: string,
    properties: Record<string, unknown>,
  ): Promise<Entity> {
    // TODO: Update entity properties
    throw new Error('Not implemented');
  }

  async deleteEntity(id: string): Promise<void> {
    // TODO: Delete entity and its relationships
    throw new Error('Not implemented');
  }

  async linkEntities(
    sourceId: string,
    targetId: string,
    relationshipType: string,
  ): Promise<void> {
    // TODO: Create E_RELATES relationship
    throw new Error('Not implemented');
  }

  async getRelationships(entityId: string): Promise<EntityRelationship[]> {
    // TODO: Get all relationships for an entity
    throw new Error('Not implemented');
  }

  async resolve(
    mentions: { mention: string; type?: string }[],
  ): Promise<Entity[]> {
    // TODO: Resolve entity mentions to actual entities
    throw new Error('Not implemented');
  }

  async search(query: string, entityType?: string): Promise<Entity[]> {
    // TODO: Search entities by name/properties
    throw new Error('Not implemented');
  }
}
