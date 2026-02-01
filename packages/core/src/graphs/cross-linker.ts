// Cross-Graph Linker - manages X_ relationships between graphs
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import { RelationshipError, wrapGraphError } from './errors.js';
import { safeNumber, safeString } from './parsers.js';

export type CrossLinkType =
  | 'X_REPRESENTS' // Concept → Entity
  | 'X_INVOLVES' // Event → Entity
  | 'X_REFERS_TO' // CausalNode → Event
  | 'X_AFFECTS'; // CausalNode → Entity

export interface CrossLink {
  sourceId: string;
  targetId: string;
  linkType: CrossLinkType;
  createdAt?: Date;
}

/**
 * Cross-Graph Linker manages relationships between different graph types.
 * These X_ relationships connect:
 * - Semantic concepts to entities (X_REPRESENTS)
 * - Temporal events to entities (X_INVOLVES)
 * - Causal nodes to events (X_REFERS_TO)
 * - Causal nodes to entities (X_AFFECTS)
 */
// Maps link types to expected source and target node labels
const LINK_TYPE_CONSTRAINTS: Record<
  CrossLinkType,
  { sourceLabels: string[]; targetLabels: string[] }
> = {
  X_REPRESENTS: { sourceLabels: ['S_Concept'], targetLabels: ['E_Entity'] },
  X_INVOLVES: {
    sourceLabels: ['T_Event', 'T_Fact'],
    targetLabels: ['E_Entity'],
  },
  X_AFFECTS: { sourceLabels: ['C_Node'], targetLabels: ['E_Entity'] },
  X_REFERS_TO: { sourceLabels: ['C_Node'], targetLabels: ['T_Event'] },
};

export class CrossLinker {
  constructor(private db: FalkorDBAdapter) {}

  /**
   * Create a cross-graph relationship.
   * - Uses MERGE for idempotency (prevents duplicates)
   * - Validates that source/target nodes have correct labels for the link type
   */
  async createLink(
    sourceId: string,
    targetId: string,
    linkType: CrossLinkType,
  ): Promise<void> {
    // Validate node types match the link type constraints
    const constraints = LINK_TYPE_CONSTRAINTS[linkType];
    const sourceLabelsClause = constraints.sourceLabels
      .map((l) => `'${l}'`)
      .join(', ');
    const targetLabelsClause = constraints.targetLabels
      .map((l) => `'${l}'`)
      .join(', ');

    try {
      // Use MERGE for idempotency - won't create duplicate links
      // Also validate node labels match the expected types for this link
      const result = await this.db.query(
        `MATCH (s {uuid: $sourceId}), (t {uuid: $targetId})
         WHERE any(label IN labels(s) WHERE label IN [${sourceLabelsClause}])
           AND any(label IN labels(t) WHERE label IN [${targetLabelsClause}])
         MERGE (s)-[r:${linkType}]->(t)
         ON CREATE SET r.created_at = $createdAt
         RETURN s.uuid as sourceUuid`,
        {
          sourceId,
          targetId,
          createdAt: new Date().toISOString(),
        },
      );

      // If no records returned, either nodes don't exist or have wrong labels
      if (result.records.length === 0) {
        // Check if nodes exist at all
        const existsResult = await this.db.query(
          `MATCH (s {uuid: $sourceId}), (t {uuid: $targetId})
           RETURN labels(s) as sourceLabels, labels(t) as targetLabels`,
          { sourceId, targetId },
        );

        if (existsResult.records.length === 0) {
          throw new RelationshipError(
            'Source or target node not found',
            sourceId,
            targetId,
            linkType,
          );
        }

        // Nodes exist but have wrong labels
        const sourceLabels = existsResult.records[0]?.sourceLabels || [];
        const targetLabels = existsResult.records[0]?.targetLabels || [];
        throw new RelationshipError(
          `Invalid node types for ${linkType}: source has labels [${sourceLabels}], expected one of [${sourceLabelsClause}]; target has labels [${targetLabels}], expected one of [${targetLabelsClause}]`,
          sourceId,
          targetId,
          linkType,
        );
      }
    } catch (error) {
      // Re-throw RelationshipError as-is
      if (error instanceof RelationshipError) {
        throw error;
      }
      throw new RelationshipError(
        'Failed to create cross-graph link',
        sourceId,
        targetId,
        linkType,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Remove a cross-graph relationship
   */
  async removeLink(
    sourceId: string,
    targetId: string,
    linkType: CrossLinkType,
  ): Promise<void> {
    try {
      await this.db.query(
        `MATCH (s {uuid: $sourceId})-[r:${linkType}]->(t {uuid: $targetId})
         DELETE r`,
        { sourceId, targetId },
      );
    } catch (error) {
      throw new RelationshipError(
        'Failed to remove cross-graph link',
        sourceId,
        targetId,
        linkType,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get all cross-graph links from a node
   */
  async getLinksFrom(sourceId: string): Promise<CrossLink[]> {
    try {
      const result = await this.db.query(
        `MATCH (s {uuid: $sourceId})-[r]->(t)
         WHERE type(r) IN ['X_REPRESENTS', 'X_INVOLVES', 'X_REFERS_TO', 'X_AFFECTS']
         RETURN s.uuid as sourceId, t.uuid as targetId, type(r) as linkType, r.created_at as createdAt`,
        { sourceId },
      );

      return result.records.map((record: Record<string, unknown>) => ({
        sourceId: safeString(record.sourceId),
        targetId: safeString(record.targetId),
        linkType: safeString(record.linkType) as CrossLinkType,
        createdAt: record.createdAt
          ? new Date(safeString(record.createdAt))
          : undefined,
      }));
    } catch (error) {
      throw wrapGraphError(
        error,
        `Failed to get links from: ${sourceId}`,
        'CrossLinker',
        'getLinksFrom',
      );
    }
  }

  /**
   * Get all cross-graph links to a node
   */
  async getLinksTo(targetId: string): Promise<CrossLink[]> {
    try {
      const result = await this.db.query(
        `MATCH (s)-[r]->(t {uuid: $targetId})
         WHERE type(r) IN ['X_REPRESENTS', 'X_INVOLVES', 'X_REFERS_TO', 'X_AFFECTS']
         RETURN s.uuid as sourceId, t.uuid as targetId, type(r) as linkType, r.created_at as createdAt`,
        { targetId },
      );

      return result.records.map((record: Record<string, unknown>) => ({
        sourceId: safeString(record.sourceId),
        targetId: safeString(record.targetId),
        linkType: safeString(record.linkType) as CrossLinkType,
        createdAt: record.createdAt
          ? new Date(safeString(record.createdAt))
          : undefined,
      }));
    } catch (error) {
      throw wrapGraphError(
        error,
        `Failed to get links to: ${targetId}`,
        'CrossLinker',
        'getLinksTo',
      );
    }
  }

  /**
   * Find all nodes with no cross-graph links (orphans)
   */
  async findOrphans(): Promise<string[]> {
    try {
      // Find nodes that have no X_ relationships
      const result = await this.db.query(
        `MATCH (n)
         WHERE NOT (n)-[:X_REPRESENTS|X_INVOLVES|X_REFERS_TO|X_AFFECTS]-()
           AND n.uuid IS NOT NULL
         RETURN n.uuid as uuid`,
        {},
      );

      return result.records.map((record: Record<string, unknown>) =>
        safeString(record.uuid),
      );
    } catch (error) {
      throw wrapGraphError(
        error,
        'Failed to find orphan nodes',
        'CrossLinker',
        'findOrphans',
      );
    }
  }

  /**
   * Get all links of a specific type
   */
  async getLinksByType(linkType: CrossLinkType): Promise<CrossLink[]> {
    try {
      const result = await this.db.query(
        `MATCH (s)-[r:${linkType}]->(t)
         RETURN s.uuid as sourceId, t.uuid as targetId, type(r) as linkType, r.created_at as createdAt`,
        {},
      );

      return result.records.map((record: Record<string, unknown>) => ({
        sourceId: safeString(record.sourceId),
        targetId: safeString(record.targetId),
        linkType: safeString(record.linkType) as CrossLinkType,
        createdAt: record.createdAt
          ? new Date(safeString(record.createdAt))
          : undefined,
      }));
    } catch (error) {
      throw wrapGraphError(
        error,
        `Failed to get links by type: ${linkType}`,
        'CrossLinker',
        'getLinksByType',
      );
    }
  }

  /**
   * Check if a specific link exists
   */
  async hasLink(
    sourceId: string,
    targetId: string,
    linkType: CrossLinkType,
  ): Promise<boolean> {
    try {
      const result = await this.db.query(
        `MATCH (s {uuid: $sourceId})-[r:${linkType}]->(t {uuid: $targetId})
         RETURN count(r) as count`,
        { sourceId, targetId },
      );

      const count = safeNumber(result.records[0]?.count, 0);
      return count > 0;
    } catch (error) {
      throw wrapGraphError(
        error,
        'Failed to check link existence',
        'CrossLinker',
        'hasLink',
      );
    }
  }

  /**
   * Get statistics about cross-graph links
   */
  async getStatistics(): Promise<Record<CrossLinkType, number>> {
    try {
      const types: CrossLinkType[] = [
        'X_REPRESENTS',
        'X_INVOLVES',
        'X_REFERS_TO',
        'X_AFFECTS',
      ];
      const stats: Record<string, number> = {};

      for (const linkType of types) {
        const result = await this.db.query(
          `MATCH ()-[r:${linkType}]->() RETURN count(r) as count`,
          {},
        );
        stats[linkType] = safeNumber(result.records[0]?.count, 0);
      }

      return stats as Record<CrossLinkType, number>;
    } catch (error) {
      throw wrapGraphError(
        error,
        'Failed to get link statistics',
        'CrossLinker',
        'getStatistics',
      );
    }
  }

  /**
   * Remove all links from a node (cleanup before deletion)
   */
  async removeAllLinksFrom(sourceId: string): Promise<number> {
    try {
      const result = await this.db.query(
        `MATCH (s {uuid: $sourceId})-[r]->()
         WHERE type(r) IN ['X_REPRESENTS', 'X_INVOLVES', 'X_REFERS_TO', 'X_AFFECTS']
         DELETE r
         RETURN count(r) as deleted`,
        { sourceId },
      );

      return safeNumber(result.records[0]?.deleted, 0);
    } catch (error) {
      throw wrapGraphError(
        error,
        `Failed to remove links from: ${sourceId}`,
        'CrossLinker',
        'removeAllLinksFrom',
      );
    }
  }

  /**
   * Remove all links to a node (cleanup before deletion)
   */
  async removeAllLinksTo(targetId: string): Promise<number> {
    try {
      const result = await this.db.query(
        `MATCH ()-[r]->(t {uuid: $targetId})
         WHERE type(r) IN ['X_REPRESENTS', 'X_INVOLVES', 'X_REFERS_TO', 'X_AFFECTS']
         DELETE r
         RETURN count(r) as deleted`,
        { targetId },
      );

      return safeNumber(result.records[0]?.deleted, 0);
    } catch (error) {
      throw wrapGraphError(
        error,
        `Failed to remove links to: ${targetId}`,
        'CrossLinker',
        'removeAllLinksTo',
      );
    }
  }
}
