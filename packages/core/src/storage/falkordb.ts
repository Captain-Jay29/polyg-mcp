import { randomUUID } from 'node:crypto';
import type { FalkorDBConfig } from '@polyg-mcp/shared';
// FalkorDB adapter - database connection and query execution
import { FalkorDB, type Graph } from 'falkordb';

// FalkorDB query param types
type QueryParam = null | string | number | boolean | QueryParams | QueryParam[];
type QueryParams = { [key: string]: QueryParam };

export interface QueryResult {
  records: Record<string, unknown>[];
  metadata: string[];
}

// Parse FalkorDB metadata strings like "Nodes created: 1"
function parseMetadata(metadata: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const line of metadata) {
    const match = line.match(/^(.+):\s*(\d+)/);
    if (match) {
      const key = match[1].toLowerCase().replace(/\s+/g, '_');
      result[key] = Number.parseInt(match[2], 10);
    }
  }
  return result;
}

export class FalkorDBAdapter {
  private client: FalkorDB | null = null;
  private graph: Graph | null = null;
  private graphName: string;

  constructor(private config: FalkorDBConfig) {
    this.graphName = config.graphName;
  }

  async connect(): Promise<void> {
    this.client = await FalkorDB.connect({
      socket: {
        host: this.config.host,
        port: this.config.port,
      },
      password: this.config.password,
    });
    this.graph = this.client.selectGraph(this.graphName);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.graph = null;
    }
  }

  async query(
    cypher: string,
    params?: Record<string, QueryParam>,
  ): Promise<QueryResult> {
    const graph = this.getGraph();

    const result = await graph.query<Record<string, unknown>[]>(cypher, {
      params: params as QueryParams,
    });

    // Convert result to our format
    const records: Record<string, unknown>[] = [];
    if (result.data) {
      for (const row of result.data) {
        // Row is already transformed by falkordb client
        if (Array.isArray(row)) {
          // If it's still an array, we need to handle it
          records.push({ value: row });
        } else if (typeof row === 'object' && row !== null) {
          records.push(row as Record<string, unknown>);
        } else {
          records.push({ value: row });
        }
      }
    }

    return {
      records,
      metadata: result.metadata || [],
    };
  }

  async createNode(
    label: string,
    properties: Record<string, QueryParam>,
  ): Promise<string> {
    const graph = this.getGraph();

    const uuid = randomUUID();
    const props = { ...properties, uuid };

    // Build property string for Cypher
    const propEntries = Object.entries(props);
    const propString = propEntries.map(([k]) => `${k}: $${k}`).join(', ');

    await graph.query(`CREATE (n:${label} {${propString}})`, {
      params: props as QueryParams,
    });

    return uuid;
  }

  async createRelationship(
    fromUuid: string,
    toUuid: string,
    type: string,
    properties?: Record<string, QueryParam>,
  ): Promise<void> {
    const graph = this.getGraph();

    const props = properties || {};
    const propEntries = Object.entries(props);
    const propString =
      propEntries.length > 0
        ? ` {${propEntries.map(([k]) => `${k}: $${k}`).join(', ')}}`
        : '';

    await graph.query(
      `MATCH (a {uuid: $fromUuid}), (b {uuid: $toUuid})
       CREATE (a)-[r:${type}${propString}]->(b)`,
      { params: { fromUuid, toUuid, ...props } as QueryParams },
    );
  }

  async deleteNode(uuid: string): Promise<void> {
    const graph = this.getGraph();

    await graph.query('MATCH (n {uuid: $uuid}) DETACH DELETE n', {
      params: { uuid },
    });
  }

  async findNodeByUuid(uuid: string): Promise<Record<string, unknown> | null> {
    const result = await this.query('MATCH (n {uuid: $uuid}) RETURN n', {
      uuid,
    });

    if (result.records.length === 0) {
      return null;
    }

    // FalkorDB returns nodes with { id, labels, properties } structure
    const nodeData = result.records[0].n as {
      id: number;
      labels: string[];
      properties: Record<string, unknown>;
    };

    return nodeData?.properties || null;
  }

  async findNodesByLabel(
    label: string,
    limit = 100,
  ): Promise<Record<string, unknown>[]> {
    const result = await this.query(
      `MATCH (n:${label}) RETURN n LIMIT $limit`,
      { limit },
    );

    // FalkorDB returns nodes with { id, labels, properties } structure
    return result.records.map((r) => {
      const nodeData = r.n as {
        id: number;
        labels: string[];
        properties: Record<string, unknown>;
      };
      return nodeData?.properties || {};
    });
  }

  async vectorSearch(
    embedding: number[],
    label: string,
    limit: number,
    embeddingProperty = 'embedding',
  ): Promise<QueryResult> {
    // FalkorDB uses vecf32 for vector similarity search
    // Query nodes with the closest embeddings using euclidean distance
    const result = await this.query(
      `MATCH (n:${label})
       WHERE n.${embeddingProperty} IS NOT NULL
       WITH n, vec.euclideanDistance(n.${embeddingProperty}, vecf32($embedding)) AS distance
       ORDER BY distance ASC
       LIMIT $limit
       RETURN n, distance`,
      { embedding, limit },
    );

    return result;
  }

  async getStatistics(): Promise<Record<string, number>> {
    // Count nodes by label prefix (S_, T_, C_, E_ for our 4 graphs)
    const stats: Record<string, number> = {
      semantic_nodes: 0,
      temporal_nodes: 0,
      causal_nodes: 0,
      entity_nodes: 0,
      total_relationships: 0,
    };

    try {
      // Semantic nodes (S_ prefix)
      const semanticResult = await this.query(
        `MATCH (n) WHERE any(label IN labels(n) WHERE label STARTS WITH 'S_') RETURN count(n) as count`,
      );
      stats.semantic_nodes = (semanticResult.records[0]?.count as number) || 0;

      // Temporal nodes (T_ prefix)
      const temporalResult = await this.query(
        `MATCH (n) WHERE any(label IN labels(n) WHERE label STARTS WITH 'T_') RETURN count(n) as count`,
      );
      stats.temporal_nodes = (temporalResult.records[0]?.count as number) || 0;

      // Causal nodes (C_ prefix)
      const causalResult = await this.query(
        `MATCH (n) WHERE any(label IN labels(n) WHERE label STARTS WITH 'C_') RETURN count(n) as count`,
      );
      stats.causal_nodes = (causalResult.records[0]?.count as number) || 0;

      // Entity nodes (E_ prefix)
      const entityResult = await this.query(
        `MATCH (n) WHERE any(label IN labels(n) WHERE label STARTS WITH 'E_') RETURN count(n) as count`,
      );
      stats.entity_nodes = (entityResult.records[0]?.count as number) || 0;

      // Total relationships
      const relResult = await this.query(
        'MATCH ()-[r]->() RETURN count(r) as count',
      );
      stats.total_relationships = (relResult.records[0]?.count as number) || 0;
    } catch {
      // If queries fail (empty graph), return zeros
    }

    return stats;
  }

  async clearGraph(): Promise<void> {
    const graph = this.getGraph();
    await graph.query('MATCH (n) DETACH DELETE n');
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.client || !this.graph) {
        return false;
      }
      // Simple query to check connectivity
      await this.graph.query('RETURN 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse metadata from query results
   */
  getMetadataStats(metadata: string[]): Record<string, number> {
    return parseMetadata(metadata);
  }

  private ensureConnected(): void {
    if (!this.client || !this.graph) {
      throw new Error('FalkorDB client not connected. Call connect() first.');
    }
  }

  private getGraph(): Graph {
    this.ensureConnected();
    return this.graph as Graph;
  }
}
