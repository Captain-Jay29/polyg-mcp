// Cross-Graph Linker - manages X_ relationships between graphs
import type { FalkorDBAdapter } from '../storage/falkordb.js';

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
export class CrossLinker {
  constructor(private db: FalkorDBAdapter) {}

  /**
   * Create a cross-graph relationship
   */
  async createLink(
    sourceId: string,
    targetId: string,
    linkType: CrossLinkType,
  ): Promise<void> {
    await this.db.query(
      `MATCH (s {uuid: $sourceId}), (t {uuid: $targetId})
       CREATE (s)-[:${linkType} {created_at: $createdAt}]->(t)`,
      {
        sourceId,
        targetId,
        createdAt: new Date().toISOString(),
      },
    );
  }

  /**
   * Remove a cross-graph relationship
   */
  async removeLink(
    sourceId: string,
    targetId: string,
    linkType: CrossLinkType,
  ): Promise<void> {
    await this.db.query(
      `MATCH (s {uuid: $sourceId})-[r:${linkType}]->(t {uuid: $targetId})
       DELETE r`,
      { sourceId, targetId },
    );
  }

  /**
   * Get all cross-graph links from a node
   */
  async getLinksFrom(sourceId: string): Promise<CrossLink[]> {
    const result = await this.db.query(
      `MATCH (s {uuid: $sourceId})-[r]->(t)
       WHERE type(r) IN ['X_REPRESENTS', 'X_INVOLVES', 'X_REFERS_TO', 'X_AFFECTS']
       RETURN s.uuid as sourceId, t.uuid as targetId, type(r) as linkType, r.created_at as createdAt`,
      { sourceId },
    );

    return result.records.map((record) => ({
      sourceId: record.sourceId as string,
      targetId: record.targetId as string,
      linkType: record.linkType as CrossLinkType,
      createdAt: record.createdAt
        ? new Date(record.createdAt as string)
        : undefined,
    }));
  }

  /**
   * Get all cross-graph links to a node
   */
  async getLinksTo(targetId: string): Promise<CrossLink[]> {
    const result = await this.db.query(
      `MATCH (s)-[r]->(t {uuid: $targetId})
       WHERE type(r) IN ['X_REPRESENTS', 'X_INVOLVES', 'X_REFERS_TO', 'X_AFFECTS']
       RETURN s.uuid as sourceId, t.uuid as targetId, type(r) as linkType, r.created_at as createdAt`,
      { targetId },
    );

    return result.records.map((record) => ({
      sourceId: record.sourceId as string,
      targetId: record.targetId as string,
      linkType: record.linkType as CrossLinkType,
      createdAt: record.createdAt
        ? new Date(record.createdAt as string)
        : undefined,
    }));
  }

  /**
   * Find all nodes with no cross-graph links (orphans)
   */
  async findOrphans(): Promise<string[]> {
    // Find nodes that have no X_ relationships
    const result = await this.db.query(
      `MATCH (n)
       WHERE NOT (n)-[:X_REPRESENTS|X_INVOLVES|X_REFERS_TO|X_AFFECTS]-()
         AND n.uuid IS NOT NULL
       RETURN n.uuid as uuid`,
      {},
    );

    return result.records.map((record) => record.uuid as string);
  }

  /**
   * Get all links of a specific type
   */
  async getLinksByType(linkType: CrossLinkType): Promise<CrossLink[]> {
    const result = await this.db.query(
      `MATCH (s)-[r:${linkType}]->(t)
       RETURN s.uuid as sourceId, t.uuid as targetId, type(r) as linkType, r.created_at as createdAt`,
      {},
    );

    return result.records.map((record) => ({
      sourceId: record.sourceId as string,
      targetId: record.targetId as string,
      linkType: record.linkType as CrossLinkType,
      createdAt: record.createdAt
        ? new Date(record.createdAt as string)
        : undefined,
    }));
  }

  /**
   * Check if a specific link exists
   */
  async hasLink(
    sourceId: string,
    targetId: string,
    linkType: CrossLinkType,
  ): Promise<boolean> {
    const result = await this.db.query(
      `MATCH (s {uuid: $sourceId})-[r:${linkType}]->(t {uuid: $targetId})
       RETURN count(r) as count`,
      { sourceId, targetId },
    );

    const count = result.records[0]?.count as number;
    return count > 0;
  }

  /**
   * Get statistics about cross-graph links
   */
  async getStatistics(): Promise<Record<CrossLinkType, number>> {
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
      stats[linkType] = (result.records[0]?.count as number) || 0;
    }

    return stats as Record<CrossLinkType, number>;
  }

  /**
   * Remove all links from a node (cleanup before deletion)
   */
  async removeAllLinksFrom(sourceId: string): Promise<number> {
    const result = await this.db.query(
      `MATCH (s {uuid: $sourceId})-[r]->()
       WHERE type(r) IN ['X_REPRESENTS', 'X_INVOLVES', 'X_REFERS_TO', 'X_AFFECTS']
       DELETE r
       RETURN count(r) as deleted`,
      { sourceId },
    );

    return (result.records[0]?.deleted as number) || 0;
  }

  /**
   * Remove all links to a node (cleanup before deletion)
   */
  async removeAllLinksTo(targetId: string): Promise<number> {
    const result = await this.db.query(
      `MATCH ()-[r]->(t {uuid: $targetId})
       WHERE type(r) IN ['X_REPRESENTS', 'X_INVOLVES', 'X_REFERS_TO', 'X_AFFECTS']
       DELETE r
       RETURN count(r) as deleted`,
      { targetId },
    );

    return (result.records[0]?.deleted as number) || 0;
  }
}
