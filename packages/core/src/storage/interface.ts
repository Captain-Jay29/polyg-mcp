// Storage interface - abstracts the underlying database implementation
// Types are imported from shared package (Zod-validated)

export type {
  ConnectionState,
  NodeData,
  StorageQueryResult,
  StorageStatistics,
} from '@polyg-mcp/shared';

// Re-export schemas for validation
export {
  ConnectionStateSchema,
  FalkorDBNodeSchema,
  NodeDataSchema,
  StorageQueryResultSchema,
  StorageStatisticsSchema,
} from '@polyg-mcp/shared';

// Import types for interface definition
import type {
  ConnectionState,
  NodeData,
  StorageQueryResult,
  StorageStatistics,
} from '@polyg-mcp/shared';

/**
 * Storage adapter interface - implement this to support different databases
 */
export interface IStorageAdapter {
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<boolean>;
  getConnectionState(): ConnectionState;

  // Raw query execution
  query(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<StorageQueryResult>;

  // Node operations
  createNode(
    label: string,
    properties: Record<string, unknown>,
  ): Promise<string>;

  findNodeByUuid(uuid: string): Promise<NodeData | null>;

  findNodesByLabel(label: string, limit?: number): Promise<NodeData[]>;

  deleteNode(uuid: string): Promise<boolean>;

  // Relationship operations
  createRelationship(
    fromUuid: string,
    toUuid: string,
    type: string,
    properties?: Record<string, unknown>,
  ): Promise<void>;

  // Search operations
  vectorSearch(
    embedding: number[],
    label: string,
    limit: number,
    embeddingProperty?: string,
  ): Promise<StorageQueryResult>;

  // Utility operations
  getStatistics(): Promise<StorageStatistics>;
  clearGraph(): Promise<void>;
}

/**
 * Valid characters for Cypher identifiers (labels, relationship types)
 */
const VALID_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validate a Cypher identifier (label or relationship type)
 * Prevents Cypher injection attacks
 */
export function isValidIdentifier(identifier: string): boolean {
  return VALID_IDENTIFIER_REGEX.test(identifier) && identifier.length <= 128;
}

/**
 * Sanitize a string for use as a Cypher identifier
 * Returns null if the string cannot be sanitized
 */
export function sanitizeIdentifier(identifier: string): string | null {
  if (!identifier || typeof identifier !== 'string') {
    return null;
  }

  // Remove any characters that aren't alphanumeric or underscore
  const sanitized = identifier.replace(/[^a-zA-Z0-9_]/g, '_');

  // Ensure it starts with a letter or underscore
  const result = sanitized.match(/^[0-9]/) ? `_${sanitized}` : sanitized;

  // Validate the result
  if (isValidIdentifier(result)) {
    return result;
  }

  return null;
}
