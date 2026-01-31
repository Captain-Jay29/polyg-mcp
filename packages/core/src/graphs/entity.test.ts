import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import { EntityGraph } from './entity.js';
import { EntityNotFoundError, GraphParseError } from './errors.js';

// Mock FalkorDBAdapter
function createMockDb(): FalkorDBAdapter {
  return {
    query: vi.fn(),
    createNode: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as FalkorDBAdapter;
}

// Helper to create a mock FalkorDB node
function mockNode(props: Record<string, unknown>) {
  return {
    properties: {
      uuid: 'test-uuid-123',
      name: 'Test Entity',
      entity_type: 'person',
      properties: '{}',
      created_at: '2024-01-01T00:00:00.000Z',
      ...props,
    },
  };
}

describe('EntityGraph', () => {
  let db: FalkorDBAdapter;
  let graph: EntityGraph;

  beforeEach(() => {
    db = createMockDb();
    graph = new EntityGraph(db);
    vi.clearAllMocks();
  });

  describe('addEntity', () => {
    it('should create a new entity with basic properties', async () => {
      vi.mocked(db.createNode).mockResolvedValue('generated-uuid');

      const entity = await graph.addEntity('Alice', 'person');

      expect(db.createNode).toHaveBeenCalledWith('E_Entity', {
        name: 'Alice',
        entity_type: 'person',
        properties: '{}',
        created_at: expect.any(String),
      });
      expect(entity).toMatchObject({
        uuid: 'generated-uuid',
        name: 'Alice',
        entity_type: 'person',
        properties: {},
      });
    });

    it('should create an entity with custom properties', async () => {
      vi.mocked(db.createNode).mockResolvedValue('uuid-with-props');

      const entity = await graph.addEntity('Acme Inc', 'company', {
        industry: 'tech',
        employees: 100,
      });

      expect(db.createNode).toHaveBeenCalledWith('E_Entity', {
        name: 'Acme Inc',
        entity_type: 'company',
        properties: JSON.stringify({ industry: 'tech', employees: 100 }),
        created_at: expect.any(String),
      });
      expect(entity.properties).toEqual({ industry: 'tech', employees: 100 });
    });

    it('should throw on database error', async () => {
      vi.mocked(db.createNode).mockRejectedValue(new Error('DB Error'));

      await expect(graph.addEntity('Test', 'type')).rejects.toThrow(
        'Failed to add entity: Test',
      );
    });
  });

  describe('getEntity', () => {
    it('should find entity by UUID', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({
        records: [{ n: mockNode({ uuid: 'uuid-123' }) }],
        metadata: [],
      });

      const entity = await graph.getEntity('uuid-123');

      expect(entity).toMatchObject({
        uuid: 'uuid-123',
        name: 'Test Entity',
        entity_type: 'person',
      });
    });

    it('should find entity by name when UUID not found', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({ records: [], metadata: [] }) // UUID search
        .mockResolvedValueOnce({
          // Name search
          records: [{ n: mockNode({ name: 'Alice' }) }],
          metadata: [],
        });

      const entity = await graph.getEntity('Alice');

      expect(db.query).toHaveBeenCalledTimes(2);
      expect(entity?.name).toBe('Alice');
    });

    it('should return null when entity not found', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const entity = await graph.getEntity('nonexistent');

      expect(entity).toBeNull();
    });

    it('should parse JSON properties', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({
        records: [
          {
            n: mockNode({
              properties: JSON.stringify({ role: 'admin', active: true }),
            }),
          },
        ],
        metadata: [],
      });

      const entity = await graph.getEntity('uuid');

      expect(entity?.properties).toEqual({ role: 'admin', active: true });
    });

    it('should handle invalid JSON properties gracefully', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({
        records: [{ n: mockNode({ properties: 'invalid-json' }) }],
        metadata: [],
      });

      const entity = await graph.getEntity('uuid');

      expect(entity?.properties).toEqual({});
    });
  });

  describe('updateEntity', () => {
    it('should merge properties on existing entity', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          records: [{ n: mockNode({ properties: '{"a":1}' }) }],
          metadata: [],
        })
        .mockResolvedValueOnce({ records: [], metadata: [] });

      const updated = await graph.updateEntity('uuid', { b: 2 });

      expect(updated.properties).toEqual({ a: 1, b: 2 });
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('SET'), {
        uuid: 'test-uuid-123',
        properties: JSON.stringify({ a: 1, b: 2 }),
      });
    });

    it('should throw EntityNotFoundError when entity does not exist', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await expect(graph.updateEntity('nonexistent', {})).rejects.toThrow(
        EntityNotFoundError,
      );
    });
  });

  describe('deleteEntity', () => {
    it('should delete entity and its relationships', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          records: [{ n: mockNode({}) }],
          metadata: [],
        })
        .mockResolvedValueOnce({ records: [], metadata: [] });

      await graph.deleteEntity('uuid');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        expect.any(Object),
      );
    });

    it('should throw EntityNotFoundError when entity does not exist', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await expect(graph.deleteEntity('nonexistent')).rejects.toThrow(
        EntityNotFoundError,
      );
    });
  });

  describe('linkEntities', () => {
    it('should create relationship between two entities', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          records: [{ n: mockNode({ uuid: 'source-uuid' }) }],
          metadata: [],
        })
        .mockResolvedValueOnce({
          records: [{ n: mockNode({ uuid: 'target-uuid' }) }],
          metadata: [],
        })
        .mockResolvedValueOnce({ records: [], metadata: [] });

      await graph.linkEntities('source', 'target', 'WORKS_FOR');

      expect(db.query).toHaveBeenLastCalledWith(
        expect.stringContaining('CREATE'),
        expect.objectContaining({
          relType: 'WORKS_FOR',
        }),
      );
    });

    it('should throw when source entity not found', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await expect(
        graph.linkEntities('nonexistent', 'target', 'REL'),
      ).rejects.toThrow(EntityNotFoundError);
    });

    it('should throw when target entity not found', async () => {
      // First query returns source (UUID search)
      // Second query returns empty (UUID search for source name)
      // Third query returns source found by name
      // Fourth query returns empty (UUID search for target)
      // Fifth query returns empty (name search for target)
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          records: [{ n: mockNode({ uuid: 'source-uuid', name: 'Source' }) }],
          metadata: [],
        })
        .mockResolvedValueOnce({ records: [], metadata: [] }) // target UUID search
        .mockResolvedValueOnce({ records: [], metadata: [] }); // target name search

      await expect(
        graph.linkEntities('source-uuid', 'nonexistent', 'REL'),
      ).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('getRelationships', () => {
    it('should return both incoming and outgoing relationships', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          records: [{ n: mockNode({ uuid: 'entity-uuid' }) }],
          metadata: [],
        })
        .mockResolvedValueOnce({
          records: [
            {
              s: mockNode({ uuid: 's1', name: 'Source' }),
              t: mockNode({ uuid: 't1', name: 'Target' }),
              relType: 'MANAGES',
            },
          ],
          metadata: [],
        })
        .mockResolvedValueOnce({
          records: [
            {
              s: mockNode({ uuid: 's2', name: 'Manager' }),
              t: mockNode({ uuid: 'entity-uuid', name: 'Employee' }),
              relType: 'SUPERVISES',
            },
          ],
          metadata: [],
        });

      const relationships = await graph.getRelationships('entity-uuid');

      expect(relationships).toHaveLength(2);
      expect(relationships[0].relationshipType).toBe('MANAGES');
      expect(relationships[1].relationshipType).toBe('SUPERVISES');
    });

    it('should throw EntityNotFoundError for nonexistent entity', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await expect(graph.getRelationships('nonexistent')).rejects.toThrow(
        EntityNotFoundError,
      );
    });
  });

  describe('search', () => {
    it('should search entities by name', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          { n: mockNode({ name: 'Alice' }) },
          { n: mockNode({ name: 'Alison' }) },
        ],
        metadata: [],
      });

      const results = await graph.search('Ali');

      expect(results).toHaveLength(2);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('toLower'),
        expect.objectContaining({ query: 'Ali' }),
      );
    });

    it('should filter by entity type when provided', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ n: mockNode({ entity_type: 'person' }) }],
        metadata: [],
      });

      await graph.search('test', 'person');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('entity_type'),
        expect.objectContaining({ type: 'person' }),
      );
    });
  });

  describe('resolve', () => {
    it('should resolve entity mentions to actual entities', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          records: [{ n: mockNode({ name: 'Alice' }) }],
          metadata: [],
        })
        .mockResolvedValueOnce({ records: [], metadata: [] })
        .mockResolvedValueOnce({
          records: [{ n: mockNode({ name: 'Bob' }) }],
          metadata: [],
        });

      const resolved = await graph.resolve([
        { mention: 'Alice' },
        { mention: 'Bob', type: 'person' },
      ]);

      expect(resolved).toHaveLength(2);
    });

    it('should skip unresolved mentions', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const resolved = await graph.resolve([{ mention: 'Unknown' }]);

      expect(resolved).toHaveLength(0);
    });
  });

  describe('getByType', () => {
    it('should return all entities of a given type', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          { n: mockNode({ entity_type: 'company' }) },
          { n: mockNode({ entity_type: 'company' }) },
        ],
        metadata: [],
      });

      const entities = await graph.getByType('company');

      expect(entities).toHaveLength(2);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('entity_type'),
        expect.objectContaining({ type: 'company', limit: 100 }),
      );
    });

    it('should respect the limit parameter', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await graph.getByType('type', 50);

      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ limit: 50 }),
      );
    });
  });

  describe('error handling', () => {
    it('should wrap parse errors in GraphParseError', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ n: { properties: {} } }], // Missing required fields
        metadata: [],
      });

      await expect(graph.getEntity('uuid')).rejects.toThrow(GraphParseError);
    });
  });

  describe('getRelationshipsBatch', () => {
    it('should return relationships for multiple entities', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            s: mockNode({ uuid: 'entity1', name: 'Entity 1' }),
            t: mockNode({ uuid: 'entity2', name: 'Entity 2' }),
            relType: 'WORKS_WITH',
          },
          {
            s: mockNode({ uuid: 'entity2', name: 'Entity 2' }),
            t: mockNode({ uuid: 'entity3', name: 'Entity 3' }),
            relType: 'MANAGES',
          },
        ],
        metadata: [],
      });

      const result = await graph.getRelationshipsBatch(['entity1', 'entity2']);

      expect(result.size).toBe(2);
      expect(result.get('entity1')).toBeDefined();
      expect(result.get('entity2')).toBeDefined();
    });

    it('should return empty map for empty input', async () => {
      const result = await graph.getRelationshipsBatch([]);

      expect(result.size).toBe(0);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('should initialize empty arrays for entities without relationships', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [],
        metadata: [],
      });

      const result = await graph.getRelationshipsBatch(['entity1', 'entity2']);

      expect(result.get('entity1')).toEqual([]);
      expect(result.get('entity2')).toEqual([]);
    });

    it('should add relationship to both source and target if both are in query', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            s: mockNode({ uuid: 'entity1', name: 'Entity 1' }),
            t: mockNode({ uuid: 'entity2', name: 'Entity 2' }),
            relType: 'RELATES',
          },
        ],
        metadata: [],
      });

      const result = await graph.getRelationshipsBatch(['entity1', 'entity2']);

      expect(result.get('entity1')?.length).toBe(1);
      expect(result.get('entity2')?.length).toBe(1);
    });

    it('should throw on database error', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('DB error'));

      await expect(
        graph.getRelationshipsBatch(['entity1']),
      ).rejects.toThrow('Failed to get relationships batch');
    });
  });
});
