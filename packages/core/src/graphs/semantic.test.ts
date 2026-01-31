import type { EmbeddingProvider } from '@polyg-mcp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import { EmbeddingGenerationError, GraphParseError } from './errors.js';
import { SemanticGraph } from './semantic.js';

// Mock FalkorDBAdapter
function createMockDb(): FalkorDBAdapter {
  return {
    query: vi.fn(),
    createNode: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as FalkorDBAdapter;
}

// Mock EmbeddingProvider
function createMockEmbeddings(): EmbeddingProvider {
  return {
    embed: vi.fn(),
    embedBatch: vi.fn(),
  };
}

// Helper to create a mock concept node
function mockConceptNode(props: Record<string, unknown> = {}) {
  return {
    properties: {
      uuid: 'concept-uuid-123',
      name: 'Test Concept',
      description: 'A test concept description',
      embedding: JSON.stringify([0.1, 0.2, 0.3, 0.4, 0.5]),
      ...props,
    },
  };
}

describe('SemanticGraph', () => {
  let db: FalkorDBAdapter;
  let embeddings: EmbeddingProvider;
  let graph: SemanticGraph;

  beforeEach(() => {
    db = createMockDb();
    embeddings = createMockEmbeddings();
    graph = new SemanticGraph(db, embeddings);
    vi.clearAllMocks();
  });

  describe('addConcept', () => {
    it('should create a new concept with embedding', async () => {
      vi.mocked(embeddings.embed).mockResolvedValue([0.1, 0.2, 0.3]);
      vi.mocked(db.createNode).mockResolvedValue('new-concept-uuid');

      const concept = await graph.addConcept('Machine Learning');

      expect(embeddings.embed).toHaveBeenCalledWith('Machine Learning');
      expect(db.createNode).toHaveBeenCalledWith('S_Concept', {
        name: 'Machine Learning',
        embedding: JSON.stringify([0.1, 0.2, 0.3]),
        created_at: expect.any(String),
      });
      expect(concept).toMatchObject({
        uuid: 'new-concept-uuid',
        name: 'Machine Learning',
        embedding: [0.1, 0.2, 0.3],
      });
    });

    it('should include description in embedding text', async () => {
      vi.mocked(embeddings.embed).mockResolvedValue([0.1, 0.2, 0.3]);
      vi.mocked(db.createNode).mockResolvedValue('uuid');

      await graph.addConcept('AI', 'Artificial Intelligence systems');

      expect(embeddings.embed).toHaveBeenCalledWith(
        'AI: Artificial Intelligence systems',
      );
      expect(db.createNode).toHaveBeenCalledWith(
        'S_Concept',
        expect.objectContaining({
          description: 'Artificial Intelligence systems',
        }),
      );
    });

    it('should throw EmbeddingGenerationError on embedding failure', async () => {
      vi.mocked(embeddings.embed).mockRejectedValue(new Error('API error'));

      await expect(graph.addConcept('Test')).rejects.toThrow(
        EmbeddingGenerationError,
      );
    });

    it('should throw on database error', async () => {
      vi.mocked(embeddings.embed).mockResolvedValue([0.1]);
      vi.mocked(db.createNode).mockRejectedValue(new Error('DB error'));

      await expect(graph.addConcept('Test')).rejects.toThrow(
        'Failed to add concept: Test',
      );
    });
  });

  describe('search', () => {
    it('should find similar concepts by query', async () => {
      vi.mocked(embeddings.embed).mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
      vi.mocked(db.query).mockResolvedValue({
        records: [
          { c: mockConceptNode({ name: 'Similar Concept 1' }) },
          { c: mockConceptNode({ name: 'Similar Concept 2' }) },
        ],
        metadata: [],
      });

      const results = await graph.search('test query');

      expect(embeddings.embed).toHaveBeenCalledWith('test query');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('concept');
      expect(results[0]).toHaveProperty('score');
    });

    it('should sort by similarity score descending', async () => {
      vi.mocked(embeddings.embed).mockResolvedValue([1, 0, 0, 0, 0]);
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            c: mockConceptNode({
              embedding: JSON.stringify([0.5, 0.5, 0, 0, 0]),
            }),
          },
          {
            c: mockConceptNode({ embedding: JSON.stringify([1, 0, 0, 0, 0]) }),
          },
        ],
        metadata: [],
      });

      const results = await graph.search('query');

      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });

    it('should respect limit parameter', async () => {
      vi.mocked(embeddings.embed).mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
      vi.mocked(db.query).mockResolvedValue({
        records: Array(20)
          .fill(null)
          .map(() => ({ c: mockConceptNode() })),
        metadata: [],
      });

      const results = await graph.search('query', 5);

      expect(results).toHaveLength(5);
    });

    it('should use default limit of 10', async () => {
      vi.mocked(embeddings.embed).mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
      vi.mocked(db.query).mockResolvedValue({
        records: Array(15)
          .fill(null)
          .map(() => ({ c: mockConceptNode() })),
        metadata: [],
      });

      const results = await graph.search('query');

      expect(results).toHaveLength(10);
    });

    it('should skip concepts without embeddings', async () => {
      vi.mocked(embeddings.embed).mockResolvedValue([0.1]);
      // Concept without embedding field - parseConcept returns undefined embedding
      const nodeWithoutEmbedding = {
        properties: {
          uuid: 'no-embed-uuid',
          name: 'No Embedding',
        },
      };
      vi.mocked(db.query).mockResolvedValue({
        records: [{ c: nodeWithoutEmbedding }, { c: mockConceptNode() }],
        metadata: [],
      });

      const results = await graph.search('query');

      expect(results).toHaveLength(1);
    });

    it('should throw EmbeddingGenerationError on embedding failure', async () => {
      vi.mocked(embeddings.embed).mockRejectedValue(new Error('API error'));

      await expect(graph.search('query')).rejects.toThrow(
        EmbeddingGenerationError,
      );
    });
  });

  describe('getConcept', () => {
    it('should return concept by UUID', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ c: mockConceptNode() }],
        metadata: [],
      });

      const concept = await graph.getConcept('uuid');

      expect(concept?.name).toBe('Test Concept');
      expect(concept?.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    it('should return null for nonexistent concept', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const concept = await graph.getConcept('nonexistent');

      expect(concept).toBeNull();
    });

    it('should parse embedding from JSON string', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            c: mockConceptNode({
              embedding: JSON.stringify([0.5, 0.6, 0.7]),
            }),
          },
        ],
        metadata: [],
      });

      const concept = await graph.getConcept('uuid');

      expect(concept?.embedding).toEqual([0.5, 0.6, 0.7]);
    });
  });

  describe('getConceptByName', () => {
    it('should return concept by name (case-insensitive)', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ c: mockConceptNode({ name: 'Machine Learning' }) }],
        metadata: [],
      });

      const concept = await graph.getConceptByName('machine learning');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('toLower'),
        expect.objectContaining({ name: 'machine learning' }),
      );
      expect(concept?.name).toBe('Machine Learning');
    });

    it('should return null when not found', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const concept = await graph.getConceptByName('Unknown');

      expect(concept).toBeNull();
    });
  });

  describe('getSimilar', () => {
    it('should find similar concepts to an existing concept', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          records: [{ c: mockConceptNode({ uuid: 'source-uuid' }) }],
          metadata: [],
        })
        .mockResolvedValueOnce({
          records: [
            { c: mockConceptNode({ uuid: 'similar-1', name: 'Similar 1' }) },
            { c: mockConceptNode({ uuid: 'similar-2', name: 'Similar 2' }) },
          ],
          metadata: [],
        });

      const similar = await graph.getSimilar('source-uuid');

      expect(similar.length).toBeGreaterThan(0);
      expect(db.query).toHaveBeenLastCalledWith(
        expect.stringContaining('uuid <> $uuid'),
        expect.any(Object),
      );
    });

    it('should return empty array for nonexistent concept', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const similar = await graph.getSimilar('nonexistent');

      expect(similar).toEqual([]);
    });

    it('should return empty array for concept without embedding', async () => {
      // Concept without embedding field - parseConcept returns undefined embedding
      const nodeWithoutEmbedding = {
        properties: {
          uuid: 'no-embed-uuid',
          name: 'No Embedding',
        },
      };
      vi.mocked(db.query).mockResolvedValue({
        records: [{ c: nodeWithoutEmbedding }],
        metadata: [],
      });

      const similar = await graph.getSimilar('uuid');

      expect(similar).toEqual([]);
    });
  });

  describe('linkToEntity', () => {
    it('should create cross-graph link to entity', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await graph.linkToEntity('concept-uuid', 'entity-uuid');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('X_REPRESENTS'),
        expect.objectContaining({
          conceptId: 'concept-uuid',
          entityId: 'entity-uuid',
        }),
      );
    });

    it('should throw RelationshipError on failure', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Link failed'));

      await expect(graph.linkToEntity('concept', 'entity')).rejects.toThrow(
        'Failed to link concept to entity',
      );
    });
  });

  describe('updateEmbedding', () => {
    it('should regenerate embedding for existing concept', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          records: [
            {
              c: mockConceptNode({
                name: 'Concept',
                description: 'Desc',
              }),
            },
          ],
          metadata: [],
        })
        .mockResolvedValueOnce({ records: [], metadata: [] });
      vi.mocked(embeddings.embed).mockResolvedValue([0.9, 0.8, 0.7]);

      const updated = await graph.updateEmbedding('uuid');

      expect(embeddings.embed).toHaveBeenCalledWith('Concept: Desc');
      expect(updated?.embedding).toEqual([0.9, 0.8, 0.7]);
    });

    it('should return null for nonexistent concept', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      const result = await graph.updateEmbedding('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw EmbeddingGenerationError on embedding failure', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ c: mockConceptNode() }],
        metadata: [],
      });
      vi.mocked(embeddings.embed).mockRejectedValue(new Error('API error'));

      await expect(graph.updateEmbedding('uuid')).rejects.toThrow(
        EmbeddingGenerationError,
      );
    });
  });

  describe('findOrCreate', () => {
    it('should return existing concept if found', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ c: mockConceptNode({ name: 'Existing' }) }],
        metadata: [],
      });

      const concept = await graph.findOrCreate('Existing');

      expect(concept.name).toBe('Existing');
      expect(embeddings.embed).not.toHaveBeenCalled();
    });

    it('should create new concept if not found', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });
      vi.mocked(embeddings.embed).mockResolvedValue([0.1, 0.2]);
      vi.mocked(db.createNode).mockResolvedValue('new-uuid');

      const concept = await graph.findOrCreate('New Concept', 'Description');

      expect(db.createNode).toHaveBeenCalled();
      expect(concept.name).toBe('New Concept');
    });
  });

  describe('deleteConcept', () => {
    it('should delete concept by UUID', async () => {
      vi.mocked(db.query).mockResolvedValue({ records: [], metadata: [] });

      await graph.deleteConcept('uuid');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        expect.objectContaining({ uuid: 'uuid' }),
      );
    });
  });

  describe('searchWithEntities', () => {
    it('should return enriched matches with linked entity IDs', async () => {
      vi.mocked(embeddings.embed).mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            c: mockConceptNode({ name: 'Concept 1' }),
            entityIds: ['entity-uuid-1', 'entity-uuid-2'],
            entityNames: ['Entity 1', 'Entity 2'],
          },
          {
            c: mockConceptNode({ name: 'Concept 2' }),
            entityIds: [],
            entityNames: [],
          },
        ],
        metadata: [],
      });

      const results = await graph.searchWithEntities('test query');

      expect(embeddings.embed).toHaveBeenCalledWith('test query');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('linkedEntityIds');
      expect(results[0]).toHaveProperty('linkedEntityNames');
    });

    it('should filter out null values from entity collections', async () => {
      vi.mocked(embeddings.embed).mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            c: mockConceptNode(),
            entityIds: ['entity-1', null, 'entity-2'],
            entityNames: ['Entity 1', null, 'Entity 2'],
          },
        ],
        metadata: [],
      });

      const results = await graph.searchWithEntities('query');

      expect(results[0].linkedEntityIds).toEqual(['entity-1', 'entity-2']);
      expect(results[0].linkedEntityNames).toEqual(['Entity 1', 'Entity 2']);
    });

    it('should respect limit parameter', async () => {
      vi.mocked(embeddings.embed).mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
      vi.mocked(db.query).mockResolvedValue({
        records: Array(20)
          .fill(null)
          .map(() => ({
            c: mockConceptNode(),
            entityIds: [],
            entityNames: [],
          })),
        metadata: [],
      });

      const results = await graph.searchWithEntities('query', 5);

      expect(results).toHaveLength(5);
    });

    it('should sort by score descending', async () => {
      vi.mocked(embeddings.embed).mockResolvedValue([1, 0, 0, 0, 0]);
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            c: mockConceptNode({ embedding: JSON.stringify([0.5, 0.5, 0, 0, 0]) }),
            entityIds: [],
            entityNames: [],
          },
          {
            c: mockConceptNode({ embedding: JSON.stringify([1, 0, 0, 0, 0]) }),
            entityIds: [],
            entityNames: [],
          },
        ],
        metadata: [],
      });

      const results = await graph.searchWithEntities('query');

      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });

    it('should throw EmbeddingGenerationError on embedding failure', async () => {
      vi.mocked(embeddings.embed).mockRejectedValue(new Error('API error'));

      await expect(graph.searchWithEntities('query')).rejects.toThrow(
        EmbeddingGenerationError,
      );
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', async () => {
      vi.mocked(embeddings.embed).mockResolvedValue([1, 0, 0]);
      vi.mocked(db.query).mockResolvedValue({
        records: [
          { c: mockConceptNode({ embedding: JSON.stringify([1, 0, 0]) }) },
        ],
        metadata: [],
      });

      const results = await graph.search('query');

      expect(results[0].score).toBeCloseTo(1);
    });

    it('should return 0 for orthogonal vectors', async () => {
      vi.mocked(embeddings.embed).mockResolvedValue([1, 0, 0]);
      vi.mocked(db.query).mockResolvedValue({
        records: [
          { c: mockConceptNode({ embedding: JSON.stringify([0, 1, 0]) }) },
        ],
        metadata: [],
      });

      const results = await graph.search('query');

      expect(results[0].score).toBeCloseTo(0);
    });

    it('should handle vectors of different lengths gracefully', async () => {
      vi.mocked(embeddings.embed).mockResolvedValue([1, 0]);
      vi.mocked(db.query).mockResolvedValue({
        records: [
          {
            c: mockConceptNode({ embedding: JSON.stringify([1, 0, 0, 0, 0]) }),
          },
        ],
        metadata: [],
      });

      const results = await graph.search('query');

      expect(results[0].score).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should wrap parse errors in GraphParseError', async () => {
      vi.mocked(db.query).mockResolvedValue({
        records: [{ c: { properties: {} } }], // Missing required fields
        metadata: [],
      });

      await expect(graph.getConcept('uuid')).rejects.toThrow(GraphParseError);
    });
  });
});
