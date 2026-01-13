// Integration tests for FalkorDB adapter
// Requires running FalkorDB container: docker run -d -p 6379:6379 falkordb/falkordb
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FalkorDBAdapter } from './falkordb.js';

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
    // Clear the graph before each test
    await adapter.clearGraph();
  });

  describe('connection', () => {
    it('should report healthy when connected', async () => {
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
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
      expect(uuid.length).toBe(36); // UUID format
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
      expect(node?.name).toBe('Alice');
      expect(node?.entity_type).toBe('Person');
      expect(node?.age).toBe(30);
      expect(node?.active).toBe(true);
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
      expect(node?.name).toBe('Bob');
      expect(node?.uuid).toBe(uuid);
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
  });

  describe('deleteNode', () => {
    it('should delete a node by UUID', async () => {
      const uuid = await adapter.createNode('E_Entity', { name: 'ToDelete' });

      await adapter.deleteNode(uuid);

      const node = await adapter.findNodeByUuid(uuid);
      expect(node).toBeNull();
    });

    it('should delete a node and its relationships', async () => {
      const uuid1 = await adapter.createNode('E_Entity', { name: 'Alice' });
      const uuid2 = await adapter.createNode('E_Entity', { name: 'Bob' });
      await adapter.createRelationship(uuid1, uuid2, 'KNOWS');

      await adapter.deleteNode(uuid1);

      // Verify relationship is also gone
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
        `CREATE (n:E_Entity {name: 'MetadataTest'}) RETURN n`,
      );

      expect(result.metadata).toBeDefined();
      expect(Array.isArray(result.metadata)).toBe(true);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics for all graph types', async () => {
      // Create nodes with different prefixes
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
});
