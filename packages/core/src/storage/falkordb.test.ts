// Integration tests for FalkorDB adapter
// Requires running FalkorDB container: docker run -d -p 6379:6379 falkordb/falkordb
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ConnectionError,
  ConnectionState,
  FalkorDBAdapter,
  ValidationError,
} from './index.js';

const TEST_CONFIG = {
  host: 'localhost',
  port: 6379,
  graphName: 'polyg_test',
};

describe('FalkorDBAdapter', () => {
  let adapter: FalkorDBAdapter;

  beforeAll(async () => {
    adapter = new FalkorDBAdapter(TEST_CONFIG);
    try {
      await adapter.connect();
    } catch (error) {
      console.warn(
        'FalkorDB not available, skipping integration tests. Run: docker run -d -p 6379:6379 falkordb/falkordb',
      );
      throw error;
    }
  });

  afterAll(async () => {
    if (adapter) {
      await adapter.clearGraph();
      await adapter.disconnect();
    }
  });

  beforeEach(async () => {
    await adapter.clearGraph();
  });

  describe('connection', () => {
    it('should report healthy when connected', async () => {
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should report correct connection state', () => {
      expect(adapter.getConnectionState()).toBe(ConnectionState.Connected);
    });

    it('should handle double connect gracefully', async () => {
      await adapter.connect();
      expect(adapter.getConnectionState()).toBe(ConnectionState.Connected);
    });
  });

  describe('createNode', () => {
    it('should create a node and return its UUID', async () => {
      const uuid = await adapter.createNode('E_Entity', {
        name: 'Test Entity',
        entity_type: 'Person',
      });

      expect(uuid).toBeDefined();
      expect(typeof uuid).toBe('string');
      expect(uuid.length).toBe(36);
    });

    it('should create a node with all properties', async () => {
      const uuid = await adapter.createNode('E_Entity', {
        name: 'Alice',
        entity_type: 'Person',
        age: 30,
        active: true,
      });

      const node = await adapter.findNodeByUuid(uuid);
      expect(node).not.toBeNull();
      expect(node?.properties.name).toBe('Alice');
      expect(node?.properties.entity_type).toBe('Person');
      expect(node?.properties.age).toBe(30);
      expect(node?.properties.active).toBe(true);
    });

    it('should throw ValidationError for invalid label', async () => {
      await expect(
        adapter.createNode('Invalid-Label!', { name: 'Test' }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for label starting with number', async () => {
      await expect(
        adapter.createNode('123Label', { name: 'Test' }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('findNodeByUuid', () => {
    it('should find an existing node by UUID', async () => {
      const uuid = await adapter.createNode('E_Entity', {
        name: 'Bob',
        entity_type: 'Service',
      });

      const node = await adapter.findNodeByUuid(uuid);
      expect(node).not.toBeNull();
      expect(node?.properties.name).toBe('Bob');
      expect(node?.uuid).toBe(uuid);
      expect(node?.labels).toContain('E_Entity');
    });

    it('should return null for non-existent UUID', async () => {
      const node = await adapter.findNodeByUuid(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(node).toBeNull();
    });
  });

  describe('findNodesByLabel', () => {
    it('should find all nodes with a specific label', async () => {
      await adapter.createNode('E_Entity', { name: 'Entity1' });
      await adapter.createNode('E_Entity', { name: 'Entity2' });
      await adapter.createNode('S_Concept', { name: 'Concept1' });

      const entities = await adapter.findNodesByLabel('E_Entity');
      expect(entities.length).toBe(2);

      const concepts = await adapter.findNodesByLabel('S_Concept');
      expect(concepts.length).toBe(1);
    });

    it('should respect the limit parameter', async () => {
      await adapter.createNode('E_Entity', { name: 'Entity1' });
      await adapter.createNode('E_Entity', { name: 'Entity2' });
      await adapter.createNode('E_Entity', { name: 'Entity3' });

      const entities = await adapter.findNodesByLabel('E_Entity', 2);
      expect(entities.length).toBe(2);
    });

    it('should throw ValidationError for invalid label', async () => {
      await expect(adapter.findNodesByLabel('Invalid-Label!')).rejects.toThrow(
        ValidationError,
      );
    });
  });

  describe('createRelationship', () => {
    it('should create a relationship between two nodes', async () => {
      const uuid1 = await adapter.createNode('E_Entity', { name: 'Alice' });
      const uuid2 = await adapter.createNode('E_Entity', { name: 'Bob' });

      await adapter.createRelationship(uuid1, uuid2, 'KNOWS');

      const result = await adapter.query(
        'MATCH (a {uuid: $uuid1})-[r:KNOWS]->(b {uuid: $uuid2}) RETURN r',
        { uuid1, uuid2 },
      );

      expect(result.records.length).toBe(1);
    });

    it('should create a relationship with properties', async () => {
      const uuid1 = await adapter.createNode('E_Entity', { name: 'Alice' });
      const uuid2 = await adapter.createNode('E_Entity', { name: 'Bob' });

      await adapter.createRelationship(uuid1, uuid2, 'WORKS_WITH', {
        since: '2024-01-01',
        department: 'Engineering',
      });

      const result = await adapter.query(
        'MATCH (a {uuid: $uuid1})-[r:WORKS_WITH]->(b {uuid: $uuid2}) RETURN r.since as since, r.department as dept',
        { uuid1, uuid2 },
      );

      expect(result.records.length).toBe(1);
      expect(result.records[0].since).toBe('2024-01-01');
      expect(result.records[0].dept).toBe('Engineering');
    });

    it('should throw ValidationError for invalid relationship type', async () => {
      const uuid1 = await adapter.createNode('E_Entity', { name: 'Alice' });
      const uuid2 = await adapter.createNode('E_Entity', { name: 'Bob' });

      await expect(
        adapter.createRelationship(uuid1, uuid2, 'INVALID-TYPE!'),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteNode', () => {
    it('should delete a node by UUID and return true', async () => {
      const uuid = await adapter.createNode('E_Entity', { name: 'ToDelete' });

      const deleted = await adapter.deleteNode(uuid);
      expect(deleted).toBe(true);

      const node = await adapter.findNodeByUuid(uuid);
      expect(node).toBeNull();
    });

    it('should return false for non-existent node', async () => {
      const deleted = await adapter.deleteNode(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(deleted).toBe(false);
    });

    it('should delete a node and its relationships', async () => {
      const uuid1 = await adapter.createNode('E_Entity', { name: 'Alice' });
      const uuid2 = await adapter.createNode('E_Entity', { name: 'Bob' });
      await adapter.createRelationship(uuid1, uuid2, 'KNOWS');

      await adapter.deleteNode(uuid1);

      const result = await adapter.query(
        'MATCH ()-[r:KNOWS]->() RETURN count(r) as count',
      );
      expect(result.records[0].count).toBe(0);
    });
  });

  describe('query', () => {
    it('should execute a raw Cypher query', async () => {
      await adapter.createNode('E_Entity', { name: 'Test' });

      const result = await adapter.query(
        'MATCH (n:E_Entity) RETURN n.name as name',
      );

      expect(result.records.length).toBe(1);
      expect(result.records[0].name).toBe('Test');
    });

    it('should support parameterized queries', async () => {
      await adapter.createNode('E_Entity', { name: 'Alice', age: 30 });
      await adapter.createNode('E_Entity', { name: 'Bob', age: 25 });

      const result = await adapter.query(
        'MATCH (n:E_Entity) WHERE n.age > $minAge RETURN n.name as name',
        { minAge: 27 },
      );

      expect(result.records.length).toBe(1);
      expect(result.records[0].name).toBe('Alice');
    });

    it('should return metadata with query results', async () => {
      const result = await adapter.query(
        "CREATE (n:E_Entity {name: 'MetadataTest'}) RETURN n",
      );

      expect(result.metadata).toBeDefined();
      expect(Array.isArray(result.metadata)).toBe(true);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics for all graph types', async () => {
      await adapter.createNode('S_Concept', { name: 'Concept1' });
      await adapter.createNode('T_Event', { name: 'Event1' });
      await adapter.createNode('C_Node', { name: 'Cause1' });
      await adapter.createNode('E_Entity', { name: 'Entity1' });

      const stats = await adapter.getStatistics();

      expect(stats.semantic_nodes).toBe(1);
      expect(stats.temporal_nodes).toBe(1);
      expect(stats.causal_nodes).toBe(1);
      expect(stats.entity_nodes).toBe(1);
    });

    it('should count relationships', async () => {
      const uuid1 = await adapter.createNode('E_Entity', { name: 'A' });
      const uuid2 = await adapter.createNode('E_Entity', { name: 'B' });
      await adapter.createRelationship(uuid1, uuid2, 'RELATES_TO');

      const stats = await adapter.getStatistics();

      expect(stats.total_relationships).toBe(1);
    });
  });

  describe('clearGraph', () => {
    it('should remove all nodes and relationships', async () => {
      await adapter.createNode('E_Entity', { name: 'Entity1' });
      await adapter.createNode('E_Entity', { name: 'Entity2' });

      await adapter.clearGraph();

      const stats = await adapter.getStatistics();
      expect(stats.entity_nodes).toBe(0);
      expect(stats.total_relationships).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should throw ConnectionError when not connected', async () => {
      const disconnectedAdapter = new FalkorDBAdapter(TEST_CONFIG);

      await expect(disconnectedAdapter.query('RETURN 1')).rejects.toThrow(
        ConnectionError,
      );
    });

    it('should report unhealthy when not connected', async () => {
      const disconnectedAdapter = new FalkorDBAdapter(TEST_CONFIG);
      const healthy = await disconnectedAdapter.healthCheck();
      expect(healthy).toBe(false);
    });

    it('should return zeros from getStatistics when not connected', async () => {
      const disconnectedAdapter = new FalkorDBAdapter(TEST_CONFIG);
      const stats = await disconnectedAdapter.getStatistics();

      expect(stats.semantic_nodes).toBe(0);
      expect(stats.temporal_nodes).toBe(0);
      expect(stats.entity_nodes).toBe(0);
    });
  });
});
