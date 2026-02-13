import type { EmbeddingProvider, LLMProvider } from '@polyg-mcp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import { CONVERSATION_PROFILE } from './profiles.js';
import { runSlowPath } from './slow-path.js';
import type {
  ChunkExtraction,
  FastPathResult,
  IngestionDeps,
  ParsedChunk,
} from './types.js';

/**
 * Create a mock DB that tracks created nodes so entity lookups work.
 * EntityGraph.linkEntities calls getEntity(uuid) internally, which needs
 * to find the entity node created by addEntity.
 */
function createMockDb(): FalkorDBAdapter {
  let nodeCounter = 0;
  const createdNodes = new Map<
    string,
    { uuid: string; label: string; props: Record<string, unknown> }
  >();

  const mockQuery = vi
    .fn()
    .mockImplementation(
      async (cypher: string, params: Record<string, unknown>) => {
        // Entity lookup by UUID (used by getEntity → linkEntities)
        if (
          typeof cypher === 'string' &&
          cypher.includes('E_Entity') &&
          cypher.includes('{uuid: $id}')
        ) {
          const id = params.id as string;
          const node = createdNodes.get(id);
          if (node) {
            return {
              records: [
                {
                  n: {
                    properties: {
                      uuid: node.uuid,
                      ...node.props,
                    },
                  },
                },
              ],
              metadata: [],
            };
          }
        }
        // Entity dedup check by name+type (used by addEntity)
        if (
          typeof cypher === 'string' &&
          cypher.includes('E_Entity') &&
          cypher.includes('{name: $name')
        ) {
          const name = params.name as string;
          const type = params.entityType as string;
          for (const node of createdNodes.values()) {
            if (
              node.label === 'E_Entity' &&
              node.props.name === name &&
              node.props.entity_type === type
            ) {
              return {
                records: [
                  {
                    n: {
                      properties: {
                        uuid: node.uuid,
                        ...node.props,
                      },
                    },
                  },
                ],
                metadata: [],
              };
            }
          }
        }
        // Causal node lookup by description (used by findOrCreate)
        if (
          typeof cypher === 'string' &&
          cypher.includes('C_Node') &&
          cypher.includes('toLower')
        ) {
          const desc = params.desc as string;
          for (const node of createdNodes.values()) {
            if (
              node.label === 'C_Node' &&
              (node.props.description as string).toLowerCase() ===
                desc.toLowerCase()
            ) {
              return {
                records: [
                  {
                    n: {
                      properties: {
                        uuid: node.uuid,
                        ...node.props,
                      },
                    },
                  },
                ],
                metadata: [],
              };
            }
          }
        }
        return { records: [], metadata: [] };
      },
    );

  return {
    query: mockQuery,
    createNode: vi
      .fn()
      .mockImplementation((label: string, props: Record<string, unknown>) => {
        nodeCounter++;
        const uuid = `uuid-${nodeCounter}`;
        createdNodes.set(uuid, { uuid, label, props });
        return Promise.resolve(uuid);
      }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as FalkorDBAdapter;
}

function createMockEmbeddings(): EmbeddingProvider {
  return {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2]]),
  };
}

const validExtraction: ChunkExtraction = {
  entities: [
    { name: 'Alice', entity_type: 'person' },
    { name: 'Acme Corp', entity_type: 'organization' },
  ],
  relationships: [
    { source: 'Alice', target: 'Acme Corp', relationship_type: 'works_at' },
  ],
  causal_links: [
    {
      cause: 'Alice joined Acme',
      effect: 'Team expanded',
      confidence: 0.9,
      entities: ['Alice'],
    },
  ],
  facts: [
    {
      subject: 'Alice',
      predicate: 'employer',
      object: 'Acme Corp',
      valid_from: '2024-01-01T00:00:00Z',
      subject_entity: 'Alice',
    },
  ],
};

function makeChunks(count: number): ParsedChunk[] {
  return Array.from({ length: count }, (_, i) => ({
    chunk_id: `chunk_${i.toString().padStart(3, '0')}`,
    content: `Message ${i}`,
    position: i,
    metadata: {
      source_format: 'conversation' as const,
      speaker: 'Alice',
      turn_index: i,
    },
  }));
}

function makeFastResult(count: number): FastPathResult {
  return {
    eventIds: Array.from({ length: count }, (_, i) => `event-${i}`),
    conceptIds: Array.from({ length: count }, (_, i) => `concept-${i}`),
    embeddingTimeMs: 10,
    writeTimeMs: 20,
  };
}

describe('runSlowPath', () => {
  let db: FalkorDBAdapter;
  let llm: LLMProvider;
  let deps: IngestionDeps;

  beforeEach(() => {
    db = createMockDb();
    llm = {
      complete: vi.fn().mockResolvedValue(JSON.stringify(validExtraction)),
    };
    deps = {
      db,
      llm,
      embeddings: createMockEmbeddings(),
    } as unknown as IngestionDeps;
    vi.clearAllMocks();
  });

  it('should extract and write graph data for each chunk', async () => {
    const chunks = makeChunks(2);
    const fastResult = makeFastResult(2);

    const result = await runSlowPath(
      chunks,
      fastResult,
      CONVERSATION_PROFILE,
      deps,
    );

    expect(result.extractedChunks).toBe(2);
    expect(result.skippedChunks).toBe(0);
    expect(result.entities_created).toBeGreaterThan(0);
    expect(result.relationships_created).toBeGreaterThan(0);
    expect(result.facts_created).toBeGreaterThan(0);
    expect(result.causal_links_created).toBeGreaterThan(0);
  });

  it('should call LLM once per chunk', async () => {
    const chunks = makeChunks(3);
    const fastResult = makeFastResult(3);

    await runSlowPath(chunks, fastResult, CONVERSATION_PROFILE, deps);

    expect(llm.complete).toHaveBeenCalledTimes(3);
  });

  it('should retry once on LLM failure then skip', async () => {
    vi.mocked(llm.complete).mockRejectedValue(new Error('LLM error'));

    const chunks = makeChunks(1);
    const fastResult = makeFastResult(1);

    const result = await runSlowPath(
      chunks,
      fastResult,
      CONVERSATION_PROFILE,
      deps,
    );

    // 2 attempts per chunk
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(result.skippedChunks).toBe(1);
    expect(result.skippedChunkIds).toEqual(['chunk_000']);
    expect(result.extractedChunks).toBe(0);
  });

  it('should succeed on retry after first failure', async () => {
    vi.mocked(llm.complete)
      .mockRejectedValueOnce(new Error('Transient error'))
      .mockResolvedValueOnce(JSON.stringify(validExtraction));

    const chunks = makeChunks(1);
    const fastResult = makeFastResult(1);

    const result = await runSlowPath(
      chunks,
      fastResult,
      CONVERSATION_PROFILE,
      deps,
    );

    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(result.extractedChunks).toBe(1);
    expect(result.skippedChunks).toBe(0);
  });

  it('should skip chunks with invalid LLM JSON', async () => {
    vi.mocked(llm.complete).mockResolvedValue('not valid json');

    const chunks = makeChunks(1);
    const fastResult = makeFastResult(1);

    const result = await runSlowPath(
      chunks,
      fastResult,
      CONVERSATION_PROFILE,
      deps,
    );

    expect(result.skippedChunks).toBe(1);
    expect(result.extractedChunks).toBe(0);
  });

  it('should accumulate entity map across chunks', async () => {
    // First chunk creates Alice, second chunk references Alice again
    const extraction1: ChunkExtraction = {
      entities: [{ name: 'Alice', entity_type: 'person' }],
      relationships: [],
      causal_links: [],
      facts: [],
    };
    const extraction2: ChunkExtraction = {
      entities: [{ name: 'Alice', entity_type: 'person' }],
      relationships: [
        {
          source: 'Alice',
          target: 'Alice',
          relationship_type: 'self_ref',
        },
      ],
      causal_links: [],
      facts: [],
    };

    vi.mocked(llm.complete)
      .mockResolvedValueOnce(JSON.stringify(extraction1))
      .mockResolvedValueOnce(JSON.stringify(extraction2));

    const chunks = makeChunks(2);
    const fastResult = makeFastResult(2);

    const result = await runSlowPath(
      chunks,
      fastResult,
      CONVERSATION_PROFILE,
      deps,
    );

    expect(result.extractedChunks).toBe(2);
    // Alice should only be counted as created once
    expect(result.entities_created).toBe(1);
  });

  it('should handle empty chunks list', async () => {
    const result = await runSlowPath(
      [],
      makeFastResult(0),
      CONVERSATION_PROFILE,
      deps,
    );

    expect(result.extractedChunks).toBe(0);
    expect(result.skippedChunks).toBe(0);
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('should create cross-links from events to extracted entities', async () => {
    const extraction: ChunkExtraction = {
      entities: [{ name: 'Bob', entity_type: 'person' }],
      relationships: [],
      causal_links: [],
      facts: [],
    };
    vi.mocked(llm.complete).mockResolvedValue(JSON.stringify(extraction));

    const chunks = makeChunks(1);
    const fastResult = makeFastResult(1);

    const result = await runSlowPath(
      chunks,
      fastResult,
      CONVERSATION_PROFILE,
      deps,
    );

    expect(result.cross_links_created).toBeGreaterThan(0);
  });

  it('should pass responseFormat json to LLM', async () => {
    const chunks = makeChunks(1);
    const fastResult = makeFastResult(1);

    await runSlowPath(chunks, fastResult, CONVERSATION_PROFILE, deps);

    expect(llm.complete).toHaveBeenCalledWith(
      expect.objectContaining({ responseFormat: 'json' }),
    );
  });
});
