// Entity Graph - persistent entities, properties, and hierarchies
import type { Entity } from '@polyg-mcp/shared';
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import {
  EntityNotFoundError,
  GraphParseError,
  RelationshipError,
  wrapGraphError,
} from './errors.js';
import { parseEntity, safeString } from './parsers.js';
import { ParseError } from './parsers.js';

export interface EntityRelationship {
  source: Entity;
  target: Entity;
  relationshipType: string;
}

// Node label for entity graph
const ENTITY_LABEL = 'E_Entity';
const RELATIONSHIP_TYPE = 'E_RELATES';

/**
 * Entity Graph manages persistent entities, their properties, and relationships.
 * All entity nodes use the E_Entity label with properties: uuid, name, entity_type, properties, created_at
 */
export class EntityGraph {
  constructor(private db: FalkorDBAdapter) {}

  /**
   * Add a new entity to the graph
   */
  async addEntity(
    name: string,
    entityType: string,
    properties?: Record<string, unknown>,
  ): Promise<Entity> {
    try {
      const now = new Date();
      const nodeProps = {
        name,
        entity_type: entityType,
        properties: properties ? JSON.stringify(properties) : '{}',
        created_at: now.toISOString(),
      };

      const uuid = await this.db.createNode(ENTITY_LABEL, nodeProps);

      return {
        uuid,
        name,
        entity_type: entityType,
        properties: properties || {},
        created_at: now,
      };
    } catch (error) {
      throw wrapGraphError(
        error,
        `Failed to add entity: ${name}`,
        'Entity',
        'addEntity',
      );
    }
  }

  /**
   * Get an entity by name or UUID
   */
  async getEntity(nameOrId: string): Promise<Entity | null> {
    try {
      // Try by UUID first
      const byUuid = await this.db.query(
        `MATCH (n:${ENTITY_LABEL} {uuid: $id}) RETURN n`,
        { id: nameOrId },
      );

      if (byUuid.records.length > 0) {
        return this.safeParseEntity(byUuid.records[0].n);
      }

      // Try by name
      const byName = await this.db.query(
        `MATCH (n:${ENTITY_LABEL} {name: $name}) RETURN n`,
        { name: nameOrId },
      );

      if (byName.records.length > 0) {
        return this.safeParseEntity(byName.records[0].n);
      }

      return null;
    } catch (error) {
      throw wrapGraphError(
        error,
        `Failed to get entity: ${nameOrId}`,
        'Entity',
        'getEntity',
      );
    }
  }

  /**
   * Safely parse an entity node, wrapping ParseError in GraphParseError
   */
  private safeParseEntity(node: unknown): Entity {
    try {
      return parseEntity(node);
    } catch (error) {
      if (error instanceof ParseError) {
        throw new GraphParseError(error.message, error.nodeType, error);
      }
      throw error;
    }
  }

  /**
   * Update entity properties
   */
  async updateEntity(
    id: string,
    properties: Record<string, unknown>,
  ): Promise<Entity> {
    try {
      // First get the existing entity
      const existing = await this.getEntity(id);
      if (!existing) {
        throw new EntityNotFoundError(`Entity not found: ${id}`, 'Entity', id);
      }

      // Merge properties
      const mergedProps = { ...existing.properties, ...properties };

      await this.db.query(
        `MATCH (n:${ENTITY_LABEL} {uuid: $uuid}) SET n.properties = $properties`,
        { uuid: existing.uuid, properties: JSON.stringify(mergedProps) },
      );

      return {
        ...existing,
        properties: mergedProps,
      };
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to update entity: ${id}`,
        'Entity',
        'updateEntity',
      );
    }
  }

  /**
   * Delete an entity and all its relationships
   */
  async deleteEntity(id: string): Promise<void> {
    try {
      const entity = await this.getEntity(id);
      if (!entity) {
        throw new EntityNotFoundError(`Entity not found: ${id}`, 'Entity', id);
      }

      // Delete the node and all relationships
      await this.db.query(
        `MATCH (n:${ENTITY_LABEL} {uuid: $uuid}) DETACH DELETE n`,
        { uuid: entity.uuid },
      );
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to delete entity: ${id}`,
        'Entity',
        'deleteEntity',
      );
    }
  }

  /**
   * Create a relationship between two entities
   */
  async linkEntities(
    sourceId: string,
    targetId: string,
    relationshipType: string,
  ): Promise<void> {
    try {
      const source = await this.getEntity(sourceId);
      const target = await this.getEntity(targetId);

      if (!source) {
        throw new EntityNotFoundError(
          `Source entity not found: ${sourceId}`,
          'Entity',
          sourceId,
        );
      }
      if (!target) {
        throw new EntityNotFoundError(
          `Target entity not found: ${targetId}`,
          'Entity',
          targetId,
        );
      }

      await this.db.query(
        `MATCH (s:${ENTITY_LABEL} {uuid: $sourceUuid}), (t:${ENTITY_LABEL} {uuid: $targetUuid})
         CREATE (s)-[:${RELATIONSHIP_TYPE} {relationship_type: $relType, created_at: $createdAt}]->(t)`,
        {
          sourceUuid: source.uuid,
          targetUuid: target.uuid,
          relType: relationshipType,
          createdAt: new Date().toISOString(),
        },
      );
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        throw error;
      }
      throw new RelationshipError(
        'Failed to link entities',
        sourceId,
        targetId,
        relationshipType,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get all relationships for an entity
   */
  async getRelationships(entityId: string): Promise<EntityRelationship[]> {
    try {
      const entity = await this.getEntity(entityId);
      if (!entity) {
        throw new EntityNotFoundError(
          `Entity not found: ${entityId}`,
          'Entity',
          entityId,
        );
      }

      // Get outgoing relationships
      const outgoing = await this.db.query(
        `MATCH (s:${ENTITY_LABEL} {uuid: $uuid})-[r:${RELATIONSHIP_TYPE}]->(t:${ENTITY_LABEL})
         RETURN s, r.relationship_type as relType, t`,
        { uuid: entity.uuid },
      );

      // Get incoming relationships
      const incoming = await this.db.query(
        `MATCH (s:${ENTITY_LABEL})-[r:${RELATIONSHIP_TYPE}]->(t:${ENTITY_LABEL} {uuid: $uuid})
         RETURN s, r.relationship_type as relType, t`,
        { uuid: entity.uuid },
      );

      const relationships: EntityRelationship[] = [];

      for (const record of outgoing.records) {
        relationships.push({
          source: this.safeParseEntity(record.s),
          target: this.safeParseEntity(record.t),
          relationshipType: safeString(record.relType),
        });
      }

      for (const record of incoming.records) {
        relationships.push({
          source: this.safeParseEntity(record.s),
          target: this.safeParseEntity(record.t),
          relationshipType: safeString(record.relType),
        });
      }

      return relationships;
    } catch (error) {
      if (
        error instanceof EntityNotFoundError ||
        error instanceof GraphParseError
      ) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to get relationships for: ${entityId}`,
        'Entity',
        'getRelationships',
      );
    }
  }

  /**
   * Resolve entity mentions to actual entities (fuzzy matching)
   */
  async resolve(
    mentions: { mention: string; type?: string }[],
  ): Promise<Entity[]> {
    try {
      const resolved: Entity[] = [];

      for (const { mention, type } of mentions) {
        // Try exact match first
        let entity = await this.getEntity(mention);

        if (!entity) {
          // Try case-insensitive search
          const query = type
            ? `MATCH (n:${ENTITY_LABEL}) WHERE toLower(n.name) CONTAINS toLower($mention) AND n.entity_type = $type RETURN n LIMIT 1`
            : `MATCH (n:${ENTITY_LABEL}) WHERE toLower(n.name) CONTAINS toLower($mention) RETURN n LIMIT 1`;

          const result = await this.db.query(query, { mention, type });

          if (result.records.length > 0) {
            entity = this.safeParseEntity(result.records[0].n);
          }
        }

        if (entity) {
          resolved.push(entity);
        }
      }

      return resolved;
    } catch (error) {
      if (error instanceof GraphParseError) {
        throw error;
      }
      throw wrapGraphError(
        error,
        'Failed to resolve entity mentions',
        'Entity',
        'resolve',
      );
    }
  }

  /**
   * Search entities by name or properties
   */
  async search(query: string, entityType?: string): Promise<Entity[]> {
    try {
      const cypherQuery = entityType
        ? `MATCH (n:${ENTITY_LABEL}) WHERE toLower(n.name) CONTAINS toLower($query) AND n.entity_type = $type RETURN n LIMIT 20`
        : `MATCH (n:${ENTITY_LABEL}) WHERE toLower(n.name) CONTAINS toLower($query) RETURN n LIMIT 20`;

      const result = await this.db.query(cypherQuery, {
        query,
        type: entityType,
      });

      return result.records.map((r: Record<string, unknown>) =>
        this.safeParseEntity(r.n),
      );
    } catch (error) {
      if (error instanceof GraphParseError) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to search entities: ${query}`,
        'Entity',
        'search',
      );
    }
  }

  /**
   * Get all entities of a specific type
   */
  async getByType(entityType: string, limit = 100): Promise<Entity[]> {
    try {
      const result = await this.db.query(
        `MATCH (n:${ENTITY_LABEL} {entity_type: $type}) RETURN n LIMIT $limit`,
        { type: entityType, limit },
      );

      return result.records.map((r: Record<string, unknown>) =>
        this.safeParseEntity(r.n),
      );
    } catch (error) {
      if (error instanceof GraphParseError) {
        throw error;
      }
      throw wrapGraphError(
        error,
        `Failed to get entities by type: ${entityType}`,
        'Entity',
        'getByType',
      );
    }
  }
}
