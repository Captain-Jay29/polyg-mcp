// FalkorDB adapter - database connection and query execution
import { randomUUID } from 'node:crypto';
import {
  type FalkorDBConfig,
  FalkorDBNodeSchema,
  loggers,
  type NodeData,
  type StorageQueryResult,
  type StorageStatistics,
  validateFalkorDBConfig,
} from '@polyg-mcp/shared';
import { FalkorDB, type Graph } from 'falkordb';
import {
  ConnectionError,
  QueryError,
  StorageConfigError,
  ValidationError,
} from './errors.js';
import { type IStorageAdapter, isValidIdentifier } from './interface.js';

// FalkorDB query param types (internal)
type QueryParam = null | string | number | boolean | QueryParams | QueryParam[];
type QueryParams = { [key: string]: QueryParam };

// Connection state enum (matches shared schema)
const ConnectionState = {
  Disconnected: 'disconnected',
  Connecting: 'connecting',
  Connected: 'connected',
  Error: 'error',
} as const;

type ConnectionStateType =
  (typeof ConnectionState)[keyof typeof ConnectionState];

/**
 * FalkorDB storage adapter implementation
 * Provides graph database operations with proper error handling and validation
 */
export class FalkorDBAdapter implements IStorageAdapter {
  private client: FalkorDB | null = null;
  private graph: Graph | null = null;
  private connectionState: ConnectionStateType = ConnectionState.Disconnected;
  private readonly graphName: string;
  private readonly validatedConfig: FalkorDBConfig;
  private readonly queryTimeoutMs: number;

  /**
   * Create a new FalkorDB adapter
   * @throws StorageConfigError if configuration is invalid
   */
  constructor(config: FalkorDBConfig) {
    // Validate configuration using Zod
    try {
      this.validatedConfig = validateFalkorDBConfig(config);
    } catch (error) {
      throw new StorageConfigError(
        `Invalid FalkorDB configuration: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }
    this.graphName = this.validatedConfig.graphName;
    this.queryTimeoutMs = this.validatedConfig.queryTimeoutMs ?? 30000;
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionStateType {
    return this.connectionState;
  }

  /**
   * Connect to FalkorDB
   * @throws ConnectionError if connection fails
   */
  async connect(): Promise<void> {
    // Prevent double-connect
    if (this.connectionState === ConnectionState.Connected) {
      return;
    }

    if (this.connectionState === ConnectionState.Connecting) {
      throw new ConnectionError('Connection already in progress');
    }

    this.connectionState = ConnectionState.Connecting;

    try {
      this.client = await FalkorDB.connect({
        socket: {
          host: this.validatedConfig.host,
          port: this.validatedConfig.port,
        },
        password: this.validatedConfig.password,
      });
      this.graph = this.client.selectGraph(this.graphName);
      this.connectionState = ConnectionState.Connected;
    } catch (error) {
      this.connectionState = ConnectionState.Error;
      this.client = null;
      this.graph = null;
      throw new ConnectionError(
        `Failed to connect to FalkorDB at ${this.validatedConfig.host}:${this.validatedConfig.port}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Disconnect from FalkorDB
   * @returns Object indicating whether disconnect was clean or had errors
   */
  async disconnect(): Promise<{ success: boolean; error?: string }> {
    if (!this.client) {
      return { success: true };
    }

    let disconnectError: string | undefined;
    try {
      await this.client.close();
    } catch (error) {
      disconnectError = error instanceof Error ? error.message : String(error);
      loggers.storage.warn('Error during disconnect', {
        error: disconnectError,
      });
    } finally {
      this.client = null;
      this.graph = null;
      this.connectionState = ConnectionState.Disconnected;
    }

    return disconnectError
      ? { success: false, error: disconnectError }
      : { success: true };
  }

  /**
   * Check if database is healthy and responsive
   */
  async healthCheck(): Promise<boolean> {
    if (this.connectionState !== ConnectionState.Connected) {
      return false;
    }

    try {
      await this.graph?.query('RETURN 1');
      return true;
    } catch (error) {
      loggers.storage.warn('Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Execute a raw Cypher query with timeout
   * @throws QueryError if query execution fails or times out
   */
  async query(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<StorageQueryResult> {
    const graph = this.requireConnection();

    try {
      const queryPromise = graph.query<Record<string, unknown>[]>(cypher, {
        params: params as QueryParams,
      });

      const result = await this.withQueryTimeout(
        queryPromise,
        this.queryTimeoutMs,
        cypher,
      );

      // Convert result to our format
      const records: Record<string, unknown>[] = [];
      if (result.data) {
        for (const row of result.data) {
          if (Array.isArray(row)) {
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
    } catch (error) {
      if (error instanceof QueryError) {
        throw error;
      }
      throw new QueryError(
        'Query execution failed',
        cypher,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Execute a promise with a timeout
   * @throws QueryError if the operation times out
   */
  private async withQueryTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    cypher: string,
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new QueryError(
            `Query timed out after ${timeoutMs}ms`,
            cypher,
            undefined,
          ),
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Create a new node with the given label and properties
   * @throws ValidationError if label is invalid
   * @throws QueryError if creation fails
   */
  async createNode(
    label: string,
    properties: Record<string, unknown>,
  ): Promise<string> {
    // Validate label to prevent Cypher injection
    if (!isValidIdentifier(label)) {
      throw new ValidationError(
        `Invalid label: "${label}". Labels must be alphanumeric with underscores, starting with a letter.`,
        'label',
      );
    }

    const graph = this.requireConnection();
    const uuid = randomUUID();
    const props = { ...properties, uuid };

    // Build parameterized property string
    const propEntries = Object.entries(props);
    const propString = propEntries.map(([k]) => `${k}: $${k}`).join(', ');

    try {
      await graph.query(`CREATE (n:${label} {${propString}})`, {
        params: props as QueryParams,
      });
      return uuid;
    } catch (error) {
      throw new QueryError(
        `Failed to create node with label "${label}"`,
        `CREATE (n:${label} {...})`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find a node by its UUID
   */
  async findNodeByUuid(uuid: string): Promise<NodeData | null> {
    const result = await this.query('MATCH (n {uuid: $uuid}) RETURN n', {
      uuid,
    });

    if (result.records.length === 0) {
      return null;
    }

    return this.parseNodeData(result.records[0].n);
  }

  /**
   * Find all nodes with a specific label
   */
  async findNodesByLabel(label: string, limit = 100): Promise<NodeData[]> {
    // Validate label
    if (!isValidIdentifier(label)) {
      throw new ValidationError(
        `Invalid label: "${label}". Labels must be alphanumeric with underscores.`,
        'label',
      );
    }

    const result = await this.query(
      `MATCH (n:${label}) RETURN n LIMIT $limit`,
      { limit },
    );

    return result.records
      .map((r: Record<string, unknown>) => this.parseNodeData(r.n))
      .filter((n: NodeData | null): n is NodeData => n !== null);
  }

  /**
   * Delete a node by UUID
   * @returns true if node was deleted, false if not found
   */
  async deleteNode(uuid: string): Promise<boolean> {
    const graph = this.requireConnection();

    try {
      const result = await graph.query(
        'MATCH (n {uuid: $uuid}) DETACH DELETE n',
        { params: { uuid } },
      );

      // Check metadata for deletion count
      const deletedCount = this.parseMetadataValue(
        result.metadata,
        'nodes_deleted',
      );
      return deletedCount > 0;
    } catch (error) {
      throw new QueryError(
        `Failed to delete node with UUID "${uuid}"`,
        'MATCH (n {uuid: $uuid}) DETACH DELETE n',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Create a relationship between two nodes
   * @throws ValidationError if relationship type is invalid
   */
  async createRelationship(
    fromUuid: string,
    toUuid: string,
    type: string,
    properties?: Record<string, unknown>,
  ): Promise<void> {
    // Validate relationship type
    if (!isValidIdentifier(type)) {
      throw new ValidationError(
        `Invalid relationship type: "${type}". Types must be alphanumeric with underscores.`,
        'type',
      );
    }

    const graph = this.requireConnection();
    const props = properties || {};
    const propEntries = Object.entries(props);
    const propString =
      propEntries.length > 0
        ? ` {${propEntries.map(([k]) => `${k}: $${k}`).join(', ')}}`
        : '';

    try {
      await graph.query(
        `MATCH (a {uuid: $fromUuid}), (b {uuid: $toUuid})
         CREATE (a)-[r:${type}${propString}]->(b)`,
        { params: { fromUuid, toUuid, ...props } as QueryParams },
      );
    } catch (error) {
      throw new QueryError(
        `Failed to create ${type} relationship between ${fromUuid} and ${toUuid}`,
        `MATCH ... CREATE ...-[:${type}]->...`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Search for nodes by vector similarity
   */
  async vectorSearch(
    embedding: number[],
    label: string,
    limit: number,
    embeddingProperty = 'embedding',
  ): Promise<StorageQueryResult> {
    // Validate label and property name
    if (!isValidIdentifier(label)) {
      throw new ValidationError(`Invalid label: "${label}"`, 'label');
    }
    if (!isValidIdentifier(embeddingProperty)) {
      throw new ValidationError(
        `Invalid embedding property: "${embeddingProperty}"`,
        'embeddingProperty',
      );
    }

    return this.query(
      `MATCH (n:${label})
       WHERE n.${embeddingProperty} IS NOT NULL
       WITH n, vec.euclideanDistance(n.${embeddingProperty}, vecf32($embedding)) AS distance
       ORDER BY distance ASC
       LIMIT $limit
       RETURN n, distance`,
      { embedding, limit },
    );
  }

  /**
   * Get statistics about stored data
   */
  async getStatistics(): Promise<StorageStatistics> {
    const stats: StorageStatistics = {
      semantic_nodes: 0,
      temporal_nodes: 0,
      causal_nodes: 0,
      entity_nodes: 0,
      total_relationships: 0,
    };

    // If not connected, return zeros
    if (this.connectionState !== ConnectionState.Connected) {
      return stats;
    }

    try {
      const queries = [
        {
          key: 'semantic_nodes' as const,
          query: `MATCH (n) WHERE any(label IN labels(n) WHERE label STARTS WITH 'S_') RETURN count(n) as count`,
        },
        {
          key: 'temporal_nodes' as const,
          query: `MATCH (n) WHERE any(label IN labels(n) WHERE label STARTS WITH 'T_') RETURN count(n) as count`,
        },
        {
          key: 'causal_nodes' as const,
          query: `MATCH (n) WHERE any(label IN labels(n) WHERE label STARTS WITH 'C_') RETURN count(n) as count`,
        },
        {
          key: 'entity_nodes' as const,
          query: `MATCH (n) WHERE any(label IN labels(n) WHERE label STARTS WITH 'E_') RETURN count(n) as count`,
        },
        {
          key: 'total_relationships' as const,
          query: 'MATCH ()-[r]->() RETURN count(r) as count',
        },
      ];

      for (const { key, query } of queries) {
        try {
          const result = await this.query(query);
          stats[key] = (result.records[0]?.count as number) || 0;
        } catch (error) {
          // Log individual query failures but continue with other stats
          loggers.storage.warn(`Statistics query failed for ${key}`, {
            error: error instanceof Error ? error.message : String(error),
          });
          stats[key] = 0;
        }
      }
    } catch (error) {
      // Log overall stats failure but return zeros
      loggers.storage.warn('Failed to get statistics', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return stats;
  }

  /**
   * Clear all data from the graph
   */
  async clearGraph(): Promise<void> {
    const graph = this.requireConnection();

    try {
      await graph.query('MATCH (n) DETACH DELETE n');
    } catch (error) {
      throw new QueryError(
        'Failed to clear graph',
        'MATCH (n) DETACH DELETE n',
        error instanceof Error ? error : undefined,
      );
    }
  }

  // ============ Private Methods ============

  /**
   * Get the graph instance, throwing if not connected
   */
  private requireConnection(): Graph {
    if (this.connectionState !== ConnectionState.Connected || !this.graph) {
      throw new ConnectionError(
        'Not connected to FalkorDB. Call connect() first.',
      );
    }
    return this.graph;
  }

  /**
   * Parse FalkorDB node data into our NodeData format using Zod validation
   */
  private parseNodeData(data: unknown): NodeData | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    // Use Zod to parse and validate the FalkorDB node structure
    const nodeResult = FalkorDBNodeSchema.safeParse(data);
    if (!nodeResult.success) {
      return null;
    }

    const node = nodeResult.data;

    // Extract and validate uuid
    const uuid = node.properties.uuid;
    if (typeof uuid !== 'string') {
      return null;
    }

    // Validate UUID format (basic check)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      return null;
    }

    return {
      uuid,
      labels: node.labels,
      properties: node.properties,
    };
  }

  /**
   * Parse a specific value from FalkorDB metadata array
   */
  private parseMetadataValue(metadata: string[], key: string): number {
    const normalizedKey = key.toLowerCase().replace(/_/g, ' ');

    for (const line of metadata) {
      const match = line.match(/^(.+):\s*(\d+)/);
      if (match) {
        const metaKey = match[1].toLowerCase();
        if (metaKey.includes(normalizedKey)) {
          return Number.parseInt(match[2], 10);
        }
      }
    }

    return 0;
  }
}

// Re-export types for consumers
export type { NodeData, StorageQueryResult, StorageStatistics };
export { ConnectionState };
