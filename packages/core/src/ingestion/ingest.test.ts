import type { EmbeddingProvider, LLMProvider } from '@polyg-mcp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import { ingest } from './index.js';
import type { ChunkExtraction, IngestionDeps } from './types.js';

// ---------------------------------------------------------------------------
// Mock setup — combines fast path + slow path + post-process query handling
// ---------------------------------------------------------------------------

function createMockDb(): FalkorDBAdapter {
  let nodeCounter = 0;
  const createdNodes = new Map<
    string,
    { uuid: string; label: string; props: Record<string, unknown> }
  >();

  const mockQuery = vi
    .fn()
    .mockImplementation(
      async (cypher: string, params?: Record<string, unknown>) => {
        // Entity lookup by UUID (used by getEntity → linkEntities)
        if (
          typeof cypher === 'string' &&
          cypher.includes('E_Entity') &&
          cypher.includes('{uuid: $id}')
        ) {
          const id = params?.id as string;
          const node = createdNodes.get(id);
          if (node) {
            return {
              records: [
                { n: { properties: { uuid: node.uuid, ...node.props } } },
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
          const name = params?.name as string;
          const type = params?.entityType as string;
          for (const node of createdNodes.values()) {
            if (
              node.label === 'E_Entity' &&
              node.props.name === name &&
              node.props.entity_type === type
            ) {
              return {
                records: [
                  { n: { properties: { uuid: node.uuid, ...node.props } } },
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
          const desc = params?.desc as string;
          for (const node of createdNodes.values()) {
            if (
              node.label === 'C_Node' &&
              (node.props.description as string).toLowerCase() ===
                desc?.toLowerCase()
            ) {
              return {
                records: [
                  { n: { properties: { uuid: node.uuid, ...node.props } } },
                ],
                metadata: [],
              };
            }
          }
        }

        // Post-process: entity fetch for dedup
        if (
          typeof cypher === 'string' &&
          cypher.includes('MATCH (e:E_Entity)') &&
          cypher.includes('e.uuid AS uuid')
        ) {
          const entities: Record<string, unknown>[] = [];
          for (const node of createdNodes.values()) {
            if (node.label === 'E_Entity') {
              entities.push({
                uuid: node.uuid,
                name: node.props.name as string,
                type: node.props.entity_type as string,
                created_at: node.props.created_at as string,
                properties: (node.props.properties as string) ?? '{}',
              });
            }
          }
          return { records: entities, metadata: [] };
        }

        // Post-process: entity count
        if (
          typeof cypher === 'string' &&
          cypher.includes('MATCH (e:E_Entity)') &&
          cypher.includes('count(e)')
        ) {
          let cnt = 0;
          for (const node of createdNodes.values()) {
            if (node.label === 'E_Entity') cnt++;
          }
          return { records: [{ cnt }], metadata: [] };
        }

        // Post-process: causal depth
        if (typeof cypher === 'string' && cypher.includes('C_CAUSES*')) {
          return { records: [{ maxDepth: 0 }], metadata: [] };
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
    embedBatch: vi
      .fn()
      .mockImplementation((texts: string[]) =>
        Promise.resolve(texts.map((_, i) => [0.1 * (i + 1), 0.2 * (i + 1)])),
      ),
  };
}

const validExtraction: ChunkExtraction = {
  entities: [
    { name: 'Alice', entity_type: 'person' },
    { name: 'Bob', entity_type: 'person' },
  ],
  relationships: [
    { source: 'Alice', target: 'Bob', relationship_type: 'knows' },
  ],
  causal_links: [],
  facts: [],
};

function makeDeps(overrides?: { llm?: LLMProvider }): IngestionDeps {
  const db = createMockDb();
  return {
    db,
    embeddings: createMockEmbeddings(),
    llm:
      overrides?.llm ??
      ({
        complete: vi.fn().mockResolvedValue(JSON.stringify(validExtraction)),
      } as unknown as LLMProvider),
  };
}

// Valid 5-turn conversation JSON
function makeFiveTurnConversation(): string {
  return JSON.stringify([
    {
      speaker: 'Alice',
      text: 'Hey Bob, how are you?',
      timestamp: '2024-01-15T10:00:00Z',
    },
    {
      speaker: 'Bob',
      text: 'Good! Just got back from Paris.',
      timestamp: '2024-01-15T10:01:00Z',
    },
    {
      speaker: 'Alice',
      text: 'Nice! Did you visit the Louvre?',
      timestamp: '2024-01-15T10:02:00Z',
    },
    {
      speaker: 'Bob',
      text: 'Yes! The Mona Lisa was amazing.',
      timestamp: '2024-01-15T10:03:00Z',
    },
    {
      speaker: 'Alice',
      text: 'I work at Acme Corp now.',
      timestamp: '2024-01-15T10:04:00Z',
    },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should complete full pipeline with 5-turn conversation', async () => {
    const deps = makeDeps();
    const report = await ingest({ content: makeFiveTurnConversation() }, deps);

    expect(report.status).toMatch(/^completed/);
    expect(report.chunks.total).toBe(5);
    expect(report.chunks.parsed).toBe(5);
    expect(report.chunks.fast_path_written).toBe(5);
    expect(report.graph.events_created).toBe(5);
    expect(report.graph.concepts_created).toBe(5);
    expect(report.timing.total_ms).toBeGreaterThanOrEqual(0);
    expect(report.timing.parse_ms).toBeGreaterThanOrEqual(0);
    expect(report.timing.fast_path_ms).toBeGreaterThanOrEqual(0);
    expect(report.timing.slow_path_ms).toBeGreaterThanOrEqual(0);
    expect(report.timing.post_process_ms).toBeGreaterThanOrEqual(0);
    expect(report.cost.embedding_calls).toBe(1);
  });

  it('should return failed status for empty content', async () => {
    const deps = makeDeps();
    const report = await ingest({ content: '' }, deps);

    expect(report.status).toBe('failed');
    expect(report.quality_warnings).toContainEqual(
      expect.stringContaining('Empty content'),
    );
    expect(report.chunks.total).toBe(0);
  });

  it('should return failed status for whitespace-only content', async () => {
    const deps = makeDeps();
    const report = await ingest({ content: '   \n  ' }, deps);

    expect(report.status).toBe('failed');
  });

  it('should return failed when parser throws', async () => {
    const deps = makeDeps();
    // Force conversation format on invalid JSON → parser throws
    const report = await ingest(
      { content: '[{invalid json}]', format: 'conversation' },
      deps,
    );

    expect(report.status).toBe('failed');
    expect(
      report.quality_warnings.some((w) => w.includes('Parse failed')),
    ).toBe(true);
  });

  it('should populate all IngestionReport fields', async () => {
    const deps = makeDeps();
    const report = await ingest({ content: makeFiveTurnConversation() }, deps);

    // Chunks section
    expect(typeof report.chunks.total).toBe('number');
    expect(typeof report.chunks.parsed).toBe('number');
    expect(typeof report.chunks.fast_path_written).toBe('number');
    expect(typeof report.chunks.slow_path_extracted).toBe('number');
    expect(typeof report.chunks.slow_path_skipped).toBe('number');

    // Graph section
    expect(typeof report.graph.entities_created).toBe('number');
    expect(typeof report.graph.events_created).toBe('number');
    expect(typeof report.graph.facts_created).toBe('number');
    expect(typeof report.graph.concepts_created).toBe('number');
    expect(typeof report.graph.causal_nodes_created).toBe('number');
    expect(typeof report.graph.causal_links_created).toBe('number');
    expect(typeof report.graph.cross_links_created).toBe('number');
    expect(typeof report.graph.relationships_created).toBe('number');

    // Dedup section
    expect(typeof report.deduplication.mergedEntities).toBe('number');
    expect(typeof report.deduplication.mergedCausalNodes).toBe('number');
    expect(typeof report.deduplication.factsWithUpdatedValidity).toBe('number');
    expect(typeof report.deduplication.orphanedLinksRemoved).toBe('number');

    // Cost section
    expect(typeof report.cost.profiler_calls).toBe('number');
    expect(typeof report.cost.extraction_calls).toBe('number');
    expect(typeof report.cost.embedding_calls).toBe('number');
    expect(typeof report.cost.total_llm_calls).toBe('number');

    // Timing section
    expect(typeof report.timing.parse_ms).toBe('number');
    expect(typeof report.timing.profile_ms).toBe('number');
    expect(typeof report.timing.fast_path_ms).toBe('number');
    expect(typeof report.timing.slow_path_ms).toBe('number');
    expect(typeof report.timing.post_process_ms).toBe('number');
    expect(typeof report.timing.total_ms).toBe('number');
  });

  it('should bubble slow path warnings to quality_warnings', async () => {
    const llm = {
      complete: vi
        .fn()
        // First call: profiler (returns invalid profile → falls back to default)
        .mockResolvedValueOnce(JSON.stringify({ bad: 'profile' }))
        // Chunk 0 attempt 1: fail
        .mockRejectedValueOnce(new Error('LLM timeout'))
        // Chunk 0 attempt 2 (retry): fail → chunk skipped
        .mockRejectedValueOnce(new Error('LLM timeout'))
        // Remaining chunks: succeed
        .mockResolvedValue(JSON.stringify(validExtraction)),
    } as unknown as LLMProvider;

    const deps = makeDeps({ llm });
    const report = await ingest({ content: makeFiveTurnConversation() }, deps);

    expect(report.status).toBe('completed_with_warnings');
    expect(report.quality_warnings.some((w) => w.includes('LLM timeout'))).toBe(
      true,
    );
    expect(report.chunks.slow_path_skipped).toBe(1);
    expect(report.chunks.slow_path_extracted).toBe(4);
  });

  it('should accept profileOverride', async () => {
    const deps = makeDeps();
    const customProfile = {
      document_type: 'technical',
      domain: 'engineering',
      entity_types_expected: ['component'],
      relationship_types_expected: ['depends_on'],
      causal_patterns: ['failure → outage'],
      temporal_structure: 'explicit_timestamps' as const,
      extraction_focus: 'Focus on components.',
      confidence_calibration: {
        explicit_causation: 1.0,
        strong_implication: 0.9,
        weak_inference: 0.7,
      },
    };

    const report = await ingest(
      { content: makeFiveTurnConversation(), profileOverride: customProfile },
      deps,
    );
    expect(report.status).toMatch(/^completed/);
  });

  it('should report extraction_calls as extracted + skipped chunks', async () => {
    const deps = makeDeps();
    const report = await ingest({ content: makeFiveTurnConversation() }, deps);

    expect(report.cost.extraction_calls).toBe(
      report.chunks.slow_path_extracted + report.chunks.slow_path_skipped,
    );
  });

  it('should track graph stats from slow path', async () => {
    const deps = makeDeps();
    const report = await ingest({ content: makeFiveTurnConversation() }, deps);

    // Each of 5 chunks produces 2 entities, 1 relationship from validExtraction
    expect(report.graph.entities_created).toBeGreaterThan(0);
    expect(report.graph.relationships_created).toBeGreaterThan(0);
  });

  it('should handle format override', async () => {
    const deps = makeDeps();
    const report = await ingest(
      { content: makeFiveTurnConversation(), format: 'conversation' },
      deps,
    );

    expect(report.status).toMatch(/^completed/);
    expect(report.chunks.total).toBe(5);
  });

  // --- Phase 2: Text + Structured + Profiler ---

  it('should ingest plain text content', async () => {
    const deps = makeDeps();
    const text = 'First paragraph about Alice.\n\nSecond paragraph about Bob.';
    const report = await ingest({ content: text, format: 'text' }, deps);

    expect(report.status).toMatch(/^completed/);
    expect(report.chunks.total).toBe(1); // small text fits in 1 chunk
    expect(report.chunks.fast_path_written).toBe(1);
  });

  it('should auto-detect and ingest plain text', async () => {
    const deps = makeDeps();
    const text = 'This is a plain text document about technology and science.';
    const report = await ingest({ content: text }, deps);

    expect(report.status).toMatch(/^completed/);
    expect(report.chunks.total).toBeGreaterThan(0);
  });

  it('should ingest structured JSON content', async () => {
    const deps = makeDeps();
    const data = JSON.stringify([
      { id: 1, type: 'event', message: 'login' },
      { id: 2, type: 'event', message: 'logout' },
    ]);
    const report = await ingest({ content: data, format: 'structured' }, deps);

    expect(report.status).toMatch(/^completed/);
    expect(report.chunks.total).toBe(2);
    expect(report.chunks.fast_path_written).toBe(2);
  });

  it('should set profiler_calls=1 when no profileOverride', async () => {
    const deps = makeDeps();
    const report = await ingest({ content: makeFiveTurnConversation() }, deps);

    expect(report.cost.profiler_calls).toBe(1);
    expect(report.cost.total_llm_calls).toBe(
      report.cost.profiler_calls + report.cost.extraction_calls,
    );
  });

  it('should set profiler_calls=0 when profileOverride provided', async () => {
    const deps = makeDeps();
    const customProfile = {
      document_type: 'technical',
      domain: 'engineering',
      entity_types_expected: ['component'],
      relationship_types_expected: ['depends_on'],
      causal_patterns: ['failure → outage'],
      temporal_structure: 'explicit_timestamps' as const,
      extraction_focus: 'Focus on components.',
      confidence_calibration: {
        explicit_causation: 1.0,
        strong_implication: 0.9,
        weak_inference: 0.7,
      },
    };

    const report = await ingest(
      { content: makeFiveTurnConversation(), profileOverride: customProfile },
      deps,
    );

    expect(report.cost.profiler_calls).toBe(0);
    expect(report.cost.total_llm_calls).toBe(report.cost.extraction_calls);
  });
});
