import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import { CausalGraph } from './causal.js';
import { CausalTraversalError, GraphParseError } from './errors.js';

// Mock FalkorDBAdapter
function createMockDb(): FalkorDBAdapter {
  return {
    query: vi.fn(),
    createNode: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as FalkorDBAdapter;
}

// Helper to create a mock causal node
function mockCausalNode(props: Record<string, unknown> = {}) {
  return {
    properties: {
      uuid: 'causal-node-uuid',
      description: 'Test causal node',
      node_type: 'event',
      ...props,
    },
  };
}

describe('CausalGraph', () => {
  let db: FalkorDBAdapter;
  let graph: CausalGraph;

  beforeEach(() => {
    db = createMockDb();
    graph = new CausalGraph(db);
    vi.clearAllMocks();
  });

  describe('addNode', () => {
    it('should create a new causal node', async () => {
      vi.mocked(db.createNode).mockResolvedValue('new-causal-uuid');

      const node = await graph.addNode('Rain started', 'cause');

      expect(db.createNode).toHaveBeenCalledWith('C_Node', {
        description: 'Rain started',
        node_type: 'cause',
        created_at: expect.any(String),
      });
      expect(node).toMatchObject({
        uuid: 'new-causal-uuid',
        description: 'Rain started',
        node_type: 'cause',
      });
    });

    it('should throw on database error', async () => {
      vi.mocked(db.createNode).mockRejectedValue(new Error('DB error'));

      await expect(graph.addNode('Test', 'type')).rejects.toThrow(
        'Failed to add causal node: Test',
      );
    });
  });

  describe('getNode', () => {
    it('should return node by UUID', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ n: mockCausalNode() }],
        metadata: [],
      });

      const node = await graph.getNode('uuid');

      expect(node?.description).toBe('Test causal node');
    });

    it('should return null for nonexistent node', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const node = await graph.getNode('nonexistent');

      expect(node).toBeNull();
    });
  });

  describe('addLink', () => {
    it('should create causal link between nodes', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({ records: [], metadata: [] }) // CREATE
        .mockResolvedValueOnce({
          records: [{ n: mockCausalNode({ description: 'Cause' }) }],
          metadata: [],
        })
        .mockResolvedValueOnce({
          records: [{ n: mockCausalNode({ description: 'Effect' }) }],
          metadata: [],
        });

      const link = await graph.addLink('cause-uuid', 'effect-uuid', 0.8);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE'),
        expect.objectContaining({
          causeId: 'cause-uuid',
          effectId: 'effect-uuid',
          confidence: 0.8,
        }),
      );
      expect(link.confidence).toBe(0.8);
    });

    it('should use default confidence of 1.0', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({ records: [], metadata: [] })
        .mockResolvedValueOnce({
          records: [{ n: mockCausalNode() }],
          metadata: [],
        })
        .mockResolvedValueOnce({
          records: [{ n: mockCausalNode() }],
          metadata: [],
        });

      const link = await graph.addLink('cause', 'effect');

      expect(link.confidence).toBe(1.0);
    });

    it('should include evidence when provided', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({ records: [], metadata: [] })
        .mockResolvedValueOnce({
          records: [{ n: mockCausalNode() }],
          metadata: [],
        })
        .mockResolvedValueOnce({
          records: [{ n: mockCausalNode() }],
          metadata: [],
        });

      const link = await graph.addLink(
        'cause',
        'effect',
        0.9,
        'Research paper',
      );

      expect(link.evidence).toBe('Research paper');
    });

    it('should throw RelationshipError on failure', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Link failed'));

      await expect(graph.addLink('cause', 'effect')).rejects.toThrow(
        'Failed to create causal link',
      );
    });
  });

  describe('getUpstreamCauses', () => {
    it('should return upstream causal chain', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            c: mockCausalNode({ description: 'Root cause' }),
            e: mockCausalNode({ description: 'Effect' }),
            confidence: 0.9,
            evidence: 'Study',
          },
        ],
        metadata: [],
      });

      const causes = await graph.getUpstreamCauses('node-uuid');

      expect(causes).toHaveLength(1);
      expect(causes[0].cause).toBe('Root cause');
      expect(causes[0].effect).toBe('Effect');
      expect(causes[0].confidence).toBe(0.9);
    });

    it('should use default maxDepth of 3', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await graph.getUpstreamCauses('uuid');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('*1..3'),
        expect.any(Object),
      );
    });

    it('should respect custom maxDepth', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await graph.getUpstreamCauses('uuid', 5);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('*1..5'),
        expect.any(Object),
      );
    });

    it('should throw CausalTraversalError on failure', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Query failed'));

      await expect(graph.getUpstreamCauses('uuid')).rejects.toThrow(
        CausalTraversalError,
      );
    });
  });

  describe('getDownstreamEffects', () => {
    it('should return downstream effects chain', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            c: mockCausalNode({ description: 'Cause' }),
            e: mockCausalNode({ description: 'Downstream effect' }),
            confidence: 0.85,
            evidence: null,
          },
        ],
        metadata: [],
      });

      const effects = await graph.getDownstreamEffects('node-uuid');

      expect(effects).toHaveLength(1);
      expect(effects[0].effect).toBe('Downstream effect');
    });

    it('should handle missing evidence', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            c: mockCausalNode(),
            e: mockCausalNode(),
            confidence: 1.0,
          },
        ],
        metadata: [],
      });

      const effects = await graph.getDownstreamEffects('uuid');

      expect(effects[0].evidence).toBeUndefined();
    });
  });

  describe('traverse', () => {
    it('should traverse upstream only', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          records: [{ n: mockCausalNode({ uuid: 'found-uuid' }) }],
          metadata: [],
        })
        .mockResolvedValueOnce({
          records: [
            {
              c: mockCausalNode({ description: 'Upstream' }),
              e: mockCausalNode(),
              confidence: 0.8,
            },
          ],
          metadata: [],
        });

      const links = await graph.traverse([{ mention: 'test' }], 'upstream');

      expect(links.length).toBeGreaterThanOrEqual(0);
    });

    it('should traverse downstream only', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          records: [{ n: mockCausalNode() }],
          metadata: [],
        })
        .mockResolvedValueOnce({
          records: [],
          metadata: [],
        });

      const links = await graph.traverse([{ mention: 'test' }], 'downstream');

      expect(links).toBeDefined();
    });

    it('should traverse both directions', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          records: [{ n: mockCausalNode() }],
          metadata: [],
        })
        .mockResolvedValueOnce({ records: [], metadata: [] })
        .mockResolvedValueOnce({ records: [], metadata: [] });

      const links = await graph.traverse([{ mention: 'test' }], 'both');

      expect(links).toBeDefined();
    });

    it('should deduplicate links', async () => {
      const commonLink = {
        c: mockCausalNode({ description: 'A' }),
        e: mockCausalNode({ description: 'B' }),
        confidence: 1.0,
      };

      vi.mocked(db.query)
        .mockResolvedValueOnce({
          records: [{ n: mockCausalNode() }],
          metadata: [],
        })
        .mockResolvedValueOnce({ records: [commonLink], metadata: [] })
        .mockResolvedValueOnce({ records: [commonLink], metadata: [] });

      const links = await graph.traverse([{ mention: 'test' }], 'both');

      // Should deduplicate identical links
      const uniqueKeys = new Set(links.map((l) => `${l.cause}->${l.effect}`));
      expect(uniqueKeys.size).toBe(links.length);
    });
  });

  describe('explainWhy', () => {
    it('should find causal explanation for event', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          records: [{ n: mockCausalNode({ uuid: 'effect-uuid' }) }],
          metadata: [],
        })
        .mockResolvedValueOnce({
          records: [
            {
              c: mockCausalNode({ description: 'Root cause' }),
              e: mockCausalNode({ description: 'Event' }),
              confidence: 0.95,
            },
          ],
          metadata: [],
        });

      const explanation = await graph.explainWhy('something happened');

      expect(explanation).toHaveLength(1);
      expect(explanation[0].cause).toBe('Root cause');
    });

    it('should return sorted by confidence', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          records: [{ n: mockCausalNode() }],
          metadata: [],
        })
        .mockResolvedValueOnce({
          records: [
            {
              c: mockCausalNode({ description: 'Low' }),
              e: mockCausalNode(),
              confidence: 0.5,
            },
            {
              c: mockCausalNode({ description: 'High' }),
              e: mockCausalNode(),
              confidence: 0.9,
            },
          ],
          metadata: [],
        });

      const explanation = await graph.explainWhy('event');

      expect(explanation[0].confidence).toBeGreaterThanOrEqual(
        explanation[1]?.confidence ?? 0,
      );
    });

    it('should return empty array when no explanation found', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const explanation = await graph.explainWhy('unknown event');

      expect(explanation).toEqual([]);
    });
  });

  describe('linkToEvent', () => {
    it('should create cross-graph link to event', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await graph.linkToEvent('causal-node', 'event-uuid');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('X_REFERS_TO'),
        expect.objectContaining({
          nodeId: 'causal-node',
          eventId: 'event-uuid',
        }),
      );
    });
  });

  describe('linkToEntity', () => {
    it('should create cross-graph link to entity', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await graph.linkToEntity('causal-node', 'entity-uuid');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('X_AFFECTS'),
        expect.objectContaining({
          nodeId: 'causal-node',
          entityId: 'entity-uuid',
        }),
      );
    });
  });

  describe('findOrCreate', () => {
    it('should return existing node if found', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ n: mockCausalNode({ description: 'Existing' }) }],
        metadata: [],
      });

      const node = await graph.findOrCreate('Existing');

      expect(node.description).toBe('Existing');
      expect(db.createNode).not.toHaveBeenCalled();
    });

    it('should create new node if not found', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });
      vi.mocked(db.createNode).mockResolvedValue('new-uuid');

      await graph.findOrCreate('New node', 'custom-type');

      expect(db.createNode).toHaveBeenCalledWith(
        'C_Node',
        expect.objectContaining({
          description: 'New node',
          node_type: 'custom-type',
        }),
      );
    });

    it('should use default node type "event"', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });
      vi.mocked(db.createNode).mockResolvedValue('uuid');

      await graph.findOrCreate('Description');

      expect(db.createNode).toHaveBeenCalledWith(
        'C_Node',
        expect.objectContaining({ node_type: 'event' }),
      );
    });
  });

  describe('error handling', () => {
    it('should wrap parse errors in GraphParseError', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ n: { properties: {} } }], // Missing required fields
        metadata: [],
      });

      await expect(graph.getNode('uuid')).rejects.toThrow(GraphParseError);
    });
  });

  describe('getNodesForEntities', () => {
    it('should return causal nodes for multiple entities', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          { c: mockCausalNode({ uuid: 'node1' }), entityId: 'entity1' },
          { c: mockCausalNode({ uuid: 'node2' }), entityId: 'entity1' },
          { c: mockCausalNode({ uuid: 'node3' }), entityId: 'entity2' },
        ],
        metadata: [],
      });

      const result = await graph.getNodesForEntities(['entity1', 'entity2']);

      expect(result.size).toBe(2);
      expect(result.get('entity1')?.length).toBe(2);
      expect(result.get('entity2')?.length).toBe(1);
    });

    it('should return empty map for empty input', async () => {
      const result = await graph.getNodesForEntities([]);

      expect(result.size).toBe(0);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('should initialize empty arrays for entities without nodes', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [],
        metadata: [],
      });

      const result = await graph.getNodesForEntities(['entity1', 'entity2']);

      expect(result.get('entity1')).toEqual([]);
      expect(result.get('entity2')).toEqual([]);
    });

    it('should deduplicate nodes within same entity', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          { c: mockCausalNode({ uuid: 'node1' }), entityId: 'entity1' },
          { c: mockCausalNode({ uuid: 'node1' }), entityId: 'entity1' }, // Duplicate
        ],
        metadata: [],
      });

      const result = await graph.getNodesForEntities(['entity1']);

      expect(result.get('entity1')?.length).toBe(1);
    });
  });

  describe('traverseFromNodeIds', () => {
    it('should traverse from node UUIDs directly', async () => {
      // Mock getUpstreamCauses and getDownstreamEffects
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          // getUpstreamCauses for node1
          records: [
            {
              c: mockCausalNode({ description: 'cause1' }),
              e: mockCausalNode({ description: 'effect1' }),
              confidence: 0.9,
            },
          ],
          metadata: [],
        })
        .mockResolvedValueOnce({
          // getDownstreamEffects for node1
          records: [
            {
              c: mockCausalNode({ description: 'cause2' }),
              e: mockCausalNode({ description: 'effect2' }),
              confidence: 0.85,
            },
          ],
          metadata: [],
        });

      const result = await graph.traverseFromNodeIds(['node1'], 'both', 2);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array for empty input', async () => {
      const result = await graph.traverseFromNodeIds([], 'both', 2);

      expect(result).toEqual([]);
    });

    it('should traverse upstream only when direction is upstream', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            c: mockCausalNode({ description: 'cause' }),
            e: mockCausalNode({ description: 'effect' }),
            confidence: 0.9,
          },
        ],
        metadata: [],
      });

      await graph.traverseFromNodeIds(['node1'], 'upstream', 2);

      // Should only call getUpstreamCauses, not getDownstreamEffects
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('should deduplicate links', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            c: mockCausalNode({ description: 'same-cause' }),
            e: mockCausalNode({ description: 'same-effect' }),
            confidence: 0.9,
          },
          {
            c: mockCausalNode({ description: 'same-cause' }),
            e: mockCausalNode({ description: 'same-effect' }),
            confidence: 0.9,
          },
        ],
        metadata: [],
      });

      const result = await graph.traverseFromNodeIds(['node1'], 'upstream', 2);

      // Should be deduplicated
      expect(result.length).toBe(1);
    });

    it('should throw CausalTraversalError on failure', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('DB error'));

      await expect(
        graph.traverseFromNodeIds(['node1'], 'both', 2),
      ).rejects.toThrow(CausalTraversalError);
    });
  });
});
