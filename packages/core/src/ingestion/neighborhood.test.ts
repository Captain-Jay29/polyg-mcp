import type { EmbeddingProvider } from '@polyg-mcp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import { gather2HopNeighborhood } from './neighborhood.js';
import type { IngestionDeps } from './types.js';

function createMockDb(): FalkorDBAdapter {
  return {
    query: vi.fn().mockResolvedValue({ records: [], metadata: [] }),
    createNode: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as FalkorDBAdapter;
}

function createMockEmbeddings(): EmbeddingProvider {
  return {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  };
}

describe('gather2HopNeighborhood', () => {
  let db: FalkorDBAdapter;
  let deps: IngestionDeps;

  beforeEach(() => {
    db = createMockDb();
    deps = {
      db,
      embeddings: createMockEmbeddings(),
      llm: { complete: vi.fn() },
    } as unknown as IngestionDeps;
    vi.clearAllMocks();
  });

  it('should return empty neighborhood when no recent events exist', async () => {
    const result = await gather2HopNeighborhood('concept-1', deps, [], 0);

    expect(result.knownEntities).toHaveLength(0);
    expect(result.recentEvents).toHaveLength(0);
    expect(result.activeCausalChains).toHaveLength(0);
    expect(result.similarConcepts).toHaveLength(0);
  });

  it('should window to previous 5 events', async () => {
    const eventIds = Array.from({ length: 10 }, (_, i) => `event-${i}`);

    await gather2HopNeighborhood('concept-7', deps, eventIds, 7);

    // Should query with event IDs from position 2 through 7 (6 events)
    const queryCalls = vi.mocked(db.query).mock.calls;
    // First call is for known entities
    const entityQuery = queryCalls.find(
      ([cypher]) => typeof cypher === 'string' && cypher.includes('X_INVOLVES'),
    );
    if (!entityQuery) throw new Error('entityQuery not found');
    const params = entityQuery[1] as Record<string, unknown>;
    const passedIds = params.eventIds as string[];
    expect(passedIds).toHaveLength(6); // positions 2-7
    expect(passedIds[0]).toBe('event-2');
    expect(passedIds[5]).toBe('event-7');
  });

  it('should handle position 0 gracefully', async () => {
    const eventIds = ['event-0'];

    const result = await gather2HopNeighborhood('concept-0', deps, eventIds, 0);

    // Should still work with just the current event
    expect(result).toBeDefined();
    expect(result.knownEntities).toHaveLength(0);
  });

  it('should return entities from DB query', async () => {
    vi.mocked(db.query).mockImplementation(async (cypher: string) => {
      if (
        typeof cypher === 'string' &&
        cypher.includes('X_INVOLVES') &&
        cypher.includes('E_RELATES')
      ) {
        return {
          records: [
            { uuid: 'ent-1', name: 'Alice', type: 'person' },
            { uuid: 'ent-2', name: 'Acme Corp', type: 'organization' },
          ],
          metadata: [],
        };
      }
      return { records: [], metadata: [] };
    });

    const result = await gather2HopNeighborhood(
      'concept-0',
      deps,
      ['event-0'],
      0,
    );

    expect(result.knownEntities).toHaveLength(2);
    expect(result.knownEntities[0].name).toBe('Alice');
    expect(result.knownEntities[1].name).toBe('Acme Corp');
  });

  it('should return recent events from DB query', async () => {
    vi.mocked(db.query).mockImplementation(async (cypher: string) => {
      if (
        typeof cypher === 'string' &&
        cypher.includes('e.description') &&
        cypher.includes('ORDER BY')
      ) {
        return {
          records: [
            {
              description: 'Alice said hello',
              occurred_at: '2024-01-15T10:00:00Z',
            },
          ],
          metadata: [],
        };
      }
      return { records: [], metadata: [] };
    });

    const result = await gather2HopNeighborhood(
      'concept-0',
      deps,
      ['event-0'],
      0,
    );

    expect(result.recentEvents).toHaveLength(1);
    expect(result.recentEvents[0].description).toBe('Alice said hello');
  });

  it('should gracefully handle DB query failures', async () => {
    vi.mocked(db.query).mockRejectedValue(new Error('DB connection failed'));

    const warnings: string[] = [];
    const result = await gather2HopNeighborhood(
      'concept-0',
      deps,
      ['event-0'],
      0,
      warnings,
    );

    // Should return empty results, not throw
    expect(result.knownEntities).toHaveLength(0);
    expect(result.recentEvents).toHaveLength(0);
    expect(result.activeCausalChains).toHaveLength(0);
    expect(result.similarConcepts).toHaveLength(0);

    // Should populate warnings with descriptive messages
    expect(warnings.length).toBeGreaterThanOrEqual(3);
    expect(warnings.some((w) => w.includes('known entities'))).toBe(true);
    expect(warnings.some((w) => w.includes('recent events'))).toBe(true);
    expect(warnings.some((w) => w.includes('DB connection failed'))).toBe(true);
  });

  it('should run all gather queries in parallel', async () => {
    const callOrder: string[] = [];
    vi.mocked(db.query).mockImplementation(async (cypher: string) => {
      if (typeof cypher === 'string') {
        if (cypher.includes('E_RELATES')) callOrder.push('entities');
        if (cypher.includes('ORDER BY')) callOrder.push('events');
        if (cypher.includes('X_AFFECTS')) callOrder.push('causal-entity');
      }
      return { records: [], metadata: [] };
    });

    await gather2HopNeighborhood('concept-0', deps, ['event-0'], 0);

    // All queries should have been initiated (parallel via Promise.all)
    expect(callOrder.length).toBeGreaterThanOrEqual(2);
  });
});
