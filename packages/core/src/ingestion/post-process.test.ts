import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FalkorDBAdapter } from '../storage/falkordb.js';
import {
  checkQuality,
  getQualityMetrics,
  normalizeName,
  runPostProcess,
} from './post-process.js';
import type { IngestionDeps } from './types.js';

function createMockDb(): FalkorDBAdapter {
  return {
    query: vi.fn().mockResolvedValue({ records: [], metadata: [] }),
    createNode: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as FalkorDBAdapter;
}

function makeDeps(db?: FalkorDBAdapter): IngestionDeps {
  return {
    db: db ?? createMockDb(),
    llm: { complete: vi.fn() },
    embeddings: {
      embed: vi.fn(),
      embedBatch: vi.fn(),
    },
  } as unknown as IngestionDeps;
}

// ---------------------------------------------------------------------------
// normalizeName
// ---------------------------------------------------------------------------

describe('normalizeName', () => {
  it('should lowercase', () => {
    expect(normalizeName('Alice')).toBe('alice');
  });

  it('should collapse hyphens to spaces', () => {
    expect(normalizeName('Alice-Smith')).toBe('alice smith');
  });

  it('should collapse underscores to spaces', () => {
    expect(normalizeName('alice_smith')).toBe('alice smith');
  });

  it('should collapse multiple spaces', () => {
    expect(normalizeName('  alice   smith  ')).toBe('alice smith');
  });

  it('should handle mixed separators', () => {
    expect(normalizeName('Alice-Bob_Smith  Jr')).toBe('alice bob smith jr');
  });

  it('should handle empty string', () => {
    expect(normalizeName('')).toBe('');
  });

  it('should handle already normalized name', () => {
    expect(normalizeName('alice')).toBe('alice');
  });
});

// ---------------------------------------------------------------------------
// deduplicateEntities (via runPostProcess)
// ---------------------------------------------------------------------------

describe('deduplicateEntities', () => {
  let db: FalkorDBAdapter;

  beforeEach(() => {
    db = createMockDb();
    vi.clearAllMocks();
  });

  it('should merge duplicate entities with same normalized name and type', async () => {
    vi.mocked(db.query).mockImplementation(async (cypher: string) => {
      // Entity fetch query
      if (
        typeof cypher === 'string' &&
        cypher.includes('MATCH (e:E_Entity)') &&
        cypher.includes('RETURN')
      ) {
        return {
          records: [
            {
              uuid: 'id-1',
              name: 'Alice',
              type: 'person',
              created_at: '2024-01-01T00:00:00Z',
              properties: '{}',
            },
            {
              uuid: 'id-2',
              name: 'alice',
              type: 'person',
              created_at: '2024-01-02T00:00:00Z',
              properties: '{}',
            },
            {
              uuid: 'id-3',
              name: 'Bob',
              type: 'person',
              created_at: '2024-01-01T00:00:00Z',
              properties: '{}',
            },
          ],
          metadata: [],
        };
      }
      return { records: [], metadata: [] };
    });

    const deps = makeDeps(db);
    const result = await runPostProcess(deps);
    expect(result.mergedEntities).toBe(1);
  });

  it('should pick earliest created_at as canonical', async () => {
    vi.mocked(db.query).mockImplementation(async (cypher: string) => {
      if (
        typeof cypher === 'string' &&
        cypher.includes('MATCH (e:E_Entity)') &&
        cypher.includes('RETURN')
      ) {
        return {
          records: [
            {
              uuid: 'newer',
              name: 'Alice',
              type: 'person',
              created_at: '2024-06-01T00:00:00Z',
              properties: '{}',
            },
            {
              uuid: 'older',
              name: 'alice',
              type: 'person',
              created_at: '2024-01-01T00:00:00Z',
              properties: '{}',
            },
          ],
          metadata: [],
        };
      }
      return { records: [], metadata: [] };
    });

    const deps = makeDeps(db);
    await runPostProcess(deps);

    // The DETACH DELETE should target 'newer' (the non-canonical)
    const deleteCalls = vi
      .mocked(db.query)
      .mock.calls.filter(
        ([cypher]) =>
          typeof cypher === 'string' && cypher.includes('DETACH DELETE'),
      );
    expect(deleteCalls.length).toBe(1);
    const params = deleteCalls[0][1] as Record<string, unknown>;
    expect(params.dupId).toBe('newer');
  });

  it('should not merge entities with different types', async () => {
    vi.mocked(db.query).mockImplementation(async (cypher: string) => {
      if (
        typeof cypher === 'string' &&
        cypher.includes('MATCH (e:E_Entity)') &&
        cypher.includes('RETURN')
      ) {
        return {
          records: [
            {
              uuid: 'id-1',
              name: 'Alice',
              type: 'person',
              created_at: '2024-01-01T00:00:00Z',
              properties: '{}',
            },
            {
              uuid: 'id-2',
              name: 'Alice',
              type: 'organization',
              created_at: '2024-01-02T00:00:00Z',
              properties: '{}',
            },
          ],
          metadata: [],
        };
      }
      return { records: [], metadata: [] };
    });

    const deps = makeDeps(db);
    const result = await runPostProcess(deps);
    expect(result.mergedEntities).toBe(0);
  });

  it('should handle no duplicates', async () => {
    vi.mocked(db.query).mockImplementation(async (cypher: string) => {
      if (
        typeof cypher === 'string' &&
        cypher.includes('MATCH (e:E_Entity)') &&
        cypher.includes('RETURN')
      ) {
        return {
          records: [
            {
              uuid: 'id-1',
              name: 'Alice',
              type: 'person',
              created_at: '2024-01-01T00:00:00Z',
              properties: '{}',
            },
            {
              uuid: 'id-2',
              name: 'Bob',
              type: 'person',
              created_at: '2024-01-01T00:00:00Z',
              properties: '{}',
            },
          ],
          metadata: [],
        };
      }
      return { records: [], metadata: [] };
    });

    const deps = makeDeps(db);
    const result = await runPostProcess(deps);
    expect(result.mergedEntities).toBe(0);
  });

  it('should merge properties with canonical winning on conflict', async () => {
    vi.mocked(db.query).mockImplementation(async (cypher: string) => {
      if (
        typeof cypher === 'string' &&
        cypher.includes('MATCH (e:E_Entity)') &&
        cypher.includes('RETURN')
      ) {
        return {
          records: [
            {
              uuid: 'id-1',
              name: 'Alice',
              type: 'person',
              created_at: '2024-01-01T00:00:00Z',
              properties: '{"role":"engineer","team":"alpha"}',
            },
            {
              uuid: 'id-2',
              name: 'alice',
              type: 'person',
              created_at: '2024-01-02T00:00:00Z',
              properties: '{"role":"manager","city":"NYC"}',
            },
          ],
          metadata: [],
        };
      }
      return { records: [], metadata: [] };
    });

    const deps = makeDeps(db);
    await runPostProcess(deps);

    // Verify properties merge — canonical's "role" should win
    const propsCalls = vi
      .mocked(db.query)
      .mock.calls.filter(
        ([cypher]) =>
          typeof cypher === 'string' && cypher.includes('SET e.properties'),
      );
    expect(propsCalls.length).toBe(1);
    const params = propsCalls[0][1] as Record<string, unknown>;
    const merged = JSON.parse(params.props as string);
    expect(merged.role).toBe('engineer'); // canonical wins
    expect(merged.city).toBe('NYC'); // dup's unique key preserved
    expect(merged.team).toBe('alpha'); // canonical's unique key preserved
  });

  it('should merge hyphen vs underscore variants', async () => {
    vi.mocked(db.query).mockImplementation(async (cypher: string) => {
      if (
        typeof cypher === 'string' &&
        cypher.includes('MATCH (e:E_Entity)') &&
        cypher.includes('RETURN')
      ) {
        return {
          records: [
            {
              uuid: 'id-1',
              name: 'auth-service',
              type: 'service',
              created_at: '2024-01-01T00:00:00Z',
              properties: '{}',
            },
            {
              uuid: 'id-2',
              name: 'auth_service',
              type: 'service',
              created_at: '2024-01-02T00:00:00Z',
              properties: '{}',
            },
          ],
          metadata: [],
        };
      }
      return { records: [], metadata: [] };
    });

    const deps = makeDeps(db);
    const result = await runPostProcess(deps);
    expect(result.mergedEntities).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// resolveFactConflicts (via runPostProcess)
// ---------------------------------------------------------------------------

describe('resolveFactConflicts', () => {
  let db: FalkorDBAdapter;

  beforeEach(() => {
    db = createMockDb();
    vi.clearAllMocks();
  });

  it('should cap earlier fact valid_to when later fact overlaps', async () => {
    vi.mocked(db.query).mockImplementation(async (cypher: string) => {
      if (
        typeof cypher === 'string' &&
        cypher.includes('f1.valid_from < f2.valid_from')
      ) {
        return {
          records: [
            {
              f1_uuid: 'fact-1',
              f2_valid_from: '2024-06-01T00:00:00Z',
            },
          ],
          metadata: [],
        };
      }
      return { records: [], metadata: [] };
    });

    const deps = makeDeps(db);
    const result = await runPostProcess(deps);
    expect(result.factsWithUpdatedValidity).toBe(1);

    // Verify SET was called with correct valid_to
    const setCalls = vi
      .mocked(db.query)
      .mock.calls.filter(
        ([cypher]) =>
          typeof cypher === 'string' && cypher.includes('SET f.valid_to'),
      );
    expect(setCalls.length).toBe(1);
    const params = setCalls[0][1] as Record<string, unknown>;
    expect(params.validTo).toBe('2024-06-01T00:00:00Z');
  });

  it('should handle no overlapping facts', async () => {
    const deps = makeDeps(db);
    const result = await runPostProcess(deps);
    expect(result.factsWithUpdatedValidity).toBe(0);
  });

  it('should deduplicate updates for same fact appearing in multiple pairs', async () => {
    vi.mocked(db.query).mockImplementation(async (cypher: string) => {
      if (
        typeof cypher === 'string' &&
        cypher.includes('f1.valid_from < f2.valid_from')
      ) {
        return {
          records: [
            { f1_uuid: 'fact-1', f2_valid_from: '2024-06-01T00:00:00Z' },
            { f1_uuid: 'fact-1', f2_valid_from: '2024-07-01T00:00:00Z' },
          ],
          metadata: [],
        };
      }
      return { records: [], metadata: [] };
    });

    const deps = makeDeps(db);
    const result = await runPostProcess(deps);

    // Should only update fact-1 once (first match)
    expect(result.factsWithUpdatedValidity).toBe(1);
    const setCalls = vi
      .mocked(db.query)
      .mock.calls.filter(
        ([cypher]) =>
          typeof cypher === 'string' && cypher.includes('SET f.valid_to'),
      );
    expect(setCalls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// cleanupOrphans (via runPostProcess)
// ---------------------------------------------------------------------------

describe('cleanupOrphans', () => {
  let db: FalkorDBAdapter;

  beforeEach(() => {
    db = createMockDb();
    vi.clearAllMocks();
  });

  it('should delete entities with zero edges', async () => {
    vi.mocked(db.query).mockImplementation(async (cypher: string) => {
      if (
        typeof cypher === 'string' &&
        cypher.includes('NOT (e)-[:E_RELATES]') &&
        cypher.includes('count')
      ) {
        return { records: [{ orphanCount: 3 }], metadata: [] };
      }
      return { records: [], metadata: [] };
    });

    const deps = makeDeps(db);
    const result = await runPostProcess(deps);
    expect(result.orphanedLinksRemoved).toBe(3);

    // Verify DELETE was called
    const deleteCalls = vi
      .mocked(db.query)
      .mock.calls.filter(
        ([cypher]) =>
          typeof cypher === 'string' &&
          cypher.includes('NOT (e)-[:E_RELATES]') &&
          cypher.includes('DELETE'),
      );
    expect(deleteCalls.length).toBe(1);
  });

  it('should skip delete when no orphans exist', async () => {
    vi.mocked(db.query).mockImplementation(async (cypher: string) => {
      if (
        typeof cypher === 'string' &&
        cypher.includes('NOT (e)-[:E_RELATES]') &&
        cypher.includes('count')
      ) {
        return { records: [{ orphanCount: 0 }], metadata: [] };
      }
      return { records: [], metadata: [] };
    });

    const deps = makeDeps(db);
    const result = await runPostProcess(deps);
    expect(result.orphanedLinksRemoved).toBe(0);

    // DELETE should NOT be called
    const deleteCalls = vi
      .mocked(db.query)
      .mock.calls.filter(
        ([cypher]) =>
          typeof cypher === 'string' &&
          cypher.includes('NOT (e)-[:E_RELATES]') &&
          cypher.includes('DELETE e'),
      );
    expect(deleteCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// checkQuality
// ---------------------------------------------------------------------------

describe('checkQuality', () => {
  it('should warn when entity count < 3', () => {
    const warnings = checkQuality(2, 10, 0, 0, 3);
    expect(warnings.some((w) => w.includes('Low entity count'))).toBe(true);
  });

  it('should warn when entity count > 2x chunks', () => {
    const warnings = checkQuality(30, 10, 0, 0, 3);
    expect(warnings.some((w) => w.includes('High entity count'))).toBe(true);
  });

  it('should warn when >20% chunks failed extraction', () => {
    const warnings = checkQuality(5, 10, 3, 0, 3);
    expect(warnings.some((w) => w.includes('failure rate'))).toBe(true);
  });

  it('should warn when max causal depth < 2 and enough entities', () => {
    const warnings = checkQuality(5, 10, 0, 0, 1);
    expect(warnings.some((w) => w.includes('Shallow causal'))).toBe(true);
  });

  it('should not warn about causal depth when few entities', () => {
    const warnings = checkQuality(3, 10, 0, 0, 0);
    expect(warnings.some((w) => w.includes('Shallow causal'))).toBe(false);
  });

  it('should warn when >30% disconnected', () => {
    const warnings = checkQuality(10, 10, 0, 0.4, 3);
    expect(warnings.some((w) => w.includes('disconnection'))).toBe(true);
  });

  it('should return empty array when all checks pass', () => {
    const warnings = checkQuality(5, 10, 1, 0.1, 3);
    expect(warnings).toEqual([]);
  });

  it('should handle 0 chunks without division errors', () => {
    const warnings = checkQuality(0, 0, 0, 0, 0);
    expect(warnings).toBeInstanceOf(Array);
  });
});

// ---------------------------------------------------------------------------
// getQualityMetrics
// ---------------------------------------------------------------------------

describe('getQualityMetrics', () => {
  let db: FalkorDBAdapter;

  beforeEach(() => {
    db = createMockDb();
    vi.clearAllMocks();
  });

  it('should return entity count, disconnected ratio, and max causal depth', async () => {
    vi.mocked(db.query).mockImplementation(async (cypher: string) => {
      if (
        typeof cypher === 'string' &&
        cypher.includes('MATCH (e:E_Entity)') &&
        cypher.includes('count(e)') &&
        !cypher.includes('NOT')
      ) {
        return { records: [{ cnt: 10 }], metadata: [] };
      }
      // Disconnection check: entities not anchored via X_INVOLVES
      if (
        typeof cypher === 'string' &&
        cypher.includes('NOT (e)<-[:X_INVOLVES]')
      ) {
        return { records: [{ cnt: 3 }], metadata: [] };
      }
      if (typeof cypher === 'string' && cypher.includes('C_CAUSES')) {
        return { records: [{ maxDepth: 4 }], metadata: [] };
      }
      return { records: [], metadata: [] };
    });

    const deps = makeDeps(db);
    const metrics = await getQualityMetrics(deps);

    expect(metrics.entityCount).toBe(10);
    expect(metrics.disconnectedRatio).toBeCloseTo(0.3);
    expect(metrics.maxCausalDepth).toBe(4);
  });

  it('should handle empty graph', async () => {
    const deps = makeDeps(db);
    const metrics = await getQualityMetrics(deps);

    expect(metrics.entityCount).toBe(0);
    expect(metrics.disconnectedRatio).toBe(0);
    expect(metrics.maxCausalDepth).toBe(0);
  });
});
