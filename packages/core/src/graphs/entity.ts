// Entity Graph - persistent entities, properties, and hierarchies
import type { Entity } from '@polyg-mcp/shared';
import type { FalkorDBAdapter } from '../storage/falkordb.js';

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
  }

  /**
   * Get an entity by name or UUID
   */
  async getEntity(nameOrId: string): Promise<Entity | null> {
    // Try by UUID first
    const byUuid = await this.db.query(
      `MATCH (n:${ENTITY_LABEL} {uuid: $id}) RETURN n`,
      { id: nameOrId },
    );

    if (byUuid.records.length > 0) {
      return this.parseEntity(byUuid.records[0].n);
    }

    // Try by name
    const byName = await this.db.query(
      `MATCH (n:${ENTITY_LABEL} {name: $name}) RETURN n`,
      { name: nameOrId },
    );

    if (byName.records.length > 0) {
      return this.parseEntity(byName.records[0].n);
    }

    return null;
  }

  /**
   * Update entity properties
   */
  async updateEntity(
    id: string,
    properties: Record<string, unknown>,
  ): Promise<Entity> {
    // First get the existing entity
    const existing = await this.getEntity(id);
    if (!existing) {
      throw new Error(`Entity not found: ${id}`);
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
  }

  /**
   * Delete an entity and all its relationships
   */
  async deleteEntity(id: string): Promise<void> {
    const entity = await this.getEntity(id);
    if (!entity) {
      throw new Error(`Entity not found: ${id}`);
    }

    // Delete the node and all relationships
    await this.db.query(
      `MATCH (n:${ENTITY_LABEL} {uuid: $uuid}) DETACH DELETE n`,
      { uuid: entity.uuid },
    );
  }

  /**
   * Create a relationship between two entities
   */
  async linkEntities(
    sourceId: string,
    targetId: string,
    relationshipType: string,
  ): Promise<void> {
    const source = await this.getEntity(sourceId);
    const target = await this.getEntity(targetId);

    if (!source) {
      throw new Error(`Source entity not found: ${sourceId}`);
    }
    if (!target) {
      throw new Error(`Target entity not found: ${targetId}`);
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
  }

  /**
   * Get all relationships for an entity
   */
  async getRelationships(entityId: string): Promise<EntityRelationship[]> {
    const entity = await this.getEntity(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
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
        source: this.parseEntity(record.s),
        target: this.parseEntity(record.t),
        relationshipType: record.relType as string,
      });
    }

    for (const record of incoming.records) {
      relationships.push({
        source: this.parseEntity(record.s),
        target: this.parseEntity(record.t),
        relationshipType: record.relType as string,
      });
    }

    return relationships;
  }

  /**
   * Resolve entity mentions to actual entities (fuzzy matching)
   */
  async resolve(
    mentions: { mention: string; type?: string }[],
  ): Promise<Entity[]> {
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
          entity = this.parseEntity(result.records[0].n);
        }
      }

      if (entity) {
        resolved.push(entity);
      }
    }

    return resolved;
  }

  /**
   * Search entities by name or properties
   */
  async search(query: string, entityType?: string): Promise<Entity[]> {
    const cypherQuery = entityType
      ? `MATCH (n:${ENTITY_LABEL}) WHERE toLower(n.name) CONTAINS toLower($query) AND n.entity_type = $type RETURN n LIMIT 20`
      : `MATCH (n:${ENTITY_LABEL}) WHERE toLower(n.name) CONTAINS toLower($query) RETURN n LIMIT 20`;

    const result = await this.db.query(cypherQuery, {
      query,
      type: entityType,
    });

    return result.records.map((r) => this.parseEntity(r.n));
  }

  /**
   * Get all entities of a specific type
   */
  async getByType(entityType: string, limit = 100): Promise<Entity[]> {
    const result = await this.db.query(
      `MATCH (n:${ENTITY_LABEL} {entity_type: $type}) RETURN n LIMIT $limit`,
      { type: entityType, limit },
    );

    return result.records.map((r) => this.parseEntity(r.n));
  }

  /**
   * Parse a FalkorDB node into an Entity
   */
  private parseEntity(node: unknown): Entity {
    const n = node as Record<string, unknown>;
    const props = n.properties as Record<string, unknown>;

    let parsedProperties: Record<string, unknown> = {};
    if (typeof props.properties === 'string') {
      try {
        parsedProperties = JSON.parse(props.properties);
      } catch {
        parsedProperties = {};
      }
    }

    return {
      uuid: props.uuid as string,
      name: props.name as string,
      entity_type: props.entity_type as string,
      properties: parsedProperties,
      created_at: new Date(props.created_at as string),
    };
  }
}
